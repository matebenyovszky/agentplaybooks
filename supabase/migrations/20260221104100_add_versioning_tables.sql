-- ========================================================================================
-- Self-Evolving Agent (Kardashev L3) Version Control
-- Adds version tracking for skills and playbooks to allow safe self-modification
-- ========================================================================================

-- 1. Skill Versions Table
CREATE TABLE IF NOT EXISTS public.skill_versions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  playbook_id uuid NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  content text,
  recorded_at timestamptz DEFAULT now() NOT NULL,
  changed_by_api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL, -- Track if an agent made the change
  change_type text NOT NULL CHECK (change_type IN ('UPDATE', 'DELETE', 'MANUAL_SAVE'))
);

CREATE INDEX IF NOT EXISTS idx_skill_versions_skill_id ON public.skill_versions(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_versions_playbook_id ON public.skill_versions(playbook_id);

ALTER TABLE public.skill_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view versions of skills in their playbooks"
  ON public.skill_versions
  FOR SELECT
  TO authenticated
  USING (
    playbook_id IN (
      SELECT id FROM public.playbooks WHERE user_id = auth.uid()
    )
  );

-- Service role has full access
CREATE POLICY "Service role can manage all skill versions"
  ON public.skill_versions
  FOR ALL
  TO service_role
  USING (true);


-- 2. Playbook (Persona) Versions Table
CREATE TABLE IF NOT EXISTS public.playbook_versions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  playbook_id uuid NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  persona_name text,
  persona_system_prompt text,
  persona_metadata jsonb,
  recorded_at timestamptz DEFAULT now() NOT NULL,
  changed_by_api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  change_type text NOT NULL CHECK (change_type IN ('UPDATE', 'DELETE', 'MANUAL_SAVE'))
);

CREATE INDEX IF NOT EXISTS idx_playbook_versions_playbook_id ON public.playbook_versions(playbook_id);

ALTER TABLE public.playbook_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view versions of their playbooks"
  ON public.playbook_versions
  FOR SELECT
  TO authenticated
  USING (
    playbook_id IN (
      SELECT id FROM public.playbooks WHERE user_id = auth.uid()
    )
  );

-- Service role has full access
CREATE POLICY "Service role can manage all playbook versions"
  ON public.playbook_versions
  FOR ALL
  TO service_role
  USING (true);


-- ========================================================================================
-- Automatic Trigger Functions
-- ========================================================================================

-- Trigger function for Skills
CREATE OR REPLACE FUNCTION public.track_skill_version()
RETURNS TRIGGER AS $$
BEGIN
  -- We only track updates if relevant fields changed 
  IF TG_OP = 'UPDATE' THEN
    IF OLD.name IS DISTINCT FROM NEW.name OR OLD.description IS DISTINCT FROM NEW.description OR OLD.content IS DISTINCT FROM NEW.content THEN
      INSERT INTO public.skill_versions (skill_id, playbook_id, name, description, content, change_type)
      VALUES (OLD.id, OLD.playbook_id, OLD.name, OLD.description, OLD.content, 'UPDATE');
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.skill_versions (skill_id, playbook_id, name, description, content, change_type)
    VALUES (OLD.id, OLD.playbook_id, OLD.name, OLD.description, OLD.content, 'DELETE');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to Skills
DROP TRIGGER IF EXISTS trigger_track_skill_version ON public.skills;
CREATE TRIGGER trigger_track_skill_version
  AFTER UPDATE OR DELETE ON public.skills
  FOR EACH ROW
  EXECUTE FUNCTION public.track_skill_version();


-- Trigger function for Playbooks (Persona fields)
CREATE OR REPLACE FUNCTION public.track_playbook_version()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.persona_name IS DISTINCT FROM NEW.persona_name OR OLD.persona_system_prompt IS DISTINCT FROM NEW.persona_system_prompt OR OLD.persona_metadata IS DISTINCT FROM NEW.persona_metadata THEN
      INSERT INTO public.playbook_versions (playbook_id, persona_name, persona_system_prompt, persona_metadata, change_type)
      VALUES (OLD.id, OLD.persona_name, OLD.persona_system_prompt, OLD.persona_metadata, 'UPDATE');
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.playbook_versions (playbook_id, persona_name, persona_system_prompt, persona_metadata, change_type)
    VALUES (OLD.id, OLD.persona_name, OLD.persona_system_prompt, OLD.persona_metadata, 'DELETE');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to Playbooks
DROP TRIGGER IF EXISTS trigger_track_playbook_version ON public.playbooks;
CREATE TRIGGER trigger_track_playbook_version
  AFTER UPDATE OR DELETE ON public.playbooks
  FOR EACH ROW
  EXECUTE FUNCTION public.track_playbook_version();
