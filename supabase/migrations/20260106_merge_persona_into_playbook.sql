-- Migration: Merge persona into playbook (1 Playbook = 1 Persona)
-- This simplifies the architecture by embedding persona directly into playbook

-- Step 1: Add persona fields to playbooks table
ALTER TABLE playbooks 
ADD COLUMN IF NOT EXISTS persona_name TEXT,
ADD COLUMN IF NOT EXISTS persona_system_prompt TEXT,
ADD COLUMN IF NOT EXISTS persona_metadata JSONB DEFAULT '{}';

-- Step 2: Migrate existing persona data (first persona per playbook)
-- Uses a subquery to get the first persona (by created_at) for each playbook
UPDATE playbooks p
SET 
    persona_name = sub.name,
    persona_system_prompt = sub.system_prompt,
    persona_metadata = sub.metadata
FROM (
    SELECT DISTINCT ON (playbook_id) 
        playbook_id, name, system_prompt, metadata
    FROM personas
    ORDER BY playbook_id, created_at ASC
) sub
WHERE p.id = sub.playbook_id;

-- Step 3: Set defaults for playbooks without personas
UPDATE playbooks 
SET 
    persona_name = 'Assistant',
    persona_system_prompt = 'You are a helpful AI assistant.',
    persona_metadata = '{}'
WHERE persona_name IS NULL;

-- Step 4: Drop the personas table (clean break)
DROP TABLE IF EXISTS personas CASCADE;

-- Step 5: Add comment for documentation
COMMENT ON COLUMN playbooks.persona_name IS 'Name of the AI persona for this playbook';
COMMENT ON COLUMN playbooks.persona_system_prompt IS 'System prompt defining the AI personality and behavior';
COMMENT ON COLUMN playbooks.persona_metadata IS 'Additional metadata for the persona (JSON)';

