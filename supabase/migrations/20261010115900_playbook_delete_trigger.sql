-- Deleting a playbook has been failing.
--
-- trigger_track_playbook_version ran AFTER DELETE as well as AFTER UPDATE, and
-- on delete it inserted a 'DELETE' row into playbook_versions for the playbook
-- that had just been removed. playbook_versions.playbook_id is a non-deferrable
-- foreign key to playbooks, so that insert violated it and rolled the whole
-- delete back: the dashboard's delete and the MCP delete_playbook tool could
-- not succeed. Production holds no 'DELETE' version rows at all.
--
-- The row could never have been useful anyway — playbook_versions cascades
-- from playbooks, so a version row for a deleted playbook is deleted with it.
-- The trigger now tracks updates only; the history of persona edits is
-- unchanged.

create or replace function public.track_playbook_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if old.persona_name is distinct from new.persona_name
    or old.persona_system_prompt is distinct from new.persona_system_prompt
    or old.persona_metadata is distinct from new.persona_metadata then
    insert into public.playbook_versions (playbook_id, persona_name, persona_system_prompt, persona_metadata, change_type)
    values (old.id, old.persona_name, old.persona_system_prompt, old.persona_metadata, 'UPDATE');
  end if;
  return new;
end;
$function$;

drop trigger if exists trigger_track_playbook_version on public.playbooks;
create trigger trigger_track_playbook_version
  after update on public.playbooks
  for each row execute function public.track_playbook_version();

revoke execute on function public.track_playbook_version() from public, anon, authenticated;
