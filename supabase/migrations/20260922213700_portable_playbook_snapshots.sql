-- Private, immutable portable configuration backups. The playbook FK is set
-- null on deletion so an owner can still recover a deleted playbook by GUID.
create table if not exists public.playbook_snapshots (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid references public.playbooks(id) on delete set null,
  playbook_guid text not null,
  playbook_name text not null,
  owner_user_id uuid not null,
  created_by uuid,
  digest text not null check (digest ~ '^sha256:[0-9a-f]{64}$'),
  snapshot jsonb not null,
  file_count integer not null check (file_count between 1 and 1000),
  size_bytes integer not null check (size_bytes between 1 and 4194304),
  created_at timestamptz not null default now()
);

create index if not exists playbook_snapshots_owner_guid_created_idx
  on public.playbook_snapshots (owner_user_id, playbook_guid, created_at desc);
create index if not exists playbook_snapshots_playbook_created_idx
  on public.playbook_snapshots (playbook_id, created_at desc)
  where playbook_id is not null;

alter table public.playbook_snapshots enable row level security;
revoke all on public.playbook_snapshots from anon, authenticated;
grant all on public.playbook_snapshots to service_role;
-- Only the authenticated, role-checked management API uses the service role.
-- No direct Data API policy exposes backup contents to clients.
