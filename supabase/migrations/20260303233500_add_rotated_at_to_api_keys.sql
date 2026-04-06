-- Add rotated_at column to api_keys table for key rotation tracking
ALTER TABLE "public"."api_keys"
ADD COLUMN "rotated_at" TIMESTAMPTZ;

COMMENT ON COLUMN api_keys.rotated_at IS 'Timestamp when this API key was last rotated/regenerated';
