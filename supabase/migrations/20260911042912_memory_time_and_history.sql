-- One user-facing time; archiving is independent of the longterm tier.
ALTER TABLE public.memories ADD COLUMN memory_at timestamptz;
UPDATE public.memories SET memory_at = coalesce(updated_at, now());
ALTER TABLE public.memories ALTER COLUMN memory_at SET DEFAULT now();
ALTER TABLE public.memories ALTER COLUMN memory_at SET NOT NULL;
ALTER TABLE public.memories ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.memories ADD COLUMN search_text text GENERATED ALWAYS AS (
  key || ' ' || coalesce(description, '') || ' ' || coalesce(summary, '') || ' ' || value::text
) STORED;

CREATE TABLE public.memory_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  playbook_id uuid NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  memory_at timestamptz NOT NULL,
  search_text text GENERATED ALWAYS AS (snapshot->>'search_text') STORED,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.memory_history ENABLE ROW LEVEL SECURITY;
-- History is served through the same application authorization as memory.
REVOKE ALL ON public.memory_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.memory_history TO service_role;

CREATE OR REPLACE FUNCTION public.track_memory_history()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  -- Reads and administrative tier/priority/archive changes do not create revisions.
  IF ROW(OLD.key, OLD.value, OLD.tags, OLD.description, OLD.summary, OLD.parent_key,
         OLD.memory_type, OLD.status, OLD.metadata, OLD.memory_at)
     IS DISTINCT FROM
     ROW(NEW.key, NEW.value, NEW.tags, NEW.description, NEW.summary, NEW.parent_key,
         NEW.memory_type, NEW.status, NEW.metadata, NEW.memory_at) THEN
    INSERT INTO public.memory_history(memory_id, playbook_id, snapshot, memory_at)
    VALUES (OLD.id, OLD.playbook_id, to_jsonb(OLD), OLD.memory_at);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.track_memory_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_memory_history() TO service_role;
CREATE TRIGGER track_memory_history AFTER UPDATE ON public.memories
FOR EACH ROW EXECUTE FUNCTION public.track_memory_history();

CREATE INDEX memories_active_time_idx ON public.memories(playbook_id, memory_at DESC, id DESC)
WHERE NOT is_archived;
CREATE INDEX memories_archived_time_idx ON public.memories(playbook_id, memory_at DESC, id DESC)
WHERE is_archived;
CREATE INDEX memory_history_parent_idx ON public.memory_history(memory_id, recorded_at DESC);
CREATE INDEX memory_history_playbook_idx ON public.memory_history(playbook_id);
CREATE INDEX memory_history_time_idx ON public.memory_history(playbook_id, memory_at DESC, id DESC);
-- Supabase OrioleDB currently supports B-tree indexes only. Keep its storage
-- engine and use the playbook/time indexes there; add trigram acceleration on
-- standard heap tables without making it a requirement for search correctness.
DO $$
DECLARE
  target_table text;
  trigram_schema text;
BEGIN
  FOR target_table IN
    SELECT c.relname FROM pg_class c JOIN pg_am a ON a.oid = c.relam
    WHERE c.oid IN ('public.memories'::regclass, 'public.memory_history'::regclass)
      AND a.amname = 'heap'
  LOOP
    CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
    SELECT n.nspname INTO trigram_schema FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm';
    EXECUTE format('CREATE INDEX %I ON public.%I USING gin(search_text %I.gin_trgm_ops)',
      target_table || '_search_idx', target_table, trigram_schema);
  END LOOP;
END;
$$;

-- A common, read-only projection keeps REST, MCP and the editor on the same search path.
-- The invoker must have access to both underlying tables; only the server role does.
CREATE VIEW public.memory_entries WITH (security_invoker = true) AS
SELECT m.id, m.id AS memory_id, NULL::uuid AS history_id,
       m.playbook_id, m.key, m.value, m.tags, m.description, m.updated_at,
       m.memory_at, m.is_archived, m.tier, m.parent_key, m.priority, m.access_count,
       m.last_accessed_at, m.summary, m.source_task_id, m.retention_policy,
       m.memory_type, m.status, m.metadata, m.search_text
FROM public.memories m
UNION ALL
SELECT h.id, h.memory_id, h.id AS history_id,
       h.playbook_id, s.key, s.value, s.tags, s.description, s.updated_at,
       h.memory_at, true AS is_archived, s.tier, s.parent_key, s.priority, s.access_count,
       s.last_accessed_at, s.summary, s.source_task_id, s.retention_policy,
       s.memory_type, s.status, s.metadata, h.search_text
FROM public.memory_history h
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.memories, h.snapshot) s;
REVOKE ALL ON public.memory_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.memory_entries TO service_role;

COMMENT ON COLUMN public.memories.memory_at IS 'Time represented by the memory; supplied by the writer or defaults to save time.';
COMMENT ON COLUMN public.memories.is_archived IS 'Hidden from normal search/context. Direct reads and explicit archive searches still find it.';
COMMENT ON TABLE public.memory_history IS 'Previous contents captured atomically on update; permanent deletion of a memory also deletes its history.';
