-- AgentPlaybooks Database Schema
-- Initial migration: Core tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PLAYBOOKS - Core entity containing everything
-- ============================================
CREATE TABLE playbooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    guid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    config JSONB DEFAULT '{}',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_playbooks_user_id ON playbooks(user_id);
CREATE INDEX idx_playbooks_guid ON playbooks(guid);
CREATE INDEX idx_playbooks_is_public ON playbooks(is_public) WHERE is_public = true;

-- ============================================
-- PERSONAS - System prompts / AI personalities
-- ============================================
CREATE TABLE personas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_personas_playbook_id ON personas(playbook_id);

-- ============================================
-- SKILLS - Capabilities / task definitions
-- ============================================
CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    definition JSONB NOT NULL DEFAULT '{}',
    examples JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_skills_playbook_id ON skills(playbook_id);

-- ============================================
-- MCP_SERVERS - Model Context Protocol servers
-- ============================================
CREATE TABLE mcp_servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    tools JSONB DEFAULT '[]',
    resources JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mcp_servers_playbook_id ON mcp_servers(playbook_id);

-- ============================================
-- MEMORIES - Key-value store for AI agents
-- ============================================
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(playbook_id, key)
);

CREATE INDEX idx_memories_playbook_id ON memories(playbook_id);

-- ============================================
-- API_KEYS - For AI agent write-back access
-- ============================================
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT,
    permissions TEXT[] NOT NULL DEFAULT '{"memory:read", "memory:write"}',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_api_keys_playbook_id ON api_keys(playbook_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);

-- ============================================
-- PUBLIC_SKILLS - Community skill repository
-- ============================================
CREATE TABLE public_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    definition JSONB NOT NULL,
    examples JSONB DEFAULT '[]',
    tags TEXT[] DEFAULT '{}',
    usage_count INT DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_public_skills_tags ON public_skills USING GIN(tags);
CREATE INDEX idx_public_skills_usage ON public_skills(usage_count DESC);

-- ============================================
-- PUBLIC_MCP_SERVERS - Community MCP repository
-- ============================================
CREATE TABLE public_mcp_servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_mcp_id UUID REFERENCES mcp_servers(id) ON DELETE SET NULL,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    tools JSONB NOT NULL DEFAULT '[]',
    resources JSONB DEFAULT '[]',
    transport_type TEXT DEFAULT 'http',
    tags TEXT[] DEFAULT '{}',
    usage_count INT DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_public_mcp_tags ON public_mcp_servers USING GIN(tags);
CREATE INDEX idx_public_mcp_usage ON public_mcp_servers(usage_count DESC);

-- ============================================
-- PLAYBOOK_PUBLIC_ITEMS - Links to public items
-- ============================================
CREATE TABLE playbook_public_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('skill', 'mcp')),
    item_id UUID NOT NULL,
    added_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(playbook_id, item_type, item_id)
);

CREATE INDEX idx_playbook_public_items_playbook ON playbook_public_items(playbook_id);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_public_items ENABLE ROW LEVEL SECURITY;

-- Playbooks: owner can do everything, public playbooks readable by all
CREATE POLICY "Users can manage own playbooks" ON playbooks
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public playbooks are readable" ON playbooks
    FOR SELECT USING (is_public = true);

-- Personas/Skills/MCPServers: accessible if playbook is owned or public
CREATE POLICY "Owner access personas" ON personas
    FOR ALL USING (
        EXISTS (SELECT 1 FROM playbooks WHERE playbooks.id = personas.playbook_id AND playbooks.user_id = auth.uid())
    );

CREATE POLICY "Public playbook personas readable" ON personas
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM playbooks WHERE playbooks.id = personas.playbook_id AND playbooks.is_public = true)
    );

CREATE POLICY "Owner access skills" ON skills
    FOR ALL USING (
        EXISTS (SELECT 1 FROM playbooks WHERE playbooks.id = skills.playbook_id AND playbooks.user_id = auth.uid())
    );

CREATE POLICY "Public playbook skills readable" ON skills
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM playbooks WHERE playbooks.id = skills.playbook_id AND playbooks.is_public = true)
    );

CREATE POLICY "Owner access mcp_servers" ON mcp_servers
    FOR ALL USING (
        EXISTS (SELECT 1 FROM playbooks WHERE playbooks.id = mcp_servers.playbook_id AND playbooks.user_id = auth.uid())
    );

CREATE POLICY "Public playbook mcp_servers readable" ON mcp_servers
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM playbooks WHERE playbooks.id = mcp_servers.playbook_id AND playbooks.is_public = true)
    );

-- Memories: owner only (API key access handled at API level)
CREATE POLICY "Owner access memories" ON memories
    FOR ALL USING (
        EXISTS (SELECT 1 FROM playbooks WHERE playbooks.id = memories.playbook_id AND playbooks.user_id = auth.uid())
    );

-- API Keys: owner only
CREATE POLICY "Owner access api_keys" ON api_keys
    FOR ALL USING (
        EXISTS (SELECT 1 FROM playbooks WHERE playbooks.id = api_keys.playbook_id AND playbooks.user_id = auth.uid())
    );

-- Public skills/mcp: anyone can read, authors can manage own
CREATE POLICY "Anyone can read public_skills" ON public_skills
    FOR SELECT USING (true);

CREATE POLICY "Authors manage own public_skills" ON public_skills
    FOR ALL USING (auth.uid() = author_id);

CREATE POLICY "Anyone can read public_mcp" ON public_mcp_servers
    FOR SELECT USING (true);

CREATE POLICY "Authors manage own public_mcp" ON public_mcp_servers
    FOR ALL USING (auth.uid() = author_id);

-- Playbook public items: owner can manage
CREATE POLICY "Owner access playbook_public_items" ON playbook_public_items
    FOR ALL USING (
        EXISTS (SELECT 1 FROM playbooks WHERE playbooks.id = playbook_public_items.playbook_id AND playbooks.user_id = auth.uid())
    );

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER playbooks_updated_at
    BEFORE UPDATE ON playbooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER memories_updated_at
    BEFORE UPDATE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Increment usage count function
CREATE OR REPLACE FUNCTION increment_usage_count(table_name TEXT, item_id UUID)
RETURNS VOID AS $$
BEGIN
    IF table_name = 'public_skills' THEN
        UPDATE public_skills SET usage_count = usage_count + 1 WHERE id = item_id;
    ELSIF table_name = 'public_mcp_servers' THEN
        UPDATE public_mcp_servers SET usage_count = usage_count + 1 WHERE id = item_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


