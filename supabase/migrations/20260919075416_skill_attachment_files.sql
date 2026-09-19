-- Skill attachments: let a skill bundle the files it actually needs.
--
-- Two constraints made the attachment feature unusable for the case it exists
-- for -- a skill whose instructions are backed by a script.
--
-- 1. `no_path_traversal` forbade every slash, so an attachment could only ever
--    be a flat filename. The `/.well-known/skills/` server on the other side
--    already serves `scripts/foo.py` and every other client expects that
--    layout, so the two halves of the feature disagreed. Rejecting all slashes
--    is a blunt way to stop traversal; the replacement allows exactly one
--    level, from a fixed set of directory names, which is not traversable.
--
-- 2. `max_file_size` capped a file at 50 KB. A real thin wrapper is bigger than
--    that: the Office COM layer these changes were written for is 49 KB today
--    and would have broken the next time anyone added a function. 256 KB with
--    ten files per skill is still a bounded row.
--
-- Applied to the production project on 2026-09-19 as version 20260919075416,
-- which is why this file carries that timestamp: `supabase db push` matches on
-- it and will not try to replay what is already there.
--
-- Both are CHECK constraints, so the ceiling is enforced here rather than only
-- in the TypeScript validator. Keep this in step with
-- `ATTACHMENT_LIMITS` in src/lib/supabase/types.ts, `isSafeSkillFile` in
-- src/lib/skill-markdown.ts, and supabase/schema.sql.

ALTER TABLE public.skill_attachments DROP CONSTRAINT IF EXISTS max_file_size;
ALTER TABLE public.skill_attachments
  ADD CONSTRAINT max_file_size CHECK (size_bytes <= 262144);

-- One regex replaces both filename constraints. It pins the start to an
-- alphanumeric, allows an optional single directory from the Agent Skills
-- convention, and permits nothing that could climb out of the skill directory:
-- no `..`, no backslash, no leading slash, no second level.
ALTER TABLE public.skill_attachments DROP CONSTRAINT IF EXISTS no_path_traversal;
ALTER TABLE public.skill_attachments DROP CONSTRAINT IF EXISTS safe_filename;
ALTER TABLE public.skill_attachments
  ADD CONSTRAINT safe_filename CHECK (
    length(filename) <= 100
    AND filename ~ '^(?:(?:scripts|references|assets|examples|templates)/)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$'
  );

-- Row-level security is deliberately untouched. The anon policy on
-- skill_attachments exposes public playbooks only, which is exactly what the
-- policy on `skills` does; unlisted playbooks reach a client through the API
-- route's service-role client instead. Widening one of the two without the
-- other is how the pair stops agreeing.
