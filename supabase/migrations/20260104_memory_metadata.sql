-- Memory Metadata Migration
-- Add tags and description to memories for better searchability

-- Add new columns to memories table
ALTER TABLE memories 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS description TEXT;

-- Create GIN index for tag searching
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING GIN(tags);

-- Create text search index for description
CREATE INDEX IF NOT EXISTS idx_memories_description ON memories USING GIN(to_tsvector('english', COALESCE(description, '')));

-- Comment for documentation
COMMENT ON COLUMN memories.tags IS 'Tags for categorizing and searching memories';
COMMENT ON COLUMN memories.description IS 'Human-readable description of what this memory contains';

