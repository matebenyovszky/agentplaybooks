-- Record every change to who can do what, and to what agents are told, in the
-- audit trail — from the database, so no write path can skip it.
--
-- Until now the trail held vault operations and federated calls only. Turning
-- a playbook public, issuing or revoking an API key, adding a collaborator,
-- pointing an MCP server somewhere else or rewriting a skill left no trace.
-- These writes happen in some forty places across the REST API, the MCP tools
-- and the management API, and owners can also write some of these tables
-- directly through the Data API. A trigger on each table is the one place all
-- of them pass through.
--
-- Recorded tables and operations:
--
--   playbooks               playbook.create / playbook.update / playbook.visibility / playbook.delete
--   skills                  skill.create / skill.update / skill.delete
--   mcp_servers             mcp_server.create / mcp_server.update / mcp_server.delete
--   api_keys                api_key.create / api_key.update / api_key.rotate / api_key.revoke / api_key.delete
--   playbook_collaborators  collaborator.invite / collaborator.accept / collaborator.update / collaborator.remove
--
-- `target` names the object and the columns that changed. Values are recorded
-- only for access-control columns (visibility, role, permissions, is_active,
-- expires_at); content such as instructions or skill bodies is not copied into
-- the trail, and key hashes and invite token hashes never are.
--
-- The actor:
--
--   * a write through the Data API with a user's own JWT is that user;
--   * a write by the application (service_role) carries the actor the app
--     authenticated, in the `x-apb-actor` request header (`type:id`); the
--     header is trusted only from service_role, so a user cannot claim to be
--     someone else;
--   * anything else (an operator in psql, a migration) is `system` and the
--     database role.
--
-- Bookkeeping columns (updated_at, star_count, last_used_at, a server's cached
-- tool list) do not produce events. Children deleted by a cascade from a
-- deleted playbook do not either: the playbook.delete row covers them.

BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE SCHEMA IF NOT EXISTS audit_private;

CREATE OR REPLACE FUNCTION audit_private.request_actor(OUT actor_type text, OUT actor_id text, OUT request_id text)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  claims json := nullif(current_setting('request.jwt.claims', true), '')::json;
  headers json := nullif(current_setting('request.headers', true), '')::json;
  claimed text;
BEGIN
  request_id := left(COALESCE(headers ->> 'x-apb-request-id', headers ->> 'x-request-id', headers ->> 'cf-ray'), 128);
  IF claims ->> 'role' = 'service_role' THEN
    claimed := headers ->> 'x-apb-actor';
    IF claimed IS NOT NULL AND position(':' IN claimed) > 1 THEN
      actor_type := left(split_part(claimed, ':', 1), 32);
      actor_id := nullif(left(substr(claimed, position(':' IN claimed) + 1), 128), '');
      RETURN;
    END IF;
    actor_type := 'system';
    actor_id := 'service_role';
    RETURN;
  END IF;
  IF claims ->> 'sub' IS NOT NULL THEN
    actor_type := 'owner';
    actor_id := left(claims ->> 'sub', 128);
    RETURN;
  END IF;
  actor_type := 'system';
  actor_id := current_user::text;
END;
$$;

