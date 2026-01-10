-- Migration: Simplify skills table schema
-- Add licence field, remove definition and examples columns

-- Step 1: Add licence column to skills table
ALTER TABLE "public"."skills" 
ADD COLUMN IF NOT EXISTS "licence" text NULL;

-- Step 2: Drop definition column (parameters are no longer needed)
ALTER TABLE "public"."skills" 
DROP COLUMN IF EXISTS "definition";

-- Step 3: Drop examples column (no longer needed)
ALTER TABLE "public"."skills" 
DROP COLUMN IF EXISTS "examples";

-- Note: Any data in definition/examples columns will be permanently deleted
-- If data preservation is needed, run a backup query first:
-- CREATE TABLE skills_backup AS SELECT id, definition, examples FROM skills WHERE definition IS NOT NULL OR examples IS NOT NULL;
