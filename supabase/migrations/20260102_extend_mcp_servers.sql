-- Extend MCP servers with transport configuration
-- This migration adds fields needed for MCP server connections

-- Add transport_config to mcp_servers table
-- Stores connection details like command, args, env vars, url etc.
ALTER TABLE mcp_servers
ADD COLUMN IF NOT EXISTS transport_type TEXT DEFAULT 'http' CHECK (transport_type IN ('stdio', 'http', 'sse')),
ADD COLUMN IF NOT EXISTS transport_config JSONB DEFAULT '{}';

-- Add transport_config to public_mcp_servers table
ALTER TABLE public_mcp_servers
ADD COLUMN IF NOT EXISTS transport_config JSONB DEFAULT '{}';

-- Add source_url to track where skills/mcp come from (GitHub, etc.)
ALTER TABLE public_skills
ADD COLUMN IF NOT EXISTS source_url TEXT,
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual' CHECK (source_type IN ('manual', 'github', 'url', 'import'));

ALTER TABLE public_mcp_servers
ADD COLUMN IF NOT EXISTS source_url TEXT,
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual' CHECK (source_type IN ('manual', 'github', 'url', 'import', 'official'));

-- Comments for documentation
COMMENT ON COLUMN mcp_servers.transport_type IS 'MCP transport type: stdio (local command), http (HTTP+SSE), or sse (Server-Sent Events)';
COMMENT ON COLUMN mcp_servers.transport_config IS 'Transport-specific config. For stdio: {command, args, env}. For http/sse: {url, headers}';
COMMENT ON COLUMN public_mcp_servers.source_url IS 'Original source URL (e.g., GitHub repo URL)';
COMMENT ON COLUMN public_mcp_servers.source_type IS 'How this MCP server was added to the repository';
COMMENT ON COLUMN public_skills.source_url IS 'Original source URL (e.g., GitHub cursorrules file)';
COMMENT ON COLUMN public_skills.source_type IS 'How this skill was added to the repository';

