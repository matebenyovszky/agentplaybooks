-- MCP Registry Integration Migration
-- Adds source tracking fields for external MCP servers (Anthropic Registry, etc.)

-- Add source tracking to mcp_servers table
ALTER TABLE mcp_servers
ADD COLUMN IF NOT EXISTS source_registry TEXT DEFAULT NULL 
  CHECK (source_registry IS NULL OR source_registry IN ('anthropic', 'github', 'manual')),
ADD COLUMN IF NOT EXISTS source_registry_id TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS source_version TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS publisher_id UUID DEFAULT NULL REFERENCES profiles(id);

-- Index for faster lookups by source
CREATE INDEX IF NOT EXISTS idx_mcp_servers_source_registry 
ON mcp_servers(source_registry, source_registry_id) 
WHERE source_registry IS NOT NULL;

-- Create Anthropic MCP Registry virtual profile (if not exists)
INSERT INTO profiles (id, auth_user_id, display_name, avatar_svg, website_url, description, is_verified, is_virtual)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  NULL,
  'Anthropic MCP Registry',
  '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#d4a27f"/><text x="50" y="60" text-anchor="middle" font-size="36" font-weight="bold" fill="white">A</text></svg>',
  'https://registry.modelcontextprotocol.io',
  'Official Model Context Protocol (MCP) server registry maintained by Anthropic',
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  is_verified = true,
  is_virtual = true,
  updated_at = NOW();

-- Comments
COMMENT ON COLUMN mcp_servers.source_registry IS 'Source registry: anthropic (official MCP registry), github, or manual';
COMMENT ON COLUMN mcp_servers.source_registry_id IS 'ID/name in the source registry (e.g., "ai.exa/exa")';
COMMENT ON COLUMN mcp_servers.source_url IS 'Source URL (e.g., GitHub repo)';
COMMENT ON COLUMN mcp_servers.source_version IS 'Version from the source registry';
COMMENT ON COLUMN mcp_servers.publisher_id IS 'Reference to the publisher profile (for attribution)';

