-- Human collaboration is intentionally separate from machine API keys.
-- A pending invite has no user_id. Acceptance atomically binds it to one user.
CREATE TABLE "public"."playbook_collaborators" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "playbook_id" uuid NOT NULL REFERENCES "public"."playbooks"("id") ON DELETE CASCADE,
    "user_id" uuid,
    "invited_by" uuid NOT NULL,
    "invite_token_hash" text NOT NULL UNIQUE,
    "invite_expires_at" timestamptz NOT NULL,
    "accepted_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "playbook_collaborators_state_check" CHECK (
        ("user_id" IS NULL AND "accepted_at" IS NULL)
        OR ("user_id" IS NOT NULL AND "accepted_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "playbook_collaborators_playbook_user_idx"
    ON "public"."playbook_collaborators" ("playbook_id", "user_id")
    WHERE "user_id" IS NOT NULL;

CREATE INDEX "playbook_collaborators_user_idx"
    ON "public"."playbook_collaborators" ("user_id")
    WHERE "user_id" IS NOT NULL;

ALTER TABLE "public"."playbook_collaborators" ENABLE ROW LEVEL SECURITY;

-- There are deliberately no client policies. Collaboration is mediated by
-- authenticated server routes using the service role and explicit access checks.
COMMENT ON TABLE "public"."playbook_collaborators" IS
    'Human editor memberships and one-time pending invites; never stores plaintext invite tokens.';
