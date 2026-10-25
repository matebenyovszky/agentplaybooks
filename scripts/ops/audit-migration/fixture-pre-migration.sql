-- Local pre-migration schema + seed. Not for production.
-- Mirrors hosted audit_logs / collaborators / api_keys as they exist before
-- 20261024120000_audit_logs_compliance.sql.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql
AS $$ SELECT current_setting('test.uid', true)::uuid $$;

CREATE TABLE public.playbooks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL
);

CREATE TABLE public.mcp_servers (
  id uuid PRIMARY KEY
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  mcp_server_id uuid REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  operation text NOT NULL,
  target text,
  status text NOT NULL,
  latency_ms integer DEFAULT 0 NOT NULL,
  error_code text,
  request_id text,
  created_at timestamptz DEFAULT now() NOT NULL,
  actor_type text,
  actor_id text,
  secret_name text
);

CREATE TABLE public.playbook_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  user_id uuid,
  invited_by uuid NOT NULL,
  invite_token_hash text NOT NULL,
  invite_expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid,
  role text DEFAULT 'viewer' NOT NULL
);
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_role_check
  CHECK (role IN ('viewer', 'coworker', 'proposer', 'admin'));

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can read audit logs" ON public.audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.playbooks
    WHERE playbooks.id = audit_logs.playbook_id
      AND playbooks.user_id = auth.uid()
  ));

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT ON public.playbooks TO authenticated;

INSERT INTO public.playbooks (id, user_id) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa');

INSERT INTO public.audit_logs (
  playbook_id, operation, status, created_at, actor_type, actor_id,
  target, latency_ms, error_code, request_id, secret_name
)
SELECT
  CASE WHEN i % 2 = 0
    THEN '00000000-0000-4000-8000-000000000001'::uuid
    ELSE '00000000-0000-4000-8000-000000000002'::uuid
  END,
  (ARRAY['secret.use', 'secret.list', 'mcp.call'])[1 + (i % 3)],
  'success',
  timestamptz '2026-01-01 00:00:00+00' + make_interval(mins => i),
  'owner',
  '00000000-0000-4000-8000-0000000000aa',
  CASE WHEN i % 7 = 0 THEN NULL ELSE 'vault' END,
  (i % 50),
  CASE WHEN i % 11 = 0 THEN 'E_TEST' ELSE NULL END,
  CASE WHEN i % 5 = 0 THEN NULL ELSE 'req-' || i::text END,
  CASE WHEN i % 4 = 0 THEN NULL ELSE 'GITHUB_TOKEN' END
FROM generate_series(1, 1000) AS s(i);
