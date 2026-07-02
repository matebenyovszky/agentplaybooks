-- Migration: add allow_api_key_reveal to secrets
-- This enables playbook owners to selectively allow API keys to read the raw secret value

ALTER TABLE secrets ADD COLUMN IF NOT EXISTS allow_api_key_reveal BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN secrets.allow_api_key_reveal IS 'If true, API keys with secrets:read can use the /reveal endpoint to get the raw secret. If false, they can only use it via proxy.';
