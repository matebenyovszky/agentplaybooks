-- Record memory and canvas writes in the audit trail from the database, so
-- REST, MCP and Data API paths cannot skip them. Bodies are not copied:
-- target is the memory key or canvas slug, plus which columns changed.
--
-- Independent of 20261025130000_audit_config_changes.sql (playbooks, skills,
-- mcp_servers, api_keys, collaborators). Same actor helper: JWT subject, or
-- x-apb-actor from service_role, otherwise system.
--
-- Idempotent: CREATE OR REPLACE / DROP TRIGGER IF EXISTS.
-- Existing memories and canvas rows are not rewritten. The hash chain only
-- grows with new audit_logs inserts; previously hashed rows are untouched.

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

CREATE OR REPLACE FUNCTION audit_private.record_content_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  entity text;
  ignored text[];
  old_row jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  new_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  row_data jsonb := COALESCE(new_row, old_row);
  changed text[] := ARRAY[]::text[];
  col text;
  op text;
  label text;
  playbook uuid;
  actor record;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'memories' THEN
      entity := 'memory';
      ignored := ARRAY['access_count', 'last_accessed_at', 'updated_at', 'search_text'];
      playbook := (row_data ->> 'playbook_id')::uuid;
      label := row_data ->> 'key';
    WHEN 'canvas' THEN
      entity := 'canvas';
      ignored := ARRAY['updated_at'];
      playbook := (row_data ->> 'playbook_id')::uuid;
      label := row_data ->> 'slug';
    ELSE
      RETURN NULL;
  END CASE;

  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM public.playbooks p WHERE p.id = playbook) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR col IN SELECT jsonb_object_keys(new_row) LOOP
      CONTINUE WHEN col = ANY(ignored);
      IF new_row -> col IS DISTINCT FROM old_row -> col THEN
        changed := changed || col;
      END IF;
    END LOOP;
    IF cardinality(changed) = 0 THEN
      RETURN NULL;
    END IF;
  END IF;

  op := entity || CASE TG_OP
    WHEN 'INSERT' THEN '.create'
    WHEN 'DELETE' THEN '.delete'
    ELSE '.update'
  END;

  SELECT * INTO actor FROM audit_private.request_actor();

  INSERT INTO public.audit_logs (playbook_id, operation, target, status, actor_type, actor_id, request_id)
  VALUES (
    playbook,
    op,
    left(concat_ws(' ',
      entity || ':' || COALESCE(label, row_data ->> 'id'),
      CASE WHEN cardinality(changed) > 0 THEN 'changed=' || array_to_string(changed, ',') END
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
REVOKE ALL ON FUNCTION audit_private.record_content_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_content_change ON public.memories;
CREATE TRIGGER audit_content_change
  AFTER INSERT OR UPDATE OR DELETE ON public.memories
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_content_change();

DROP TRIGGER IF EXISTS audit_content_change ON public.canvas;
CREATE TRIGGER audit_content_change
  AFTER INSERT OR UPDATE OR DELETE ON public.canvas
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_content_change();

COMMIT;
