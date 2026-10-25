-- Offboarding: a disabled account's credentials stop working, and all of an
-- account's credentials can be revoked in one step.
--
-- Banning or deleting a user in Supabase Auth stopped their sign-in, but the
-- API keys they had issued kept working: key lookup never looked at the
-- account behind the key. The application now asks account_is_active() for
-- the owner of every presented credential — the user behind a user API key,
-- the owner of the playbook behind a playbook API key, and the signed-in user
-- of a session (a banned user's access token stays valid until it expires).
--
-- revoke_account_credentials() deactivates every user API key of an account,
-- every API key and mTLS secret client of the playbooks it owns. The rows are
-- kept (is_active = false), so the audit trail can still name them; playbook
-- key revocations are recorded as api_key.revoke by the audit triggers.

BEGIN;

CREATE OR REPLACE FUNCTION public.account_is_active(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = p_user_id
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_account_credentials(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  user_keys integer;
  playbook_keys integer;
  clients integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  UPDATE public.user_api_keys SET is_active = false
  WHERE user_id = p_user_id AND is_active;
  GET DIAGNOSTICS user_keys = ROW_COUNT;

  UPDATE public.api_keys SET is_active = false
  WHERE is_active AND playbook_id IN (SELECT id FROM public.playbooks WHERE user_id = p_user_id);
  GET DIAGNOSTICS playbook_keys = ROW_COUNT;

  -- secret_clients arrives with a later migration than some installs have.
  clients := 0;
  IF to_regclass('public.secret_clients') IS NOT NULL THEN
    EXECUTE 'UPDATE public.secret_clients SET is_active = false
             WHERE is_active AND playbook_id IN (SELECT id FROM public.playbooks WHERE user_id = $1)'
      USING p_user_id;
    GET DIAGNOSTICS clients = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'user_api_keys', user_keys,
    'playbook_api_keys', playbook_keys,
    'secret_clients', clients
  );
END;
$$;

REVOKE ALL ON FUNCTION public.account_is_active(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_account_credentials(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_is_active(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_account_credentials(uuid) TO service_role;

COMMIT;
