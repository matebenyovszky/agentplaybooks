-- =====================================================
-- RLM (Recursive Language Models) Memory Enhancement
-- Adds hierarchical memory support with tiers, priorities,
-- and context management capabilities.
-- =====================================================

-- Add tier column for memory hierarchy (working/contextual/longterm)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'contextual' 
  CHECK (tier IN ('working', 'contextual', 'longterm'));

-- Add parent_key for hierarchical organization
ALTER TABLE memories ADD COLUMN IF NOT EXISTS parent_key TEXT;

-- Add priority for importance ranking (1-100)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 50;

-- Add access tracking for usage-based promotion
ALTER TABLE memories ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

-- Add summary for compressed representation of large memories
ALTER TABLE memories ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add source_task_id for linking to originating sub-tasks
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_task_id TEXT;

-- Add retention_policy for auto-archival rules
ALTER TABLE memories ADD COLUMN IF NOT EXISTS retention_policy TEXT DEFAULT 'auto'
  CHECK (retention_policy IN ('permanent', 'session', 'auto'));

-- =====================================================
-- Indexes for efficient hierarchical queries
-- =====================================================

-- Index for parent-child relationships
CREATE INDEX IF NOT EXISTS idx_memories_parent_key ON memories(playbook_id, parent_key);

-- Index for tier-based queries
CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(playbook_id, tier);

-- Index for priority-based sorting
CREATE INDEX IF NOT EXISTS idx_memories_priority ON memories(playbook_id, priority DESC);

-- Partial index for working memory (frequently accessed hot data)
CREATE INDEX IF NOT EXISTS idx_memories_working ON memories(playbook_id, updated_at DESC) 
  WHERE tier = 'working';

-- Index for access tracking (for promotion logic)
CREATE INDEX IF NOT EXISTS idx_memories_access ON memories(playbook_id, access_count DESC, last_accessed_at DESC);

-- =====================================================
-- Comment documentation
-- =====================================================

COMMENT ON COLUMN memories.tier IS 'Memory hierarchy level: working (active), contextual (recent), longterm (archived)';
COMMENT ON COLUMN memories.parent_key IS 'Key of parent memory for hierarchical organization';
COMMENT ON COLUMN memories.priority IS 'Importance ranking 1-100 (higher = more important)';
COMMENT ON COLUMN memories.access_count IS 'Number of times this memory has been accessed';
COMMENT ON COLUMN memories.last_accessed_at IS 'Timestamp of last access for working memory promotion';
COMMENT ON COLUMN memories.summary IS 'Compressed text representation of memory value';
COMMENT ON COLUMN memories.source_task_id IS 'ID of the sub-task that created this memory';
COMMENT ON COLUMN memories.retention_policy IS 'Auto-archival policy: permanent (never archive), session (archive after session), auto (smart archival)';
