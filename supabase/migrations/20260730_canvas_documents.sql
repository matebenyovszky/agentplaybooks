-- Upgrade the existing canvas model to isolated, versioned workflow runs.
-- This migration preserves canvas rows created by 20260221_create_canvas_table.sql.

CREATE TABLE IF NOT EXISTS public.playbook_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    playbook_id uuid NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    context jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT playbook_runs_id_playbook_unique UNIQUE (id, playbook_id)
);

CREATE INDEX IF NOT EXISTS playbook_runs_playbook_updated_idx
    ON public.playbook_runs (playbook_id, updated_at DESC);

ALTER TABLE public.canvas
    ADD COLUMN IF NOT EXISTS run_id uuid,
    ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Give every pre-existing canvas document a stable legacy run without losing data.
INSERT INTO public.playbook_runs (playbook_id, created_by, name, status, context)
SELECT DISTINCT canvas.playbook_id,
       playbooks.user_id,
       'Migrated canvas',
       'active',
       '{"migration":"20260730_canvas_documents"}'::jsonb
FROM public.canvas
JOIN public.playbooks ON playbooks.id = canvas.playbook_id
WHERE canvas.run_id IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.playbook_runs existing
      WHERE existing.playbook_id = canvas.playbook_id
        AND existing.context @> '{"migration":"20260730_canvas_documents"}'::jsonb
  );

UPDATE public.canvas
SET run_id = migrated.id
FROM public.playbook_runs migrated
WHERE canvas.run_id IS NULL
  AND migrated.playbook_id = canvas.playbook_id
  AND migrated.context @> '{"migration":"20260730_canvas_documents"}'::jsonb;

ALTER TABLE public.canvas
    ALTER COLUMN run_id SET NOT NULL;

ALTER TABLE public.canvas
    DROP CONSTRAINT IF EXISTS canvas_playbook_id_slug_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'canvas_version_positive'
          AND conrelid = 'public.canvas'::regclass
    ) THEN
        ALTER TABLE public.canvas
            ADD CONSTRAINT canvas_version_positive CHECK (version > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'canvas_run_slug_unique'
          AND conrelid = 'public.canvas'::regclass
    ) THEN
        ALTER TABLE public.canvas
            ADD CONSTRAINT canvas_run_slug_unique UNIQUE (run_id, slug);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'canvas_run_playbook_fk'
          AND conrelid = 'public.canvas'::regclass
    ) THEN
        ALTER TABLE public.canvas
            ADD CONSTRAINT canvas_run_playbook_fk
            FOREIGN KEY (run_id, playbook_id)
            REFERENCES public.playbook_runs(id, playbook_id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS canvas_playbook_sort_idx
    ON public.canvas (run_id, sort_order, updated_at DESC);

ALTER TABLE public.playbook_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Runs follow playbook access" ON public.playbook_runs;
CREATE POLICY "Runs follow playbook access" ON public.playbook_runs
    FOR SELECT USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.playbooks
            WHERE playbooks.id = playbook_runs.playbook_id
              AND playbooks.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.playbook_collaborators
            WHERE playbook_collaborators.playbook_id = playbook_runs.playbook_id
              AND playbook_collaborators.user_id = auth.uid()
              AND playbook_collaborators.accepted_at IS NOT NULL
        )
    );

DROP POLICY IF EXISTS "Users can create runs for accessible playbooks" ON public.playbook_runs;
CREATE POLICY "Users can create runs for accessible playbooks" ON public.playbook_runs
    FOR INSERT WITH CHECK (
        created_by = auth.uid()
        AND (
            EXISTS (
                SELECT 1 FROM public.playbooks
                WHERE playbooks.id = playbook_runs.playbook_id
                  AND playbooks.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.playbook_collaborators
                WHERE playbook_collaborators.playbook_id = playbook_runs.playbook_id
                  AND playbook_collaborators.user_id = auth.uid()
                  AND playbook_collaborators.accepted_at IS NOT NULL
            )
        )
    );

DROP POLICY IF EXISTS "Run creators can update runs" ON public.playbook_runs;
CREATE POLICY "Run creators can update runs" ON public.playbook_runs
    FOR UPDATE USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.playbooks
            WHERE playbooks.id = playbook_runs.playbook_id
              AND playbooks.user_id = auth.uid()
        )
    ) WITH CHECK (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.playbooks
            WHERE playbooks.id = playbook_runs.playbook_id
              AND playbooks.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Run creators can delete runs" ON public.playbook_runs;
CREATE POLICY "Run creators can delete runs" ON public.playbook_runs
    FOR DELETE USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.playbooks
            WHERE playbooks.id = playbook_runs.playbook_id
              AND playbooks.user_id = auth.uid()
        )
    );

-- Replace the legacy direct-client canvas policies with run-scoped access.
DROP POLICY IF EXISTS "Canvas: public read" ON public.canvas;
DROP POLICY IF EXISTS "Canvas: owner full access" ON public.canvas;
DROP POLICY IF EXISTS "Canvas: service role" ON public.canvas;
DROP POLICY IF EXISTS "Canvas documents follow playbook visibility" ON public.canvas;
DROP POLICY IF EXISTS "Owners can insert canvas documents" ON public.canvas;
DROP POLICY IF EXISTS "Owners can update canvas documents" ON public.canvas;
DROP POLICY IF EXISTS "Owners can delete canvas documents" ON public.canvas;

CREATE POLICY "Canvas documents follow run access" ON public.canvas
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.playbook_runs
            WHERE playbook_runs.id = canvas.run_id
              AND (
                  playbook_runs.created_by = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.playbooks
                      WHERE playbooks.id = canvas.playbook_id
                        AND playbooks.user_id = auth.uid()
                  )
                  OR EXISTS (
                      SELECT 1 FROM public.playbook_collaborators
                      WHERE playbook_collaborators.playbook_id = canvas.playbook_id
                        AND playbook_collaborators.user_id = auth.uid()
                        AND playbook_collaborators.accepted_at IS NOT NULL
                  )
              )
        )
    );

CREATE POLICY "Canvas writers follow run access" ON public.canvas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.playbook_runs
            WHERE playbook_runs.id = canvas.run_id
              AND (
                  playbook_runs.created_by = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.playbooks
                      WHERE playbooks.id = canvas.playbook_id
                        AND playbooks.user_id = auth.uid()
                  )
                  OR EXISTS (
                      SELECT 1 FROM public.playbook_collaborators
                      WHERE playbook_collaborators.playbook_id = canvas.playbook_id
                        AND playbook_collaborators.user_id = auth.uid()
                        AND playbook_collaborators.accepted_at IS NOT NULL
                  )
              )
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.playbook_runs
            WHERE playbook_runs.id = canvas.run_id
              AND playbook_runs.playbook_id = canvas.playbook_id
        )
    );

UPDATE public.api_keys
SET permissions = array_append(permissions, 'canvas:read')
WHERE role IN ('viewer', 'coworker')
  AND NOT ('canvas:read' = ANY(permissions));

UPDATE public.api_keys
SET permissions = array_append(permissions, 'canvas:write')
WHERE role = 'coworker'
  AND NOT ('canvas:write' = ANY(permissions));
