-- Proposals: a skill change or a memory entry suggested for a playbook and
-- waiting for its owner or an editor to approve or reject it. Submitting needs
-- proposals:write; reading and reviewing need owner or editor access, so a
-- proposer key cannot list proposals, its own included.
create table if not exists public.playbook_proposals (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  kind text not null check (kind in ('skill', 'memory')),
  target text not null check (char_length(target) between 1 and 200),
  payload jsonb not null,
  rationale text check (rationale is null or char_length(rationale) <= 4000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_via text not null check (submitted_via in ('session', 'user_key', 'playbook_key')),
  submitted_by uuid,
  submitter_key_prefix text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 4000),
  applied_ref text,
  created_at timestamptz not null default now(),
  constraint playbook_proposals_review_state check ((status = 'pending') = (reviewed_at is null))
);

create index if not exists playbook_proposals_playbook_status_idx
  on public.playbook_proposals (playbook_id, status, created_at desc);

alter table public.playbook_proposals enable row level security;
revoke all on public.playbook_proposals from anon, authenticated;
grant all on public.playbook_proposals to service_role;

-- A playbook key that may only propose.
alter table public.api_keys drop constraint if exists api_keys_role_check;
alter table public.api_keys add constraint api_keys_role_check
  check (role = any (array['viewer'::text, 'coworker'::text, 'proposer'::text, 'admin'::text]));
