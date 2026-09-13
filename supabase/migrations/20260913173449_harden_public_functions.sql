-- public is safe in a SECURITY DEFINER search path only while untrusted
-- callers cannot create objects there. Fail closed if that prerequisite drifts.
do $$
begin
  if has_schema_privilege('anon', 'public', 'CREATE')
    or has_schema_privilege('authenticated', 'public', 'CREATE') then
    raise exception 'Refusing function hardening: public schema is writable by an untrusted role';
  end if;
end;
$$;

-- Pin the ten legacy public functions to a trusted search path. This prevents a caller
-- from changing name resolution inside SECURITY DEFINER functions.
alter function public.add_skill_attachment(uuid, text, text, text, text, text)
  set search_path = pg_catalog, public, pg_temp;
alter function public.check_attachment_limit()
  set search_path = pg_catalog, public, pg_temp;
alter function public.handle_new_user()
  set search_path = pg_catalog, public, pg_temp;
alter function public.increment_usage_count(text, uuid)
  set search_path = pg_catalog, public, pg_temp;
alter function public.track_playbook_version()
  set search_path = pg_catalog, public, pg_temp;
alter function public.track_skill_version()
  set search_path = pg_catalog, public, pg_temp;
alter function public.update_playbook_star_count()
  set search_path = pg_catalog, public, pg_temp;
alter function public.update_secrets_updated_at()
  set search_path = pg_catalog, public, pg_temp;
alter function public.update_updated_at()
  set search_path = pg_catalog, public, pg_temp;
alter function public.update_updated_at_column()
  set search_path = pg_catalog, public, pg_temp;

-- Functions are executable by PUBLIC by default. Trigger functions do not
-- need to be directly callable, and the two standalone SECURITY DEFINER RPCs
-- are internal server helpers, so remove browser/Data API execution rights.
revoke execute on function public.add_skill_attachment(uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.check_attachment_limit()
  from public, anon, authenticated;
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
revoke execute on function public.increment_usage_count(text, uuid)
  from public, anon, authenticated;
revoke execute on function public.track_playbook_version()
  from public, anon, authenticated;
revoke execute on function public.track_skill_version()
  from public, anon, authenticated;
revoke execute on function public.update_playbook_star_count()
  from public, anon, authenticated;
revoke execute on function public.update_secrets_updated_at()
  from public, anon, authenticated;
revoke execute on function public.update_updated_at()
  from public, anon, authenticated;
revoke execute on function public.update_updated_at_column()
  from public, anon, authenticated;

-- Preserve the intentional trusted callers explicitly.
grant execute on function public.add_skill_attachment(uuid, text, text, text, text, text)
  to service_role;
grant execute on function public.increment_usage_count(text, uuid)
  to service_role;
grant execute on function public.handle_new_user()
  to supabase_auth_admin;
