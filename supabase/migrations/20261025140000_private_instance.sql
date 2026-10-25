-- A switch that makes a self-hosted instance private: no playbook can be public
-- or unlisted, so nothing on it is readable without signing in.
--
-- Anonymous access follows from visibility in many places — the public
-- listings, the MCP manifest and tools of a public playbook, an unlisted
-- playbook read by its GUID, its memory and runs. Rather than gate each of
-- them, the switch removes what they serve: with it on, a playbook can only be
-- private.
--
-- Turn it on (as a database owner), then make existing playbooks private and
-- restart the Data API so its pooled connections pick up the setting:
--
--   ALTER DATABASE postgres SET agentplaybooks.private_instance = 'on';
--   UPDATE public.playbooks SET visibility = 'private' WHERE visibility <> 'private';
--
-- Unset it with ALTER DATABASE postgres RESET agentplaybooks.private_instance.
-- An instance that never sets it behaves exactly as before.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_private_instance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('agentplaybooks.private_instance', true) = 'on'
     AND NEW.visibility::text <> 'private' THEN
    RAISE EXCEPTION 'This instance is private: a playbook cannot be %', NEW.visibility
      USING ERRCODE = 'check_violation',
            HINT = 'Set visibility to private. The operator enabled agentplaybooks.private_instance.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_private_instance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_private_instance ON public.playbooks;
CREATE TRIGGER enforce_private_instance
  BEFORE INSERT OR UPDATE OF visibility ON public.playbooks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_private_instance();

COMMIT;
