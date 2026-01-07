-- Create visibility enum type if it doesn't exist
CREATE TYPE "public"."visibility" AS ENUM ('public', 'private', 'unlisted');

-- Drop policies that depend on is_public column
DROP POLICY IF EXISTS "Public playbooks are readable" ON "public"."playbooks";
DROP POLICY IF EXISTS "Anyone can read public playbooks" ON "public"."playbooks";
DROP POLICY IF EXISTS "Public playbook skills readable" ON "public"."skills";
DROP POLICY IF EXISTS "Anyone can read skills from public playbooks" ON "public"."skills";
DROP POLICY IF EXISTS "Anyone can read mcp_servers from public playbooks" ON "public"."mcp_servers";
DROP POLICY IF EXISTS "Anyone can read attachments from public playbooks" ON "public"."skill_attachments";

-- Add visibility column to playbooks table
ALTER TABLE "public"."playbooks"
ADD COLUMN "visibility" "public"."visibility" NOT NULL DEFAULT 'private';

-- Backfill visibility data based on is_public
UPDATE "public"."playbooks"
SET "visibility" = 'public'
WHERE "is_public" = true;

UPDATE "public"."playbooks"
SET "visibility" = 'private'
WHERE "is_public" = false;

-- Drop the old is_public column
ALTER TABLE "public"."playbooks" DROP COLUMN "is_public";

-- Recreate policies using visibility column
CREATE POLICY "Public playbooks are readable" ON "public"."playbooks"
    FOR SELECT USING ("visibility" = 'public');

CREATE POLICY "Anyone can read public playbooks" ON "public"."playbooks"
    FOR SELECT USING ("visibility" = 'public');

CREATE POLICY "Public playbook skills readable" ON "public"."skills"
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM "public"."playbooks"
        WHERE "playbooks"."id" = "skills"."playbook_id"
        AND "playbooks"."visibility" = 'public'
    ));

CREATE POLICY "Anyone can read skills from public playbooks" ON "public"."skills"
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM "public"."playbooks" p
        WHERE p.id = skills.playbook_id
        AND p.visibility = 'public'
    ));

CREATE POLICY "Anyone can read mcp_servers from public playbooks" ON "public"."mcp_servers"
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM "public"."playbooks" p
        WHERE p.id = mcp_servers.playbook_id
        AND p.visibility = 'public'
    ));

CREATE POLICY "Anyone can read attachments from public playbooks" ON "public"."skill_attachments"
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM skills s
        JOIN playbooks p ON p.id = s.playbook_id
        WHERE s.id = skill_attachments.skill_id
        AND p.visibility = 'public'
    ));

-- Add role column to api_keys table with default 'viewer'
ALTER TABLE "public"."api_keys" 
ADD COLUMN "role" text NOT NULL DEFAULT 'viewer';

-- Add check constraint to ensure valid roles
ALTER TABLE "public"."api_keys" 
ADD CONSTRAINT "api_keys_role_check" 
CHECK (role IN ('viewer', 'coworker', 'admin'));
