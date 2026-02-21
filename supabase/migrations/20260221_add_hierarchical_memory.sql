-- =====================================================
-- Hierarchical Graph Memory Enhancement
-- Adds memory_type, status, and metadata columns
-- to support complex task graphs and agent swarm coordination.
-- =====================================================

-- Add memory_type column (flat = simple key-value, hierarchical = task graph)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS memory_type TEXT DEFAULT 'flat'
  CHECK (memory_type IN ('flat', 'hierarchical'));

-- Add status column for task tracking in hierarchical memories
ALTER TABLE memories ADD COLUMN IF NOT EXISTS status TEXT DEFAULT NULL
  CHECK (status IS NULL OR status IN ('pending', 'running', 'completed', 'failed', 'blocked'));

-- Add metadata column for flexible graph data (edges, dependencies, thread info)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- =====================================================
-- Indexes for efficient querying
-- =====================================================

-- Index for memory_type filtering
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(playbook_id, memory_type);

-- Index for status-based queries (task tracking)
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(playbook_id, status) WHERE status IS NOT NULL;

-- GIN index on metadata for JSONB queries
CREATE INDEX IF NOT EXISTS idx_memories_metadata ON memories USING GIN (metadata);

-- =====================================================
-- Comment documentation
-- =====================================================

COMMENT ON COLUMN memories.memory_type IS 'Memory type: flat (simple key-value) or hierarchical (task graph with parent-child relationships)';
COMMENT ON COLUMN memories.status IS 'Task status for hierarchical memories: pending, running, completed, failed, blocked. NULL for flat memories.';
COMMENT ON COLUMN memories.metadata IS 'Flexible JSONB for graph data: dependencies, thread assignments, progress tracking, edge labels';
