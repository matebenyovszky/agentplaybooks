-- =====================================================
-- Secrets: Encrypted key/value store for playbook credentials
-- Stores API keys, passwords, tokens etc. that agents need
-- Values are AES-256-GCM encrypted at the application layer
-- =====================================================

CREATE TABLE IF NOT EXISTS secrets (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- The encrypted_value stores the AES-256-GCM ciphertext (base64)
  -- The iv stores the initialization vector (base64)
  -- The auth_tag stores the GCM authentication tag (base64)
  encrypted_value TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  -- Metadata
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('api_key', 'password', 'token', 'certificate', 'connection_string', 'general')),
  -- Rotation tracking
  rotated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  use_count INT NOT NULL DEFAULT 0,
  -- Audit
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(playbook_id, name)
);

-- =====================================================
-- Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_secrets_playbook ON secrets(playbook_id);
CREATE INDEX IF NOT EXISTS idx_secrets_category ON secrets(playbook_id, category);
CREATE INDEX IF NOT EXISTS idx_secrets_expires ON secrets(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- RLS Policies - STRICT: only owner and service role
-- Secrets are NEVER publicly readable, even for public playbooks
-- =====================================================

ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;

-- Owner full access (CRUD)
CREATE POLICY "Secrets: owner full access" ON secrets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM playbooks
      WHERE playbooks.id = secrets.playbook_id
        AND playbooks.user_id = auth.uid()
    )
  );

-- Service role bypass (for API key auth flow)
CREATE POLICY "Secrets: service role" ON secrets
  FOR ALL USING (auth.role() = 'service_role');

-- NO public read policy - secrets are never exposed to anonymous users

-- =====================================================
-- Auto-update updated_at trigger
-- =====================================================

CREATE OR REPLACE FUNCTION update_secrets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER secrets_updated_at
  BEFORE UPDATE ON secrets
  FOR EACH ROW
  EXECUTE FUNCTION update_secrets_updated_at();

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE secrets IS 'Encrypted secrets store for playbook credentials. Values are AES-256-GCM encrypted at the application layer.';
COMMENT ON COLUMN secrets.encrypted_value IS 'AES-256-GCM encrypted secret value (base64 encoded ciphertext)';
COMMENT ON COLUMN secrets.iv IS 'Initialization vector for AES-256-GCM (base64 encoded, unique per encryption)';
COMMENT ON COLUMN secrets.auth_tag IS 'GCM authentication tag for tamper detection (base64 encoded)';
COMMENT ON COLUMN secrets.category IS 'Secret type: api_key, password, token, certificate, connection_string, general';
COMMENT ON COLUMN secrets.rotated_at IS 'Last time this secret was rotated/updated';
COMMENT ON COLUMN secrets.expires_at IS 'Optional expiration date for the secret';
