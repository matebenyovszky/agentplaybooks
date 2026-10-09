-- Proposals for review.
--
-- A playbook key with memory:propose or skills:propose may suggest a change
-- without the right to make it. The suggestion is stored next to the history
-- it would become part of — memory_history for memories, skill_versions for
-- skills — marked with review_status, until the owner or an editor approves or
-- rejects it. Ordinary history rows keep review_status NULL.
--
-- A proposal never takes effect on its own and is never read as data: the
-- memory_entries view (memory recall, search and history) and the skill
-- version list skip every row whose review_status is set.

-- Memories --------------------------------------------------------------------

-- A proposal for a key that does not exist yet has no memory to point at.
ALTER TABLE public.memory_history ALTER COLUMN memory_id DROP NOT NULL;
ALTER TABLE public.memory_history ADD COLUMN review_status text;
ALTER TABLE public.memory_history ADD COLUMN proposed_by text;
ALTER TABLE public.memory_history ADD COLUMN proposed_by_api_key_id uuid;
ALTER TABLE public.memory_history ADD COLUMN reviewed_at timestamptz;
ALTER TABLE public.memory_history ADD CONSTRAINT memory_history_review_status_check
  CHECK (review_status IS NULL OR review_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE public.memory_history ADD CONSTRAINT memory_history_memory_or_proposal_check
  CHECK (memory_id IS NOT NULL OR review_status IS NOT NULL);
CREATE INDEX memory_history_pending_idx ON public.memory_history(playbook_id, recorded_at DESC)
  WHERE review_status = 'pending';

CREATE OR REPLACE VIEW public.memory_entries WITH (security_invoker = true) AS
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
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.memories, h.snapshot) s
WHERE h.review_status IS NULL;

REVOKE ALL ON public.memory_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.memory_entries TO service_role;
GRANT UPDATE ON public.memory_history TO service_role;

-- Skills ----------------------------------------------------------------------

-- A proposal for a new skill has no skill to point at.
ALTER TABLE public.skill_versions ALTER COLUMN skill_id DROP NOT NULL;
ALTER TABLE public.skill_versions ADD COLUMN review_status text;
ALTER TABLE public.skill_versions ADD COLUMN proposed_by text;
ALTER TABLE public.skill_versions ADD COLUMN reviewed_at timestamptz;
ALTER TABLE public.skill_versions DROP CONSTRAINT skill_versions_change_type_check;
ALTER TABLE public.skill_versions ADD CONSTRAINT skill_versions_change_type_check
  CHECK (change_type IN ('UPDATE', 'DELETE', 'MANUAL_SAVE', 'PROPOSAL'));
ALTER TABLE public.skill_versions ADD CONSTRAINT skill_versions_review_status_check
  CHECK (review_status IS NULL OR review_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE public.skill_versions ADD CONSTRAINT skill_versions_proposal_check
  CHECK ((change_type = 'PROPOSAL') = (review_status IS NOT NULL));
ALTER TABLE public.skill_versions ADD CONSTRAINT skill_versions_skill_or_proposal_check
  CHECK (skill_id IS NOT NULL OR change_type = 'PROPOSAL');
CREATE INDEX skill_versions_pending_idx ON public.skill_versions(playbook_id, recorded_at DESC)
  WHERE review_status = 'pending';

-- Keys ------------------------------------------------------------------------

-- A proposer reads and proposes, but changes nothing directly.
ALTER TABLE public.api_keys DROP CONSTRAINT api_keys_role_check;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_role_check
  CHECK (role IN ('viewer', 'coworker', 'proposer', 'admin'));
