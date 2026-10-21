-- A certificate grants runtime reveal access to an explicit set of names only.
-- No private key or secret value is stored here. Owner management runs through
-- the authenticated API; direct Data API access is intentionally unavailable.
CREATE TABLE public.secret_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  certificate_sha256 text NOT NULL CHECK (certificate_sha256 ~ '^[a-f0-9]{64}$'),
  secret_names text[] NOT NULL CHECK (cardinality(secret_names) BETWEEN 1 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playbook_id, certificate_sha256)
);
ALTER TABLE public.secret_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.secret_clients FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.secret_clients TO service_role;
COMMENT ON TABLE public.secret_clients IS 'Owner-managed mTLS identities for runtime secret loading; service role only, never private keys.';
