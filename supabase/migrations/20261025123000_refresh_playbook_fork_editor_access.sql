-- One service-side RPC: all inserts roll back together on any failure.
-- Credentials, API keys, collaborators and runtime memory are not inherited.
CREATE OR REPLACE FUNCTION public.fork_playbook_with_content(
  p_source_id uuid, p_user_id uuid, p_guid text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  source public.playbooks%ROWTYPE;
  fork public.playbooks%ROWTYPE;
  source_skill public.skills%ROWTYPE;
  new_skill_id uuid;
  publisher uuid;
BEGIN
  SELECT * INTO source FROM public.playbooks WHERE id = p_source_id FOR SHARE;
  IF NOT FOUND OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Playbook not found' USING ERRCODE = 'P0002';
  END IF;
  -- Auditors may inspect audit evidence and metadata, never clone content.
  IF source.user_id <> p_user_id AND EXISTS (
    SELECT 1 FROM public.playbook_collaborators
    WHERE playbook_id = source.id AND user_id = p_user_id
      AND accepted_at IS NOT NULL AND role = 'auditor'
  ) THEN
    RAISE EXCEPTION 'Playbook not found' USING ERRCODE = 'P0002';
  END IF;
  IF source.visibility NOT IN ('public', 'unlisted')
     AND source.user_id <> p_user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.playbook_collaborators
       WHERE playbook_id = source.id AND user_id = p_user_id AND accepted_at IS NOT NULL AND role = 'editor'
     ) THEN
    RAISE EXCEPTION 'Playbook not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_guid IS NULL OR p_guid !~ '^[a-f0-9]{16}$' THEN
    RAISE EXCEPTION 'Invalid fork GUID' USING ERRCODE = '22023';
  END IF;
  publisher := source.publisher_id;
  IF publisher IS NULL THEN
    SELECT id INTO publisher FROM public.profiles WHERE auth_user_id = source.user_id;
  END IF;
  IF publisher IS NULL THEN
    RAISE EXCEPTION 'Publisher profile not found for source playbook';
  END IF;

  INSERT INTO public.playbooks (
    user_id, publisher_id, guid, name, description, visibility, config, tags,
    persona_name, persona_system_prompt, persona_metadata, instructions
  ) VALUES (
    p_user_id, publisher, p_guid, source.name || ' (Copy)', source.description,
    'private', source.config, source.tags, source.persona_name,
    source.persona_system_prompt, source.persona_metadata, source.instructions
  ) RETURNING * INTO fork;

  FOR source_skill IN SELECT * FROM public.skills WHERE playbook_id = source.id LOOP
    INSERT INTO public.skills (
      playbook_id, publisher_id, name, description, content, licence, priority
    ) VALUES (
      fork.id, COALESCE(source_skill.publisher_id, publisher), source_skill.name,
      source_skill.description, source_skill.content, source_skill.licence, source_skill.priority
    ) RETURNING id INTO new_skill_id;

    INSERT INTO public.skill_attachments (
      skill_id, filename, file_type, language, description, content, size_bytes
    ) SELECT new_skill_id, filename, file_type, language, description, content, size_bytes
      FROM public.skill_attachments WHERE skill_id = source_skill.id;
  END LOOP;

  -- Keep connection configuration and vault references. Referenced vault values
  -- must be configured separately by the new owner in the new playbook.
  INSERT INTO public.mcp_servers (
    playbook_id, publisher_id, name, description, tools, resources,
    transport_type, transport_config, source_registry, source_registry_id, source_url, source_version
  ) SELECT fork.id, COALESCE(publisher_id, publisher), name, description, tools, resources,
      transport_type, transport_config, source_registry, source_registry_id, source_url, source_version
    FROM public.mcp_servers WHERE playbook_id = source.id;

  RETURN to_jsonb(fork);
END;
$$;

-- The server supplies p_user_id only after verifying a session/control-plane key.
-- End users must never be able to choose another actor by calling this RPC directly.
REVOKE ALL ON FUNCTION public.fork_playbook_with_content(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fork_playbook_with_content(uuid, uuid, text) TO service_role;

COMMENT ON COLUMN public.playbook_collaborators.role IS
  'editor: content and secrets management. auditor: read/export audit logs and playbook metadata only. API-key mutation and sharing remain owner-only.';
