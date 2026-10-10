-- Self-service account deletion.
--
-- Deleting the auth.users row already cascades to most of an account: every
-- playbook it owns (and through playbooks: skills, attachments, memory and its
-- history, canvas, runs, MCP servers, playbook keys, secrets, audit logs,
-- versions, collaborators, stars), its profile, its user API keys, its stars,
-- and Supabase's own sessions and OAuth grants. What does not cascade is the
-- handful of rows that reference the user without a foreign key, or through a
-- NO ACTION key that would make the delete fail outright. This function clears
-- those first and then deletes the user, in one transaction: an account is
-- either gone completely or untouched, never half-deleted.
--
-- What deliberately stays: rows in playbooks *other people* own that record
-- something this user did there — a secret's created_by, a proposal's
-- proposed_by, an audit log's actor_id, a collaborator row's invited_by. Those
-- belong to the playbook owner's history, and once the account is deleted the
-- id they hold no longer resolves to anyone.

create or replace function public.delete_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_profiles uuid[];
  v_playbooks integer;
begin
  if p_user_id is null then
    raise exception 'delete_account: user id is required';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'delete_account: no such user';
  end if;

  select coalesce(array_agg(id), '{}') into v_profiles
    from public.profiles where auth_user_id = p_user_id;
  select count(*) into v_playbooks
    from public.playbooks where user_id = p_user_id;

  -- publisher_id references profiles with NO ACTION. In the user's own
  -- playbooks those rows go in the same cascade as the profile; in anyone
  -- else's they would block the delete, so the attribution is cleared there.
  update public.playbooks set publisher_id = null
    where publisher_id = any(v_profiles) and user_id <> p_user_id;
  update public.skills s set publisher_id = null
    from public.playbooks p
    where s.playbook_id = p.id and p.user_id <> p_user_id and s.publisher_id = any(v_profiles);
  update public.mcp_servers m set publisher_id = null
    from public.playbooks p
    where m.playbook_id = p.id and p.user_id <> p_user_id and m.publisher_id = any(v_profiles);

  -- No foreign key on these, so nothing would remove them.
  -- Memberships in other people's playbooks, and invitations the user sent
  -- that nobody has accepted yet.
  delete from public.playbook_collaborators where user_id = p_user_id;
  delete from public.playbook_collaborators where user_id is null and invited_by = p_user_id;
  -- Portable backups outlive their playbook (playbook_id is SET NULL), so the
  -- ones this account owns are removed by owner, not by playbook.
  delete from public.playbook_snapshots where owner_user_id = p_user_id;
  update public.playbook_snapshots set created_by = null where created_by = p_user_id;
  -- A leftover copy of memories from an earlier migration, without a key to
  -- playbooks. Not every deployment has it.
  if to_regclass('public.memories_backup') is not null then
    execute 'delete from public.memories_backup where playbook_id in (select id from public.playbooks where user_id = $1)'
      using p_user_id;
  end if;

  delete from auth.users where id = p_user_id;

  return jsonb_build_object('playbooks_deleted', v_playbooks);
end;
$$;

-- Server-side only: the API route checks the caller's session and the typed
-- confirmation before calling this with the service role.
revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
