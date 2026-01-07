-- Create visibility enum type if it doesn't exist
CREATE TYPE "public"."visibility" AS ENUM ('public', 'private', 'unlisted');

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

-- Add role column to api_keys table with default 'viewer'
ALTER TABLE "public"."api_keys" 
ADD COLUMN "role" text NOT NULL DEFAULT 'viewer';

-- Add check constraint to ensure valid roles
ALTER TABLE "public"."api_keys" 
ADD CONSTRAINT "api_keys_role_check" 
CHECK (role IN ('viewer', 'coworker', 'admin'));
