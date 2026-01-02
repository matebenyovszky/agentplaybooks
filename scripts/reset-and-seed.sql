-- ============================================
-- AgentPlaybooks Reset & Seed Script
-- ============================================
-- WARNING: This script DELETES all data and reseeds!
-- Use only for development/testing or fresh deployments.
--
-- Run with: psql $DATABASE_URL -f scripts/reset-and-seed.sql
-- ============================================

-- Disable triggers temporarily for faster deletion
SET session_replication_role = 'replica';

-- Delete all data in correct order (respecting foreign keys)
TRUNCATE TABLE playbook_public_items CASCADE;
TRUNCATE TABLE api_keys CASCADE;
TRUNCATE TABLE memories CASCADE;
TRUNCATE TABLE mcp_servers CASCADE;
TRUNCATE TABLE skills CASCADE;
TRUNCATE TABLE personas CASCADE;
TRUNCATE TABLE playbooks CASCADE;
TRUNCATE TABLE public_mcp_servers CASCADE;
TRUNCATE TABLE public_skills CASCADE;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Delete system user (will be recreated)
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';

-- Now run the full seed
\i scripts/seed-full.sql

