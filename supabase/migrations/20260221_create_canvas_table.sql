-- =====================================================
-- Canvas: Collaborative markdown documents
-- Supports section-level editing for parallel agent work
-- =====================================================

CREATE TABLE IF NOT EXISTS canvas (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sections JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(playbook_id, slug)
);

-- =====================================================
-- Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_canvas_playbook ON canvas(playbook_id);
CREATE INDEX IF NOT EXISTS idx_canvas_slug ON canvas(playbook_id, slug);
CREATE INDEX IF NOT EXISTS idx_canvas_sections ON canvas USING GIN (sections);

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE canvas ENABLE ROW LEVEL SECURITY;

-- Public read for public playbooks
CREATE POLICY "Canvas: public read" ON canvas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM playbooks WHERE playbooks.id = canvas.playbook_id AND playbooks.visibility = 'public'
    )
  );

-- Owner full access
CREATE POLICY "Canvas: owner full access" ON canvas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM playbooks WHERE playbooks.id = canvas.playbook_id AND playbooks.user_id = auth.uid()
    )
  );

-- Service role bypass
CREATE POLICY "Canvas: service role" ON canvas
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE canvas IS 'Collaborative markdown documents for agent workspace. Supports section-level parallel editing.';
COMMENT ON COLUMN canvas.slug IS 'URL-friendly unique identifier within a playbook';
COMMENT ON COLUMN canvas.content IS 'Full markdown content of the document';
COMMENT ON COLUMN canvas.sections IS 'Parsed section structure: [{id, heading, level, content, locked_by, locked_at}]';
COMMENT ON COLUMN canvas.metadata IS 'Document metadata: contributors, version, custom properties';
