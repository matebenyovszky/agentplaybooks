-- Canvas documents are mutable work products created and maintained by agents.
-- They intentionally live separately from memories: memories are structured facts,
-- while canvases are versioned, long-form markdown documents.

CREATE TABLE IF NOT EXISTS "public"."playbook_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "playbook_id" uuid NOT NULL REFERENCES "public"."playbooks"("id") ON DELETE CASCADE,
    "created_by" uuid REFERENCES auth.users("id") ON DELETE SET NULL,
    "name" text NOT NULL,
    "status" text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "playbook_runs_id_playbook_unique" UNIQUE ("id", "playbook_id")
);

CREATE INDEX IF NOT EXISTS "playbook_runs_playbook_updated_idx"
    ON "public"."playbook_runs" ("playbook_id", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "public"."canvas" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "playbook_id" uuid NOT NULL REFERENCES "public"."playbooks"("id") ON DELETE CASCADE,
    "run_id" uuid NOT NULL,
    "name" text NOT NULL,
    "slug" text NOT NULL,
    "content" text NOT NULL DEFAULT '',
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "sort_order" integer NOT NULL DEFAULT 0,
    "version" integer NOT NULL DEFAULT 1,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "canvas_slug_format" CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    CONSTRAINT "canvas_version_positive" CHECK (version > 0),
    CONSTRAINT "canvas_run_slug_unique" UNIQUE ("run_id", "slug"),
    CONSTRAINT "canvas_run_playbook_fk" FOREIGN KEY ("run_id", "playbook_id")
        REFERENCES "public"."playbook_runs"("id", "playbook_id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "canvas_playbook_sort_idx"
    ON "public"."canvas" ("run_id", "sort_order", "updated_at" DESC);

ALTER TABLE "public"."playbook_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."canvas" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Runs follow playbook access" ON "public"."playbook_runs";
CREATE POLICY "Runs follow playbook access" ON "public"."playbook_runs"
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM "public"."playbooks" p
        WHERE p.id = playbook_runs.playbook_id
          AND (p.user_id = auth.uid() OR playbook_runs.created_by = auth.uid())
    ));

DROP POLICY IF EXISTS "Users can create runs for accessible playbooks" ON "public"."playbook_runs";
CREATE POLICY "Users can create runs for accessible playbooks" ON "public"."playbook_runs"
    FOR INSERT WITH CHECK (
        created_by = auth.uid() AND EXISTS (
            SELECT 1 FROM "public"."playbooks" p
            WHERE p.id = playbook_runs.playbook_id
              AND (p.visibility IN ('public', 'unlisted') OR p.user_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Run creators can update runs" ON "public"."playbook_runs";
CREATE POLICY "Run creators can update runs" ON "public"."playbook_runs"
    FOR UPDATE USING (
        created_by = auth.uid() OR EXISTS (
            SELECT 1 FROM "public"."playbooks" p
            WHERE p.id = playbook_runs.playbook_id AND p.user_id = auth.uid()
        )
    ) WITH CHECK (
        created_by = auth.uid() OR EXISTS (
            SELECT 1 FROM "public"."playbooks" p
            WHERE p.id = playbook_runs.playbook_id AND p.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Run creators can delete runs" ON "public"."playbook_runs";
CREATE POLICY "Run creators can delete runs" ON "public"."playbook_runs"
    FOR DELETE USING (
        created_by = auth.uid() OR EXISTS (
            SELECT 1 FROM "public"."playbooks" p
            WHERE p.id = playbook_runs.playbook_id AND p.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Canvas documents follow playbook visibility" ON "public"."canvas";
CREATE POLICY "Canvas documents follow playbook visibility" ON "public"."canvas"
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM "public"."playbooks" p
        WHERE p.id = canvas.playbook_id
          AND (p.user_id = auth.uid() OR EXISTS (
              SELECT 1 FROM "public"."playbook_runs" r
              WHERE r.id = canvas.run_id AND r.created_by = auth.uid()
          ))
    ));

DROP POLICY IF EXISTS "Owners can insert canvas documents" ON "public"."canvas";
CREATE POLICY "Owners can insert canvas documents" ON "public"."canvas"
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM "public"."playbooks" p
        WHERE p.id = canvas.playbook_id AND (p.user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM "public"."playbook_runs" r WHERE r.id = canvas.run_id AND r.created_by = auth.uid()
        ))
    ));

DROP POLICY IF EXISTS "Owners can update canvas documents" ON "public"."canvas";
CREATE POLICY "Owners can update canvas documents" ON "public"."canvas"
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM "public"."playbooks" p
        WHERE p.id = canvas.playbook_id AND (p.user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM "public"."playbook_runs" r WHERE r.id = canvas.run_id AND r.created_by = auth.uid()
        ))
    )) WITH CHECK (EXISTS (
        SELECT 1 FROM "public"."playbooks" p
        WHERE p.id = canvas.playbook_id AND (p.user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM "public"."playbook_runs" r WHERE r.id = canvas.run_id AND r.created_by = auth.uid()
        ))
    ));

DROP POLICY IF EXISTS "Owners can delete canvas documents" ON "public"."canvas";
CREATE POLICY "Owners can delete canvas documents" ON "public"."canvas"
    FOR DELETE USING (EXISTS (
        SELECT 1 FROM "public"."playbooks" p
        WHERE p.id = canvas.playbook_id AND (p.user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM "public"."playbook_runs" r WHERE r.id = canvas.run_id AND r.created_by = auth.uid()
        ))
    ));

-- Existing scoped keys keep their role semantics after Canvas is introduced.
UPDATE "public"."api_keys"
SET permissions = array_append(permissions, 'canvas:read')
WHERE role IN ('viewer', 'coworker') AND NOT ('canvas:read' = ANY(permissions));

UPDATE "public"."api_keys"
SET permissions = array_append(permissions, 'canvas:write')
WHERE role = 'coworker' AND NOT ('canvas:write' = ANY(permissions));