CREATE OR REPLACE FUNCTION audit_private.record_config_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  entity text;
  ignored text[];
  shown text[];
  old_row jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  new_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  row_data jsonb := COALESCE(new_row, old_row);
  changed text[] := ARRAY[]::text[];
  details text[] := ARRAY[]::text[];
  col text;
  op text;
  label text;
  playbook uuid;
  actor record;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'playbooks' THEN
      entity := 'playbook';
      ignored := ARRAY['updated_at', 'star_count', 'created_at'];
      shown := ARRAY['visibility'];
      playbook := (row_data ->> 'id')::uuid;
      label := row_data ->> 'guid';
    WHEN 'skills' THEN
      entity := 'skill';
      ignored := ARRAY['created_at'];
      shown := ARRAY[]::text[];
      playbook := (row_data ->> 'playbook_id')::uuid;
      label := row_data ->> 'name';
    WHEN 'mcp_servers' THEN
      entity := 'mcp_server';
      ignored := ARRAY['tools', 'resources', 'created_at'];
      shown := ARRAY['transport_type'];
      playbook := (row_data ->> 'playbook_id')::uuid;
      label := row_data ->> 'name';
    WHEN 'api_keys' THEN
      entity := 'api_key';
      ignored := ARRAY['last_used_at', 'created_at'];
      shown := ARRAY['role', 'permissions', 'is_active', 'expires_at'];
      playbook := (row_data ->> 'playbook_id')::uuid;
      label := row_data ->> 'key_prefix';
    WHEN 'playbook_collaborators' THEN
      entity := 'collaborator';
      ignored := ARRAY['created_at'];
      shown := ARRAY['role'];
      playbook := (row_data ->> 'playbook_id')::uuid;
      label := COALESCE(row_data ->> 'user_id', 'pending-invite');
    ELSE
      RETURN NULL;
  END CASE;

  -- A child removed because its playbook was deleted: playbook.delete covers
  -- it. AFTER triggers run once the cascade is complete, so the playbook is
  -- already gone when the child's trigger fires.
  IF TG_OP = 'DELETE' AND entity <> 'playbook'
     AND NOT EXISTS (SELECT 1 FROM public.playbooks p WHERE p.id = playbook) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR col IN SELECT jsonb_object_keys(new_row) LOOP
      CONTINUE WHEN col = ANY(ignored);
      IF new_row -> col IS DISTINCT FROM old_row -> col THEN
        changed := changed || col;
        IF col = ANY(shown) THEN
          details := details || format('%s=%s->%s', col, COALESCE(old_row ->> col, 'null'), COALESCE(new_row ->> col, 'null'));
        END IF;
      END IF;
    END LOOP;
    IF cardinality(changed) = 0 THEN
      RETURN NULL;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    FOREACH col IN ARRAY shown LOOP
      IF new_row ? col THEN
        details := details || format('%s=%s', col, COALESCE(new_row ->> col, 'null'));
      END IF;
    END LOOP;
  END IF;

  op := entity || CASE TG_OP
    WHEN 'INSERT' THEN CASE entity WHEN 'collaborator' THEN '.invite' ELSE '.create' END
    WHEN 'DELETE' THEN CASE entity WHEN 'collaborator' THEN '.remove' ELSE '.delete' END
    ELSE '.update'
  END;
  IF TG_OP = 'UPDATE' THEN
    IF entity = 'playbook' AND 'visibility' = ANY(changed) THEN
      op := 'playbook.visibility';
    ELSIF entity = 'api_key' AND 'key_hash' = ANY(changed) THEN
      op := 'api_key.rotate';
    ELSIF entity = 'api_key' AND (old_row ->> 'is_active')::boolean AND NOT (new_row ->> 'is_active')::boolean THEN
      op := 'api_key.revoke';
    ELSIF entity = 'collaborator' AND old_row ->> 'accepted_at' IS NULL AND new_row ->> 'accepted_at' IS NOT NULL THEN
      op := 'collaborator.accept';
    END IF;
  END IF;

  SELECT * INTO actor FROM audit_private.request_actor();

  INSERT INTO public.audit_logs (playbook_id, operation, target, status, actor_type, actor_id, request_id)
  VALUES (
    playbook,
    op,
    left(concat_ws(' ',
      entity || ':' || COALESCE(label, row_data ->> 'id'),
      CASE WHEN cardinality(changed) > 0 THEN 'changed=' || array_to_string(changed, ',') END,
      CASE WHEN cardinality(details) > 0 THEN array_to_string(details, ' ') END
    ), 500),
    'success',
    actor.actor_type,
    actor.actor_id,
    actor.request_id
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION audit_private.request_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION audit_private.record_config_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_config_change ON public.playbooks;
CREATE TRIGGER audit_config_change
  AFTER INSERT OR UPDATE OR DELETE ON public.playbooks
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_config_change();

DROP TRIGGER IF EXISTS audit_config_change ON public.skills;
CREATE TRIGGER audit_config_change
  AFTER INSERT OR UPDATE OR DELETE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_config_change();

DROP TRIGGER IF EXISTS audit_config_change ON public.mcp_servers;
CREATE TRIGGER audit_config_change
  AFTER INSERT OR UPDATE OR DELETE ON public.mcp_servers
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_config_change();

DROP TRIGGER IF EXISTS audit_config_change ON public.api_keys;
CREATE TRIGGER audit_config_change
  AFTER INSERT OR UPDATE OR DELETE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_config_change();

DROP TRIGGER IF EXISTS audit_config_change ON public.playbook_collaborators;
CREATE TRIGGER audit_config_change
  AFTER INSERT OR UPDATE OR DELETE ON public.playbook_collaborators
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_config_change();

COMMIT;
