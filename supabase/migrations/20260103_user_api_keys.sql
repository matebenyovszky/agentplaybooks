-- User-level API Keys Migration
-- Allows users to have API keys that work across all their playbooks

-- ============================================
-- USER_API_KEYS - For user-level access
-- ============================================
CREATE TABLE user_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT,
    permissions TEXT[] NOT NULL DEFAULT '{"playbooks:read", "playbooks:write", "memory:read", "memory:write"}',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX idx_user_api_keys_key_hash ON user_api_keys(key_hash);

-- Enable RLS
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- User can only access their own API keys
CREATE POLICY "Users manage own user_api_keys" ON user_api_keys
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- PERMISSIONS REFERENCE
-- ============================================
-- User API Key Permissions:
--   playbooks:read    - List and read own playbooks
--   playbooks:write   - Create, update, delete playbooks
--   personas:read     - Read personas from own playbooks
--   personas:write    - Create, update, delete personas
--   skills:read       - Read skills from own playbooks
--   skills:write      - Create, update, delete skills
--   memory:read       - Read memory from own playbooks
--   memory:write      - Write memory to own playbooks
--   full              - All permissions

