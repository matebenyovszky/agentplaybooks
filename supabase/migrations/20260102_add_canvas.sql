-- Add Canvas table for structured markdown documents
-- Canvas documents serve as the agent's persistent workspace

-- ============================================
-- CANVAS - Structured markdown documents
-- ============================================
CREATE TABLE canvas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    metadata JSONB DEFAULT '{}',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(playbook_id, slug)
);

CREATE INDEX idx_canvas_playbook_id ON canvas(playbook_id);
CREATE INDEX idx_canvas_slug ON canvas(playbook_id, slug);

-- Enable RLS
ALTER TABLE canvas ENABLE ROW LEVEL SECURITY;

-- Owner can do everything
CREATE POLICY "Owner access canvas" ON canvas
    FOR ALL USING (
        EXISTS (SELECT 1 FROM playbooks WHERE playbooks.id = canvas.playbook_id AND playbooks.user_id = auth.uid())
    );

-- Public playbook canvas readable
CREATE POLICY "Public playbook canvas readable" ON canvas
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM playbooks WHERE playbooks.id = canvas.playbook_id AND playbooks.is_public = true)
    );

-- Auto-update updated_at timestamp
CREATE TRIGGER canvas_updated_at
    BEFORE UPDATE ON canvas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Add canvas:read and canvas:write permissions to api_keys
-- (The permissions column is TEXT[] so we don't need to alter it, just document the new values)

COMMENT ON TABLE canvas IS 'Structured markdown documents for agent workspace. Each document has a name, slug (for URL), and markdown content.';
COMMENT ON COLUMN canvas.slug IS 'URL-friendly identifier for the document, unique within a playbook';
COMMENT ON COLUMN canvas.content IS 'Markdown content of the document';
COMMENT ON COLUMN canvas.metadata IS 'Optional metadata like tags, last_editor, etc.';
COMMENT ON COLUMN canvas.sort_order IS 'Order for displaying documents in the UI';


