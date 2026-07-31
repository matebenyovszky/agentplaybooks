-- Federated MCP/OpenAPI runtime support.

ALTER TABLE public.mcp_servers
  ADD COLUMN IF NOT EXISTS transport_type text DEFAULT 'http',
  ADD COLUMN IF NOT EXISTS transport_config jsonb DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.mcp_server_secrets (
  mcp_server_id uuid PRIMARY KEY REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  encrypted_payload text NOT NULL,
  iv text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_server_secrets ENABLE ROW LEVEL SECURITY;
-- No browser policy is intentional: secrets are only accessed by service-role API code.

CREATE TABLE IF NOT EXISTS public.mcp_proxy_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  mcp_server_id uuid NOT NULL REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  operation text NOT NULL,
  target text,
  status text NOT NULL CHECK (status IN ('success', 'error')),
  latency_ms integer NOT NULL DEFAULT 0,
  error_code text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_proxy_audit_logs_playbook_created_idx
  ON public.mcp_proxy_audit_logs(playbook_id, created_at DESC);

ALTER TABLE public.mcp_proxy_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read MCP proxy audit logs" ON public.mcp_proxy_audit_logs;
CREATE POLICY "Owners can read MCP proxy audit logs"
  ON public.mcp_proxy_audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.playbooks
    WHERE playbooks.id = mcp_proxy_audit_logs.playbook_id
      AND playbooks.user_id = auth.uid()
  ));
