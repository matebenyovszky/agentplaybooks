-- AgentPlaybooks — consolidated baseline schema
--
-- Generated from the live database, and the file that was missing: everything
-- in supabase/migrations/ was incremental, so no CREATE TABLE existed anywhere
-- for playbooks, skills, mcp_servers, memories, api_keys, profiles and the
-- rest. A fresh database could not be built from this repository at all.
--
-- This is a snapshot of the schema as it stands, not a replay of the 32
-- migrations that produced it. Apply it to an empty project first; only
-- migrations dated after it still need to run.
--
-- Objects in the auth, storage and supabase_* schemas belong to Supabase and
-- are deliberately not reproduced. Policies here reference auth.uid(), so the
-- Supabase stack has to be present — a bare PostgreSQL server will reject them.

-- --------------------------------------------------------------------
-- Extensions (3)
-- --------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS extensions;

-- Column defaults call extensions.uuid_generate_v4(), so the extension
-- has to live in that schema, which is where Supabase puts it.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- --------------------------------------------------------------------
-- Types (2)
-- --------------------------------------------------------------------

DO $$ BEGIN CREATE TYPE public.attachment_file_type AS ENUM ('typescript', 'javascript', 'python', 'go', 'rust', 'sql', 'markdown', 'json', 'yaml', 'text', 'cursorrules', 'shell'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE public.visibility AS ENUM ('public', 'private', 'unlisted'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- --------------------------------------------------------------------
-- Tables (18)
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  playbook_id uuid NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  name text,
  permissions text[] DEFAULT '{memory:read,memory:write}'::text[] NOT NULL,
  last_used_at timestamp with time zone,
  expires_at timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  role text DEFAULT 'viewer'::text NOT NULL,
  rotated_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  playbook_id uuid NOT NULL,
  mcp_server_id uuid,
  operation text NOT NULL,
  target text,
  status text NOT NULL,
  latency_ms integer DEFAULT 0 NOT NULL,
  error_code text,
  request_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  actor_type text,
  actor_id text,
  secret_name text,
  prev_hash text,
  hash text
);

CREATE TABLE IF NOT EXISTS public.canvas (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  playbook_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  content text DEFAULT ''::text NOT NULL,
  sections jsonb DEFAULT '[]'::jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  run_id uuid NOT NULL,
  version integer DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.mcp_servers (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  playbook_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  tools jsonb DEFAULT '[]'::jsonb,
  resources jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  transport_type text DEFAULT 'http'::text,
  transport_config jsonb DEFAULT '{}'::jsonb,
  source_registry text,
  source_registry_id text,
  source_url text,
  source_version text,
  publisher_id uuid
);

CREATE TABLE IF NOT EXISTS public.memories (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  playbook_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  tags text[] DEFAULT '{}'::text[],
  description text,
  tier text DEFAULT 'contextual'::text,
  parent_key text,
  priority integer DEFAULT 50,
  access_count integer DEFAULT 0,
  last_accessed_at timestamp with time zone,
  summary text,
  source_task_id text,
  retention_policy text DEFAULT 'auto'::text,
  memory_type text DEFAULT 'flat'::text,
  status text,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.memories_backup (
  id uuid,
  playbook_id uuid,
  key text,
  value jsonb,
  updated_at timestamp with time zone,
  tags text[],
  description text,
  tier text,
  parent_key text,
  priority integer,
  access_count integer,
  last_accessed_at timestamp with time zone,
  summary text,
  source_task_id text,
  retention_policy text,
  memory_type text,
  status text,
  metadata jsonb
);

CREATE TABLE IF NOT EXISTS public.playbook_collaborators (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  playbook_id uuid NOT NULL,
  user_id uuid,
  invited_by uuid NOT NULL,
  invite_token_hash text NOT NULL,
  invite_expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  role text DEFAULT 'editor'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.playbook_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  playbook_id uuid NOT NULL,
  created_by uuid,
  name text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.playbook_stars (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  playbook_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.playbook_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  playbook_id uuid NOT NULL,
  persona_name text,
  persona_system_prompt text,
  persona_metadata jsonb,
  recorded_at timestamp with time zone DEFAULT now() NOT NULL,
  changed_by_api_key_id uuid,
  change_type text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.playbooks (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  guid text NOT NULL,
  name text NOT NULL,
  description text,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  star_count integer DEFAULT 0,
  tags text[] DEFAULT '{}'::text[],
  persona_name text,
  persona_system_prompt text,
  persona_metadata jsonb DEFAULT '{}'::jsonb,
  publisher_id uuid,
  visibility visibility DEFAULT 'private'::visibility NOT NULL,
  instructions text
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  auth_user_id uuid,
  display_name text NOT NULL,
  avatar_svg text,
  website_url text,
  description text,
  is_verified boolean DEFAULT false,
  is_virtual boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.secrets (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  playbook_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  encrypted_value text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  category text DEFAULT 'general'::text NOT NULL,
  rotated_at timestamp with time zone,
  expires_at timestamp with time zone,
  last_used_at timestamp with time zone,
  use_count integer DEFAULT 0 NOT NULL,
  created_by text,
  updated_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  allow_api_key_reveal boolean DEFAULT false NOT NULL,
  allowed_hosts text[]
);

CREATE TABLE IF NOT EXISTS public.skill_attachments (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  skill_id uuid NOT NULL,
  filename text NOT NULL,
  file_type attachment_file_type NOT NULL,
  language text,
  description text,
  content text NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.skill_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  skill_id uuid NOT NULL,
  playbook_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  content text,
  recorded_at timestamp with time zone DEFAULT now() NOT NULL,
  changed_by_api_key_id uuid,
  change_type text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.skills (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  playbook_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  priority integer DEFAULT 0,
  content text,
  publisher_id uuid,
  licence text
);

CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  name text,
  permissions text[] DEFAULT '{}'::text[] NOT NULL,
  last_used_at timestamp with time zone,
  expires_at timestamp with time zone,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- --------------------------------------------------------------------
-- Constraints (68)
-- --------------------------------------------------------------------

ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);

ALTER TABLE public.audit_logs ADD CONSTRAINT mcp_proxy_audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.canvas ADD CONSTRAINT canvas_pkey PRIMARY KEY (id);

ALTER TABLE public.mcp_servers ADD CONSTRAINT mcp_servers_pkey PRIMARY KEY (id);

ALTER TABLE public.memories ADD CONSTRAINT memories_pkey PRIMARY KEY (id);

ALTER TABLE public.playbook_collaborators ADD CONSTRAINT playbook_collaborators_pkey PRIMARY KEY (id);

ALTER TABLE public.playbook_runs ADD CONSTRAINT playbook_runs_pkey PRIMARY KEY (id);

ALTER TABLE public.playbook_stars ADD CONSTRAINT playbook_stars_pkey PRIMARY KEY (id);

ALTER TABLE public.playbook_versions ADD CONSTRAINT playbook_versions_pkey PRIMARY KEY (id);

ALTER TABLE public.playbooks ADD CONSTRAINT playbooks_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.secrets ADD CONSTRAINT secrets_pkey PRIMARY KEY (id);

ALTER TABLE public.skill_attachments ADD CONSTRAINT skill_attachments_pkey PRIMARY KEY (id);

ALTER TABLE public.skill_versions ADD CONSTRAINT skill_versions_pkey PRIMARY KEY (id);

ALTER TABLE public.skills ADD CONSTRAINT skills_pkey PRIMARY KEY (id);

ALTER TABLE public.user_api_keys ADD CONSTRAINT user_api_keys_pkey PRIMARY KEY (id);

ALTER TABLE public.canvas ADD CONSTRAINT canvas_run_slug_unique UNIQUE (run_id, slug);

ALTER TABLE public.memories ADD CONSTRAINT memories_playbook_id_key_key UNIQUE (playbook_id, key);

ALTER TABLE public.playbook_collaborators ADD CONSTRAINT playbook_collaborators_invite_token_hash_key UNIQUE (invite_token_hash);

ALTER TABLE public.playbook_runs ADD CONSTRAINT playbook_runs_id_playbook_unique UNIQUE (id, playbook_id);

ALTER TABLE public.playbook_stars ADD CONSTRAINT playbook_stars_playbook_id_user_id_key UNIQUE (playbook_id, user_id);

ALTER TABLE public.playbooks ADD CONSTRAINT playbooks_guid_key UNIQUE (guid);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_user_id_key UNIQUE (auth_user_id);

ALTER TABLE public.secrets ADD CONSTRAINT secrets_playbook_id_name_key UNIQUE (playbook_id, name);

ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_role_check CHECK ((role = ANY (ARRAY['viewer'::text, 'coworker'::text, 'proposer'::text, 'admin'::text, 'auditor'::text])));

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'denied'::text, 'error'::text])));

ALTER TABLE public.canvas ADD CONSTRAINT canvas_version_positive CHECK ((version > 0));

ALTER TABLE public.memories ADD CONSTRAINT memories_memory_type_check CHECK ((memory_type = ANY (ARRAY['flat'::text, 'hierarchical'::text])));

ALTER TABLE public.memories ADD CONSTRAINT memories_retention_policy_check CHECK ((retention_policy = ANY (ARRAY['permanent'::text, 'session'::text, 'auto'::text])));

ALTER TABLE public.memories ADD CONSTRAINT memories_status_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'blocked'::text]))));

ALTER TABLE public.memories ADD CONSTRAINT memories_tier_check CHECK ((tier = ANY (ARRAY['working'::text, 'contextual'::text, 'longterm'::text])));

ALTER TABLE public.playbook_collaborators ADD CONSTRAINT playbook_collaborators_state_check CHECK ((((user_id IS NULL) AND (accepted_at IS NULL)) OR ((user_id IS NOT NULL) AND (accepted_at IS NOT NULL))));

ALTER TABLE public.playbook_collaborators ADD CONSTRAINT playbook_collaborators_role_check CHECK ((role = ANY (ARRAY['editor'::text, 'auditor'::text])));

ALTER TABLE public.playbook_runs ADD CONSTRAINT playbook_runs_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'archived'::text])));

ALTER TABLE public.playbook_versions ADD CONSTRAINT playbook_versions_change_type_check CHECK ((change_type = ANY (ARRAY['UPDATE'::text, 'DELETE'::text, 'MANUAL_SAVE'::text])));

ALTER TABLE public.secrets ADD CONSTRAINT secrets_category_check CHECK ((category = ANY (ARRAY['api_key'::text, 'password'::text, 'token'::text, 'certificate'::text, 'connection_string'::text, 'general'::text])));

ALTER TABLE public.skill_attachments ADD CONSTRAINT content_size_match CHECK ((octet_length(content) = size_bytes));

ALTER TABLE public.skill_attachments ADD CONSTRAINT max_file_size CHECK ((size_bytes <= 262144));


ALTER TABLE public.skill_attachments ADD CONSTRAINT safe_filename CHECK (((length(filename) <= 100) AND (filename ~ '^(?:(?:scripts|references|assets|examples|templates)/)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$'::text)));

ALTER TABLE public.skill_versions ADD CONSTRAINT skill_versions_change_type_check CHECK ((change_type = ANY (ARRAY['UPDATE'::text, 'DELETE'::text, 'MANUAL_SAVE'::text])));

ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

ALTER TABLE public.canvas ADD CONSTRAINT canvas_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

ALTER TABLE public.canvas ADD CONSTRAINT canvas_run_playbook_fk FOREIGN KEY (run_id, playbook_id) REFERENCES playbook_runs(id, playbook_id) ON DELETE CASCADE;

ALTER TABLE public.mcp_servers ADD CONSTRAINT mcp_servers_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

ALTER TABLE public.mcp_servers ADD CONSTRAINT mcp_servers_publisher_id_fkey FOREIGN KEY (publisher_id) REFERENCES profiles(id);

ALTER TABLE public.memories ADD CONSTRAINT memories_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

ALTER TABLE public.playbook_collaborators ADD CONSTRAINT playbook_collaborators_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

ALTER TABLE public.playbook_runs ADD CONSTRAINT playbook_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.playbook_runs ADD CONSTRAINT playbook_runs_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

ALTER TABLE public.playbook_stars ADD CONSTRAINT playbook_stars_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

ALTER TABLE public.playbook_stars ADD CONSTRAINT playbook_stars_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.playbook_versions ADD CONSTRAINT playbook_versions_changed_by_api_key_id_fkey FOREIGN KEY (changed_by_api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL;

ALTER TABLE public.playbook_versions ADD CONSTRAINT playbook_versions_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

ALTER TABLE public.playbooks ADD CONSTRAINT playbooks_publisher_id_fkey FOREIGN KEY (publisher_id) REFERENCES profiles(id);

ALTER TABLE public.playbooks ADD CONSTRAINT playbooks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.secrets ADD CONSTRAINT secrets_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

ALTER TABLE public.skill_attachments ADD CONSTRAINT skill_attachments_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE;

ALTER TABLE public.skill_versions ADD CONSTRAINT skill_versions_changed_by_api_key_id_fkey FOREIGN KEY (changed_by_api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL;

ALTER TABLE public.skill_versions ADD CONSTRAINT skill_versions_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

ALTER TABLE public.skill_versions ADD CONSTRAINT skill_versions_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE;

ALTER TABLE public.skills ADD CONSTRAINT skills_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

ALTER TABLE public.skills ADD CONSTRAINT skills_publisher_id_fkey FOREIGN KEY (publisher_id) REFERENCES profiles(id);

ALTER TABLE public.user_api_keys ADD CONSTRAINT user_api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- --------------------------------------------------------------------
-- Indexes (42)
-- --------------------------------------------------------------------

CREATE INDEX idx_api_keys_key_hash ON public.api_keys USING btree (key_hash);

CREATE INDEX idx_api_keys_playbook_id ON public.api_keys USING btree (playbook_id);

CREATE INDEX audit_logs_playbook_created_idx ON public.audit_logs USING btree (playbook_id, created_at DESC);

CREATE UNIQUE INDEX audit_logs_playbook_prev_hash_idx ON public.audit_logs USING btree (playbook_id, prev_hash) WHERE (prev_hash IS NOT NULL);

CREATE INDEX canvas_playbook_sort_idx ON public.canvas USING btree (run_id, sort_order, updated_at DESC);

CREATE INDEX idx_canvas_playbook ON public.canvas USING btree (playbook_id);

CREATE INDEX idx_canvas_sections ON public.canvas USING gin (sections);

CREATE INDEX idx_canvas_slug ON public.canvas USING btree (playbook_id, slug);

CREATE INDEX idx_mcp_servers_playbook_id ON public.mcp_servers USING btree (playbook_id);

CREATE INDEX idx_mcp_servers_source_registry ON public.mcp_servers USING btree (source_registry, source_registry_id) WHERE (source_registry IS NOT NULL);

CREATE INDEX idx_memories_access ON public.memories USING btree (playbook_id, access_count DESC, last_accessed_at DESC);

CREATE INDEX idx_memories_description ON public.memories USING gin (to_tsvector('english'::regconfig, COALESCE(description, ''::text)));

CREATE INDEX idx_memories_metadata ON public.memories USING gin (metadata);

CREATE INDEX idx_memories_parent_key ON public.memories USING btree (playbook_id, parent_key);

CREATE INDEX idx_memories_playbook_id ON public.memories USING btree (playbook_id);

CREATE INDEX idx_memories_priority ON public.memories USING btree (playbook_id, priority DESC);

CREATE INDEX idx_memories_status ON public.memories USING btree (playbook_id, status) WHERE (status IS NOT NULL);

CREATE INDEX idx_memories_tags ON public.memories USING gin (tags);

CREATE INDEX idx_memories_tier ON public.memories USING btree (playbook_id, tier);

CREATE INDEX idx_memories_type ON public.memories USING btree (playbook_id, memory_type);

CREATE INDEX idx_memories_working ON public.memories USING btree (playbook_id, updated_at DESC) WHERE (tier = 'working'::text);

CREATE UNIQUE INDEX playbook_collaborators_playbook_user_idx ON public.playbook_collaborators USING btree (playbook_id, user_id) WHERE (user_id IS NOT NULL);

CREATE INDEX playbook_collaborators_user_idx ON public.playbook_collaborators USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE INDEX playbook_runs_playbook_updated_idx ON public.playbook_runs USING btree (playbook_id, updated_at DESC);

CREATE INDEX idx_playbook_stars_playbook ON public.playbook_stars USING btree (playbook_id);

CREATE INDEX idx_playbook_stars_user ON public.playbook_stars USING btree (user_id);

CREATE INDEX idx_playbook_versions_playbook_id ON public.playbook_versions USING btree (playbook_id);

CREATE INDEX idx_playbooks_guid ON public.playbooks USING btree (guid);

CREATE INDEX idx_playbooks_publisher_id ON public.playbooks USING btree (publisher_id);

CREATE INDEX idx_playbooks_user_id ON public.playbooks USING btree (user_id);

CREATE INDEX idx_profiles_auth_user_id ON public.profiles USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);

CREATE INDEX idx_profiles_verified ON public.profiles USING btree (is_verified) WHERE (is_verified = true);

CREATE INDEX idx_secrets_category ON public.secrets USING btree (playbook_id, category);

CREATE INDEX idx_secrets_expires ON public.secrets USING btree (expires_at) WHERE (expires_at IS NOT NULL);

CREATE INDEX idx_secrets_playbook ON public.secrets USING btree (playbook_id);

CREATE INDEX idx_skill_attachments_file_type ON public.skill_attachments USING btree (file_type);

CREATE INDEX idx_skill_attachments_skill_id ON public.skill_attachments USING btree (skill_id);

CREATE INDEX idx_skill_versions_playbook_id ON public.skill_versions USING btree (playbook_id);

CREATE INDEX idx_skill_versions_skill_id ON public.skill_versions USING btree (skill_id);

CREATE INDEX idx_skills_playbook_id ON public.skills USING btree (playbook_id);

CREATE INDEX idx_skills_publisher_id ON public.skills USING btree (publisher_id);

CREATE INDEX user_api_keys_key_hash_idx ON public.user_api_keys USING btree (key_hash);

CREATE INDEX user_api_keys_user_id_idx ON public.user_api_keys USING btree (user_id);

-- --------------------------------------------------------------------
-- Functions (10)
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_skill_attachment(p_skill_id uuid, p_filename text, p_file_type text, p_content text, p_language text DEFAULT NULL::text, p_description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_attachment_id UUID;
  v_size INTEGER;
BEGIN
  v_size := octet_length(p_content);
  
  IF p_file_type NOT IN ('typescript', 'javascript', 'python', 'go', 'rust', 'sql', 'markdown', 'json', 'yaml', 'text', 'cursorrules', 'shell') THEN
    RAISE EXCEPTION 'Invalid file type: %', p_file_type;
  END IF;
  
  INSERT INTO skill_attachments (skill_id, filename, file_type, content, size_bytes, language, description)
  VALUES (p_skill_id, p_filename, p_file_type::attachment_file_type, p_content, v_size, p_language, p_description)
  RETURNING id INTO v_attachment_id;
  
  RETURN v_attachment_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_attachment_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (SELECT COUNT(*) FROM skill_attachments WHERE skill_id = NEW.skill_id) >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 attachments per skill allowed';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, auth_user_id, display_name, is_virtual, is_verified)
  VALUES (
    gen_random_uuid(),
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    false,
    false
  )
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_usage_count(table_name text, item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF table_name = 'public_skills' THEN
        UPDATE public_skills SET usage_count = usage_count + 1 WHERE id = item_id;
    ELSIF table_name = 'public_mcp_servers' THEN
        UPDATE public_mcp_servers SET usage_count = usage_count + 1 WHERE id = item_id;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.track_playbook_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.track_skill_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- We only track updates if relevant fields changed 
  IF TG_OP = 'UPDATE' THEN
    IF OLD.name IS DISTINCT FROM NEW.name OR OLD.description IS DISTINCT FROM NEW.description OR OLD.content IS DISTINCT FROM NEW.content THEN
      INSERT INTO public.skill_versions (skill_id, playbook_id, name, description, content, change_type)
      VALUES (OLD.id, OLD.playbook_id, OLD.name, OLD.description, OLD.content, 'UPDATE');
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_playbook_star_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE playbooks SET star_count = star_count + 1 WHERE id = NEW.playbook_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE playbooks SET star_count = GREATEST(0, star_count - 1) WHERE id = OLD.playbook_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_secrets_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

-- --------------------------------------------------------------------
-- Triggers (9)
-- --------------------------------------------------------------------

CREATE TRIGGER memories_updated_at BEFORE UPDATE ON public.memories FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER playbook_stars_count_trigger AFTER INSERT OR DELETE ON public.playbook_stars FOR EACH ROW EXECUTE FUNCTION update_playbook_star_count();

CREATE TRIGGER playbooks_updated_at BEFORE UPDATE ON public.playbooks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_track_playbook_version AFTER DELETE OR UPDATE ON public.playbooks FOR EACH ROW EXECUTE FUNCTION track_playbook_version();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER secrets_updated_at BEFORE UPDATE ON public.secrets FOR EACH ROW EXECUTE FUNCTION update_secrets_updated_at();

CREATE TRIGGER enforce_attachment_limit BEFORE INSERT ON public.skill_attachments FOR EACH ROW EXECUTE FUNCTION check_attachment_limit();

CREATE TRIGGER update_skill_attachments_updated_at BEFORE UPDATE ON public.skill_attachments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_track_skill_version AFTER UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION track_skill_version();

-- --------------------------------------------------------------------
-- Row Level Security (18)
-- --------------------------------------------------------------------

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.canvas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.memories_backup ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.playbook_collaborators ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.playbook_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.playbook_stars ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.playbook_versions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.secrets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.skill_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.skill_versions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- Policies (46)
-- --------------------------------------------------------------------

CREATE POLICY "Owner access api_keys" ON public.api_keys AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = api_keys.playbook_id) AND (playbooks.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = api_keys.playbook_id) AND (playbooks.user_id = auth.uid())))));

CREATE POLICY "Owners can read audit logs" ON public.audit_logs AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = audit_logs.playbook_id) AND (playbooks.user_id = auth.uid())))));

CREATE POLICY "Auditors can read audit logs" ON public.audit_logs AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM playbook_collaborators
  WHERE ((playbook_collaborators.playbook_id = audit_logs.playbook_id) AND (playbook_collaborators.user_id = auth.uid()) AND (playbook_collaborators.accepted_at IS NOT NULL) AND (playbook_collaborators.role = 'auditor'::text)))));

CREATE POLICY "Canvas documents follow run access" ON public.canvas AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM playbook_runs
  WHERE ((playbook_runs.id = canvas.run_id) AND ((playbook_runs.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM playbooks
          WHERE ((playbooks.id = canvas.playbook_id) AND (playbooks.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM playbook_collaborators
          WHERE ((playbook_collaborators.playbook_id = canvas.playbook_id) AND (playbook_collaborators.user_id = auth.uid()) AND (playbook_collaborators.accepted_at IS NOT NULL)))))))));

CREATE POLICY "Canvas writers follow run access" ON public.canvas AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM playbook_runs
  WHERE ((playbook_runs.id = canvas.run_id) AND ((playbook_runs.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM playbooks
          WHERE ((playbooks.id = canvas.playbook_id) AND (playbooks.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM playbook_collaborators
          WHERE ((playbook_collaborators.playbook_id = canvas.playbook_id) AND (playbook_collaborators.user_id = auth.uid()) AND (playbook_collaborators.accepted_at IS NOT NULL))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM playbook_runs
  WHERE ((playbook_runs.id = canvas.run_id) AND (playbook_runs.playbook_id = canvas.playbook_id)))));

CREATE POLICY "Anyone can read mcp_servers from public playbooks" ON public.mcp_servers AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM playbooks p
  WHERE ((p.id = mcp_servers.playbook_id) AND (p.visibility = 'public'::visibility)))));

CREATE POLICY "Owner access mcp_servers" ON public.mcp_servers AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = mcp_servers.playbook_id) AND (playbooks.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = mcp_servers.playbook_id) AND (playbooks.user_id = auth.uid())))));

CREATE POLICY "Owner access memories" ON public.memories AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = memories.playbook_id) AND (playbooks.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = memories.playbook_id) AND (playbooks.user_id = auth.uid())))));

CREATE POLICY "Run creators can delete runs" ON public.playbook_runs AS PERMISSIVE FOR DELETE TO public USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = playbook_runs.playbook_id) AND (playbooks.user_id = auth.uid()))))));

CREATE POLICY "Run creators can update runs" ON public.playbook_runs AS PERMISSIVE FOR UPDATE TO public USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = playbook_runs.playbook_id) AND (playbooks.user_id = auth.uid())))))) WITH CHECK (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = playbook_runs.playbook_id) AND (playbooks.user_id = auth.uid()))))));

CREATE POLICY "Runs follow playbook access" ON public.playbook_runs AS PERMISSIVE FOR SELECT TO public USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = playbook_runs.playbook_id) AND (playbooks.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM playbook_collaborators
  WHERE ((playbook_collaborators.playbook_id = playbook_runs.playbook_id) AND (playbook_collaborators.user_id = auth.uid()) AND (playbook_collaborators.accepted_at IS NOT NULL))))));

CREATE POLICY "Users can create runs for accessible playbooks" ON public.playbook_runs AS PERMISSIVE FOR INSERT TO public WITH CHECK (((created_by = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = playbook_runs.playbook_id) AND (playbooks.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM playbook_collaborators
  WHERE ((playbook_collaborators.playbook_id = playbook_runs.playbook_id) AND (playbook_collaborators.user_id = auth.uid()) AND (playbook_collaborators.accepted_at IS NOT NULL)))))));

CREATE POLICY "Anyone can see stars" ON public.playbook_stars AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Authenticated users can star" ON public.playbook_stars AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can unstar their own" ON public.playbook_stars AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));

CREATE POLICY "Service role can manage all playbook versions" ON public.playbook_versions AS PERMISSIVE FOR ALL TO service_role USING (true);

CREATE POLICY "Users can view versions of their playbooks" ON public.playbook_versions AS PERMISSIVE FOR SELECT TO authenticated USING ((playbook_id IN ( SELECT playbooks.id
   FROM playbooks
  WHERE (playbooks.user_id = auth.uid()))));

CREATE POLICY "Anyone can read public playbooks" ON public.playbooks AS PERMISSIVE FOR SELECT TO public USING ((visibility = 'public'::visibility));

CREATE POLICY "Public playbooks are readable" ON public.playbooks AS PERMISSIVE FOR SELECT TO public USING ((visibility = 'public'::visibility));

CREATE POLICY "Users can delete own playbooks" ON public.playbooks AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can insert own playbooks" ON public.playbooks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can manage own playbooks" ON public.playbooks AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can read own playbooks" ON public.playbooks AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Auditors can read playbook metadata" ON public.playbooks AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM playbook_collaborators
  WHERE ((playbook_collaborators.playbook_id = playbooks.id) AND (playbook_collaborators.user_id = auth.uid()) AND (playbook_collaborators.accepted_at IS NOT NULL) AND (playbook_collaborators.role = 'auditor'::text)))));

CREATE POLICY "Users can update own playbooks" ON public.playbooks AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Anyone can read profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Service role can update any profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth_user_id = auth.uid()) AND (id = auth.uid())));

CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth_user_id = auth.uid())) WITH CHECK ((auth_user_id = auth.uid()));

CREATE POLICY "Secrets: owner full access" ON public.secrets AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = secrets.playbook_id) AND (playbooks.user_id = auth.uid())))));

CREATE POLICY "Secrets: service role" ON public.secrets AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Anyone can read attachments from public playbooks" ON public.skill_attachments AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (skills s
     JOIN playbooks p ON ((p.id = s.playbook_id)))
  WHERE ((s.id = skill_attachments.skill_id) AND (p.visibility = 'public'::visibility)))));

CREATE POLICY "Users can delete own attachments" ON public.skill_attachments AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (skills s
     JOIN playbooks p ON ((p.id = s.playbook_id)))
  WHERE ((s.id = skill_attachments.skill_id) AND (p.user_id = auth.uid())))));

CREATE POLICY "Users can insert own attachments" ON public.skill_attachments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (skills s
     JOIN playbooks p ON ((p.id = s.playbook_id)))
  WHERE ((s.id = skill_attachments.skill_id) AND (p.user_id = auth.uid())))));

CREATE POLICY "Users can read own attachments" ON public.skill_attachments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (skills s
     JOIN playbooks p ON ((p.id = s.playbook_id)))
  WHERE ((s.id = skill_attachments.skill_id) AND (p.user_id = auth.uid())))));

CREATE POLICY "Users can update own attachments" ON public.skill_attachments AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (skills s
     JOIN playbooks p ON ((p.id = s.playbook_id)))
  WHERE ((s.id = skill_attachments.skill_id) AND (p.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (skills s
     JOIN playbooks p ON ((p.id = s.playbook_id)))
  WHERE ((s.id = skill_attachments.skill_id) AND (p.user_id = auth.uid())))));

CREATE POLICY "Service role can manage all skill versions" ON public.skill_versions AS PERMISSIVE FOR ALL TO service_role USING (true);

CREATE POLICY "Users can delete versions of skills in their playbooks" ON public.skill_versions AS PERMISSIVE FOR DELETE TO authenticated USING ((playbook_id IN ( SELECT playbooks.id
   FROM playbooks
  WHERE (playbooks.user_id = auth.uid()))));

CREATE POLICY "Users can view versions of skills in their playbooks" ON public.skill_versions AS PERMISSIVE FOR SELECT TO authenticated USING ((playbook_id IN ( SELECT playbooks.id
   FROM playbooks
  WHERE (playbooks.user_id = auth.uid()))));

CREATE POLICY "Anyone can read skills from public playbooks" ON public.skills AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM playbooks p
  WHERE ((p.id = skills.playbook_id) AND (p.visibility = 'public'::visibility)))));

CREATE POLICY "Owner access skills" ON public.skills AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = skills.playbook_id) AND (playbooks.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = skills.playbook_id) AND (playbooks.user_id = auth.uid())))));

CREATE POLICY "Public playbook skills readable" ON public.skills AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM playbooks
  WHERE ((playbooks.id = skills.playbook_id) AND (playbooks.visibility = 'public'::visibility)))));

CREATE POLICY "Users can read own skills" ON public.skills AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM playbooks p
  WHERE ((p.id = skills.playbook_id) AND (p.user_id = auth.uid())))));

CREATE POLICY "Service role can manage all user API keys" ON public.user_api_keys AS PERMISSIVE FOR ALL TO service_role USING (true);

CREATE POLICY "Users can delete their own API keys" ON public.user_api_keys AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert their own API keys" ON public.user_api_keys AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update their own API keys" ON public.user_api_keys AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their own API keys" ON public.user_api_keys AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));

-- Immutable, private portable configuration backups. Retained by GUID even
-- when the corresponding playbook is deleted.
CREATE TABLE IF NOT EXISTS public.playbook_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid REFERENCES public.playbooks(id) ON DELETE SET NULL,
  playbook_guid text NOT NULL,
  playbook_name text NOT NULL,
  owner_user_id uuid NOT NULL,
  created_by uuid,
  digest text NOT NULL CHECK (digest ~ '^sha256:[0-9a-f]{64}$'),
  snapshot jsonb NOT NULL,
  file_count integer NOT NULL CHECK (file_count BETWEEN 1 AND 1000),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 4194304),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS playbook_snapshots_owner_guid_created_idx
  ON public.playbook_snapshots (owner_user_id, playbook_guid, created_at DESC);
CREATE INDEX IF NOT EXISTS playbook_snapshots_playbook_created_idx
  ON public.playbook_snapshots (playbook_id, created_at DESC) WHERE playbook_id IS NOT NULL;
ALTER TABLE public.playbook_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.playbook_snapshots FROM anon, authenticated;
GRANT ALL ON public.playbook_snapshots TO service_role;

-- --------------------------------------------------------------------
-- Folded in from 20260911042912_memory_time_and_history.sql and
-- 20260913173449_harden_public_functions.sql, which this snapshot missed:
-- without them a fresh database has no memory_entries view or
-- memory_history table, and memory search fails.
-- --------------------------------------------------------------------

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

-- --------------------------------------------------------------------
-- Folded in from 20261024120000_audit_logs_compliance.sql
-- Keep this section identical to the migration below.
-- --------------------------------------------------------------------

-- @manual-production-migration
-- Audit-log compliance: hash chain, auditor role, retention checkpoints.
--
-- PRODUCTION: this migration rewrites every existing audit_logs row to backfill
-- prev_hash/hash. Apply only with operator approval, during a maintenance
-- window, after a backup. Follow scripts/ops/audit-migration/RUNBOOK.md
-- (preflight, in-DB copy, pg_dump, postflight, rollback). It is backwards
-- compatible (new columns are additive; existing readers ignore them) but it
-- must not be run unattended against prod. Apply before merging/deploying the
-- app change; the previously deployed app tolerates the additive schema.
--
-- Fresh installs that already applied an updated supabase/schema.sql are a
-- no-op on the ADD COLUMN / CREATE TABLE IF NOT EXISTS statements.

BEGIN;
SET LOCAL lock_timeout = '10s';
-- Keep old writers blocked while triggers are disabled and rows are backfilled.
-- A failure rolls back both the data changes and trigger state.
LOCK TABLE public.audit_logs IN SHARE ROW EXCLUSIVE MODE;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Role column is referenced by auditor RLS policies below, so it must exist first.
ALTER TABLE public.playbook_collaborators
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'editor';
ALTER TABLE public.playbook_collaborators
  DROP CONSTRAINT IF EXISTS playbook_collaborators_role_check;
ALTER TABLE public.playbook_collaborators
  ADD CONSTRAINT playbook_collaborators_role_check
  CHECK (role IN ('editor', 'auditor'));
COMMENT ON COLUMN public.playbook_collaborators.role IS
  'editor: content write, no secrets. auditor: read/export audit logs and playbook metadata only.';

-- The membership table itself has RLS with no client SELECT policy. Check only
-- the caller's accepted auditor membership without exposing invite hashes or
-- granting access to the full private playbook row.
CREATE SCHEMA IF NOT EXISTS audit_private;
REVOKE ALL ON SCHEMA audit_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA audit_private TO authenticated, service_role;
CREATE OR REPLACE FUNCTION audit_private.is_auditor(p_playbook_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.playbook_collaborators c
    WHERE c.playbook_id = p_playbook_id
      AND c.user_id = (SELECT auth.uid())
      AND c.accepted_at IS NOT NULL AND c.role = 'auditor'
  );
$$;
REVOKE ALL ON FUNCTION audit_private.is_auditor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION audit_private.is_auditor(uuid) TO authenticated, service_role;

ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_role_check;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_role_check
  CHECK (role IN ('viewer', 'coworker', 'proposer', 'admin', 'auditor'));

-- --------------------------------------------------------------------
-- Hash chain columns
-- --------------------------------------------------------------------

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS prev_hash text,
  ADD COLUMN IF NOT EXISTS hash text;

COMMENT ON COLUMN public.audit_logs.prev_hash IS
  'SHA-256 hex of the previous row in this playbook chain, or 64 zeros for genesis / a retention checkpoint.';
COMMENT ON COLUMN public.audit_logs.hash IS
  'SHA-256 hex of the canonical JSON of this row (including prev_hash, excluding hash).';

-- Full ordering lets the chain-tip lookup stop at the first valid tip.
CREATE INDEX IF NOT EXISTS audit_logs_chain_tip_order_idx
  ON public.audit_logs (playbook_id, created_at DESC, id DESC)
  INCLUDE (hash)
  WHERE hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_playbook_prev_hash_idx
  ON public.audit_logs (playbook_id, prev_hash)
  WHERE prev_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_playbook_hash_idx
  ON public.audit_logs (playbook_id, hash) WHERE hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.audit_chain_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_seq bigint GENERATED ALWAYS AS IDENTITY,
  playbook_id uuid NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  anchor_hash text NOT NULL,
  purged_through timestamptz NOT NULL,
  purged_through_id uuid,
  purged_count integer NOT NULL CHECK (purged_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_chain_checkpoints
  ADD COLUMN IF NOT EXISTS checkpoint_seq bigint GENERATED ALWAYS AS IDENTITY;

COMMENT ON TABLE public.audit_chain_checkpoints IS
  'Anchor hashes for prefixes removed by retention. Remaining rows chain from the latest anchor_hash.';

CREATE INDEX IF NOT EXISTS audit_chain_checkpoints_playbook_created_idx
  ON public.audit_chain_checkpoints (playbook_id, checkpoint_seq DESC);

ALTER TABLE public.audit_chain_checkpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read audit chain checkpoints" ON public.audit_chain_checkpoints;
CREATE POLICY "Owners can read audit chain checkpoints"
  ON public.audit_chain_checkpoints FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.playbooks
    WHERE playbooks.id = audit_chain_checkpoints.playbook_id
      AND playbooks.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Auditors can read audit chain checkpoints" ON public.audit_chain_checkpoints;
CREATE POLICY "Auditors can read audit chain checkpoints"
  ON public.audit_chain_checkpoints FOR SELECT TO authenticated
  USING (audit_private.is_auditor(playbook_id));

REVOKE ALL ON public.audit_chain_checkpoints FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_chain_checkpoints TO authenticated;
GRANT ALL ON public.audit_chain_checkpoints TO service_role;
GRANT SELECT ON public.audit_logs TO authenticated;

-- --------------------------------------------------------------------
-- Canonical JSON + trigger (must match src/lib/audit-chain.ts)
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_log_canonical(
  p_id uuid,
  p_playbook_id uuid,
  p_mcp_server_id uuid,
  p_operation text,
  p_target text,
  p_status text,
  p_latency_ms integer,
  p_error_code text,
  p_actor_type text,
  p_actor_id text,
  p_secret_name text,
  p_request_id text,
  p_created_at timestamptz,
  p_prev_hash text
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT concat(
    '{',
    '"actor_id":', COALESCE(to_json(p_actor_id)::text, 'null'), ',',
    '"actor_type":', COALESCE(to_json(p_actor_type)::text, 'null'), ',',
    '"created_at":', to_json(to_char(timezone('UTC', p_created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text, ',',
    '"error_code":', COALESCE(to_json(p_error_code)::text, 'null'), ',',
    '"id":', to_json(p_id::text)::text, ',',
    '"latency_ms":', COALESCE(p_latency_ms, 0)::text, ',',
    '"mcp_server_id":', COALESCE(to_json(p_mcp_server_id::text)::text, 'null'), ',',
    '"operation":', to_json(p_operation)::text, ',',
    '"playbook_id":', to_json(p_playbook_id::text)::text, ',',
    '"prev_hash":', to_json(COALESCE(p_prev_hash, repeat('0', 64)))::text, ',',
    '"request_id":', COALESCE(to_json(p_request_id)::text, 'null'), ',',
    '"secret_name":', COALESCE(to_json(p_secret_name)::text, 'null'), ',',
    '"status":', to_json(p_status)::text, ',',
    '"target":', COALESCE(to_json(p_target)::text, 'null'),
    '}'
  );
$$;

CREATE OR REPLACE FUNCTION public.audit_logs_assign_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  prev text;
  canonical text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit_logs rows are immutable';
  END IF;

  PERFORM pg_advisory_xact_lock(('x' || substr(md5(NEW.playbook_id::text), 1, 16))::bit(64)::bigint);

  IF NEW.prev_hash IS NULL THEN
    -- Chain tip: the hash no other row in this playbook uses as prev_hash.
    -- Do not ORDER BY created_at, id — now() is transaction-stable, so several
    -- rows share a timestamp, and UUID id is not insertion order. That made
    -- sequential INSERTs in one transaction collide on playbook_prev_hash_idx.
    SELECT a.hash INTO prev
    FROM public.audit_logs a
    WHERE a.playbook_id = NEW.playbook_id
      AND a.hash IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.audit_logs child
        WHERE child.playbook_id = a.playbook_id
          AND child.prev_hash = a.hash
      )
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 1;

    IF prev IS NULL THEN
      SELECT c.anchor_hash INTO prev
      FROM public.audit_chain_checkpoints c
      WHERE c.playbook_id = NEW.playbook_id
      ORDER BY c.checkpoint_seq DESC
      LIMIT 1;
    END IF;

    NEW.prev_hash := COALESCE(prev, repeat('0', 64));
  END IF;

  canonical := public.audit_log_canonical(
    NEW.id,
    NEW.playbook_id,
    NEW.mcp_server_id,
    NEW.operation,
    NEW.target,
    NEW.status,
    NEW.latency_ms,
    NEW.error_code,
    NEW.actor_type,
    NEW.actor_id,
    NEW.secret_name,
    NEW.request_id,
    NEW.created_at,
    NEW.prev_hash
  );
  NEW.hash := encode(extensions.digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_assign_hash ON public.audit_logs;
CREATE TRIGGER audit_logs_assign_hash
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_logs_assign_hash();

DROP TRIGGER IF EXISTS audit_logs_deny_update ON public.audit_logs;
CREATE TRIGGER audit_logs_deny_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_logs_assign_hash();

REVOKE ALL ON FUNCTION public.audit_log_canonical(uuid, uuid, uuid, text, text, text, integer, text, text, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_log_canonical(uuid, uuid, uuid, text, text, text, integer, text, text, text, text, text, timestamptz, text) TO service_role;

REVOKE ALL ON FUNCTION public.audit_logs_assign_hash() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_logs_assign_hash() TO service_role;

-- Backfill existing rows in chain order. The trigger is INSERT-only for hashing;
-- this UPDATE is the one allowed rewrite, so the deny-update trigger is dropped
-- around it and recreated above after this block... actually the deny trigger
-- is already in place. Disable it for the backfill.

ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_deny_update;
ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_assign_hash;

DO $$
DECLARE
  pb uuid;
  rec record;
  prev text;
  canonical text;
  next_hash text;
BEGIN
  PERFORM set_config('search_path', 'pg_catalog, public, extensions, pg_temp', true);
  FOR pb IN
    SELECT DISTINCT playbook_id FROM public.audit_logs ORDER BY playbook_id
  LOOP
    prev := repeat('0', 64);
    FOR rec IN
      SELECT * FROM public.audit_logs
      WHERE playbook_id = pb
      ORDER BY created_at ASC, id ASC
    LOOP
      IF rec.hash IS NOT NULL AND rec.prev_hash IS NOT NULL THEN
        prev := rec.hash;
        CONTINUE;
      END IF;
      canonical := public.audit_log_canonical(
        rec.id, rec.playbook_id, rec.mcp_server_id, rec.operation, rec.target,
        rec.status, rec.latency_ms, rec.error_code, rec.actor_type, rec.actor_id,
        rec.secret_name, rec.request_id, rec.created_at, prev
      );
      next_hash := encode(extensions.digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex');
      UPDATE public.audit_logs
        SET prev_hash = prev, hash = next_hash
      WHERE id = rec.id;
      prev := next_hash;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_assign_hash;
ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_deny_update;

-- --------------------------------------------------------------------
-- Retention purge: delete a prefix, keep an anchor, write an audit row
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_audit_logs(
  p_older_than timestamptz,
  p_playbook_id uuid DEFAULT NULL,
  p_actor_type text DEFAULT 'system',
  p_actor_id text DEFAULT 'retention'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  playbook uuid;
  last_row public.audit_logs%ROWTYPE;
  start_hash text;
  purge_ids uuid[];
  n integer;
  total integer := 0;
  playbooks_touched integer := 0;
BEGIN
  IF p_older_than IS NULL THEN
    RAISE EXCEPTION 'p_older_than is required';
  END IF;

  FOR playbook IN
    SELECT DISTINCT playbook_id
    FROM public.audit_logs
    WHERE created_at < p_older_than
      AND (p_playbook_id IS NULL OR playbook_id = p_playbook_id)
  LOOP
    PERFORM pg_advisory_xact_lock(('x' || substr(md5(playbook::text), 1, 16))::bit(64)::bigint);

    SELECT c.anchor_hash INTO start_hash
    FROM public.audit_chain_checkpoints c WHERE c.playbook_id = playbook
    ORDER BY c.checkpoint_seq DESC LIMIT 1;
    start_hash := COALESCE(start_hash, repeat('0', 64));

    -- Retention removes a chain prefix, not every row with an old timestamp.
    -- Transaction timestamps can tie or move backwards relative to append order.
    WITH RECURSIVE prefix AS (
      SELECT a.id, a.hash, 1 AS depth FROM public.audit_logs a
      WHERE a.playbook_id = playbook AND a.prev_hash = start_hash
        AND a.created_at < p_older_than
      UNION ALL
      SELECT child.id, child.hash, parent.depth + 1
      FROM prefix parent JOIN public.audit_logs child
        ON child.playbook_id = playbook AND child.prev_hash = parent.hash
      WHERE child.created_at < p_older_than
    )
    SELECT array_agg(id ORDER BY depth), count(*)::integer
      INTO purge_ids, n FROM prefix;
    CONTINUE WHEN n = 0;

    SELECT * INTO last_row FROM public.audit_logs
    WHERE id = purge_ids[array_length(purge_ids, 1)];

    INSERT INTO public.audit_chain_checkpoints (
      playbook_id, anchor_hash, purged_through, purged_through_id, purged_count
    ) VALUES (
      playbook, last_row.hash, last_row.created_at, last_row.id, n
    );

    DELETE FROM public.audit_logs
    WHERE playbook_id = playbook AND id = ANY(purge_ids);

    INSERT INTO public.audit_logs (
      playbook_id, operation, status, actor_type, actor_id, target
    ) VALUES (
      playbook,
      'audit.retention_purge',
      'success',
      COALESCE(p_actor_type, 'system'),
      COALESCE(p_actor_id, 'retention'),
      to_char(timezone('UTC', p_older_than), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );

    total := total + n;
    playbooks_touched := playbooks_touched + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'purged', total,
    'playbooks', playbooks_touched,
    'older_than', p_older_than
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_audit_logs(timestamptz, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_audit_logs(timestamptz, uuid, text, text) TO service_role;

-- --------------------------------------------------------------------
-- Auditor collaborator role (column added at top; policies here)
-- --------------------------------------------------------------------

DROP POLICY IF EXISTS "Auditors can read audit logs" ON public.audit_logs;
CREATE POLICY "Auditors can read audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (audit_private.is_auditor(playbook_id));

-- Playbook-scoped API key role used for machine auditors (no vault access).
ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_role_check;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_role_check
  CHECK (role IN ('viewer', 'coworker', 'proposer', 'admin', 'auditor'));

-- The authorized application API returns metadata to auditors. A SELECT policy
-- on this table would expose instructions/persona/config as well as metadata.
DROP POLICY IF EXISTS "Auditors can read playbook metadata" ON public.playbooks;

-- Memory and canvas writes (metadata only: key / slug, not bodies).
CREATE OR REPLACE FUNCTION audit_private.request_actor(OUT actor_type text, OUT actor_id text, OUT request_id text)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  claims json := nullif(current_setting('request.jwt.claims', true), '')::json;
  headers json := nullif(current_setting('request.headers', true), '')::json;
  claimed text;
BEGIN
  request_id := left(COALESCE(headers ->> 'x-apb-request-id', headers ->> 'x-request-id', headers ->> 'cf-ray'), 128);
  IF claims ->> 'role' = 'service_role' THEN
    claimed := headers ->> 'x-apb-actor';
    IF claimed IS NOT NULL AND position(':' IN claimed) > 1 THEN
      actor_type := left(split_part(claimed, ':', 1), 32);
      actor_id := nullif(left(substr(claimed, position(':' IN claimed) + 1), 128), '');
      RETURN;
    END IF;
    actor_type := 'system';
    actor_id := 'service_role';
    RETURN;
  END IF;
  IF claims ->> 'sub' IS NOT NULL THEN
    actor_type := 'owner';
    actor_id := left(claims ->> 'sub', 128);
    RETURN;
  END IF;
  actor_type := 'system';
  actor_id := current_user::text;
END;
$$;

CREATE OR REPLACE FUNCTION audit_private.record_content_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  entity text;
  ignored text[];
  old_row jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  new_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  row_data jsonb := COALESCE(new_row, old_row);
  changed text[] := ARRAY[]::text[];
  col text;
  op text;
  label text;
  playbook uuid;
  actor record;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'memories' THEN
      entity := 'memory';
      ignored := ARRAY['access_count', 'last_accessed_at', 'updated_at', 'search_text'];
      playbook := (row_data ->> 'playbook_id')::uuid;
      label := row_data ->> 'key';
    WHEN 'canvas' THEN
      entity := 'canvas';
      ignored := ARRAY['updated_at'];
      playbook := (row_data ->> 'playbook_id')::uuid;
      label := row_data ->> 'slug';
    ELSE
      RETURN NULL;
  END CASE;

  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM public.playbooks p WHERE p.id = playbook) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR col IN SELECT jsonb_object_keys(new_row) LOOP
      CONTINUE WHEN col = ANY(ignored);
      IF new_row -> col IS DISTINCT FROM old_row -> col THEN
        changed := changed || col;
      END IF;
    END LOOP;
    IF cardinality(changed) = 0 THEN
      RETURN NULL;
    END IF;
  END IF;

  op := entity || CASE TG_OP
    WHEN 'INSERT' THEN '.create'
    WHEN 'DELETE' THEN '.delete'
    ELSE '.update'
  END;

  SELECT * INTO actor FROM audit_private.request_actor();

  INSERT INTO public.audit_logs (playbook_id, operation, target, status, actor_type, actor_id, request_id)
  VALUES (
    playbook,
    op,
    left(concat_ws(' ',
      entity || ':' || COALESCE(label, row_data ->> 'id'),
      CASE WHEN cardinality(changed) > 0 THEN 'changed=' || array_to_string(changed, ',') END
    ), 500),
    'success',
    actor.actor_type,
    actor.actor_id,
    actor.request_id
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION audit_private.request_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION audit_private.record_content_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_content_change ON public.memories;
CREATE TRIGGER audit_content_change
  AFTER INSERT OR UPDATE OR DELETE ON public.memories
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_content_change();

DROP TRIGGER IF EXISTS audit_content_change ON public.canvas;
CREATE TRIGGER audit_content_change
  AFTER INSERT OR UPDATE OR DELETE ON public.canvas
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_content_change();

COMMIT;

-- --------------------------------------------------------------------
-- Folded in from 20261025124500_audit_logs_tamper_resistance.sql
-- Keep this section identical to the migration.
-- --------------------------------------------------------------------

-- The audit trail outlives what it describes, and only retention deletes it.
--
-- Until now three ordinary operations erased audit history without leaving a
-- trace:
--
--   * deleting a playbook cascaded to every audit row of that playbook
--     (audit_logs.playbook_id and audit_chain_checkpoints.playbook_id were
--     ON DELETE CASCADE), and deleting an account deletes its playbooks;
--   * deleting a federated MCP server cascaded to the rows of its calls
--     (audit_logs.mcp_server_id), which also broke the playbook's hash chain;
--   * any role with DELETE or TRUNCATE on the table could remove rows; only
--     UPDATE was refused.
--
-- After this migration:
--
--   * audit_logs and audit_chain_checkpoints keep the playbook and server ids
--     as plain values, without foreign keys, so the trail of a deleted playbook,
--     server or account stays in the table and its chain still verifies;
--   * DELETE on audit_logs is refused unless it comes from
--     public.purge_audit_logs, the retention function, which records a
--     checkpoint and an audit.retention_purge row for every prefix it removes;
--   * TRUNCATE is refused on both tables, and checkpoints cannot be changed or
--     deleted at all;
--   * the API roles lose UPDATE, DELETE and TRUNCATE on both tables.
--
-- A database superuser can still disable triggers. That is outside what a
-- database can enforce on itself; forwarding the trail to an external syslog or
-- SIEM (AUDIT_SYSLOG_URL / AUDIT_SIEM_WEBHOOK_URL) is what makes such an edit
-- detectable.
--
-- No row is rewritten: this is DDL plus function replacements only.

BEGIN;
SET LOCAL lock_timeout = '10s';

-- --------------------------------------------------------------------
-- 1. No cascades into the trail
-- --------------------------------------------------------------------

-- The constraints still carry the table's former name.
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS mcp_proxy_audit_logs_playbook_id_fkey;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS mcp_proxy_audit_logs_mcp_server_id_fkey;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_playbook_id_fkey;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_mcp_server_id_fkey;
ALTER TABLE public.audit_chain_checkpoints DROP CONSTRAINT IF EXISTS audit_chain_checkpoints_playbook_id_fkey;

COMMENT ON COLUMN public.audit_logs.playbook_id IS
  'The playbook the event belongs to. Deliberately not a foreign key: the trail outlives the playbook.';
COMMENT ON COLUMN public.audit_logs.mcp_server_id IS
  'The federated server of a call, if any. Deliberately not a foreign key: the trail outlives the server.';

-- --------------------------------------------------------------------
-- 2. Only retention deletes rows
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_logs_deny_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- purge_audit_logs sets this transaction-local flag around its own DELETE.
  -- The API roles cannot run arbitrary SQL, so they cannot set it.
  IF TG_OP = 'DELETE' AND current_setting('agentplaybooks.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit trail rows cannot be removed outside retention (public.purge_audit_logs): %', lower(TG_OP)
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_chain_checkpoints_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'audit chain checkpoints cannot be changed (%)', lower(TG_OP)
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_deny_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_deny_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_logs_deny_delete();

DROP TRIGGER IF EXISTS audit_logs_deny_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_deny_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.audit_logs_deny_delete();

DROP TRIGGER IF EXISTS audit_chain_checkpoints_immutable ON public.audit_chain_checkpoints;
CREATE TRIGGER audit_chain_checkpoints_immutable
  BEFORE UPDATE OR DELETE ON public.audit_chain_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_chain_checkpoints_immutable();

DROP TRIGGER IF EXISTS audit_chain_checkpoints_deny_truncate ON public.audit_chain_checkpoints;
CREATE TRIGGER audit_chain_checkpoints_deny_truncate
  BEFORE TRUNCATE ON public.audit_chain_checkpoints
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.audit_chain_checkpoints_immutable();

REVOKE ALL ON FUNCTION public.audit_logs_deny_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_chain_checkpoints_immutable() FROM PUBLIC, anon, authenticated;

-- The API roles append and read; they never change or remove history.
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC, anon, authenticated, service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_chain_checkpoints FROM PUBLIC, anon, authenticated, service_role;

-- --------------------------------------------------------------------
-- 3. Retention is the one deleter
-- --------------------------------------------------------------------

-- Same body as in 20261024120000_audit_logs_compliance.sql, with the purge flag
-- set around the DELETE.
CREATE OR REPLACE FUNCTION public.purge_audit_logs(
  p_older_than timestamptz,
  p_playbook_id uuid DEFAULT NULL,
  p_actor_type text DEFAULT 'system',
  p_actor_id text DEFAULT 'retention'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  playbook uuid;
  last_row public.audit_logs%ROWTYPE;
  start_hash text;
  purge_ids uuid[];
  n integer;
  total integer := 0;
  playbooks_touched integer := 0;
BEGIN
  IF p_older_than IS NULL THEN
    RAISE EXCEPTION 'p_older_than is required';
  END IF;

  FOR playbook IN
    SELECT DISTINCT playbook_id
    FROM public.audit_logs
    WHERE created_at < p_older_than
      AND (p_playbook_id IS NULL OR playbook_id = p_playbook_id)
  LOOP
    PERFORM pg_advisory_xact_lock(('x' || substr(md5(playbook::text), 1, 16))::bit(64)::bigint);

    SELECT c.anchor_hash INTO start_hash
    FROM public.audit_chain_checkpoints c WHERE c.playbook_id = playbook
    ORDER BY c.checkpoint_seq DESC LIMIT 1;
    start_hash := COALESCE(start_hash, repeat('0', 64));

    -- Retention removes a chain prefix, not every row with an old timestamp.
    -- Transaction timestamps can tie or move backwards relative to append order.
    WITH RECURSIVE prefix AS (
      SELECT a.id, a.hash, 1 AS depth FROM public.audit_logs a
      WHERE a.playbook_id = playbook AND a.prev_hash = start_hash
        AND a.created_at < p_older_than
      UNION ALL
      SELECT child.id, child.hash, parent.depth + 1
      FROM prefix parent JOIN public.audit_logs child
        ON child.playbook_id = playbook AND child.prev_hash = parent.hash
      WHERE child.created_at < p_older_than
    )
    SELECT array_agg(id ORDER BY depth), count(*)::integer
      INTO purge_ids, n FROM prefix;
    CONTINUE WHEN n = 0;

    SELECT * INTO last_row FROM public.audit_logs
    WHERE id = purge_ids[array_length(purge_ids, 1)];

    INSERT INTO public.audit_chain_checkpoints (
      playbook_id, anchor_hash, purged_through, purged_through_id, purged_count
    ) VALUES (
      playbook, last_row.hash, last_row.created_at, last_row.id, n
    );

    PERFORM set_config('agentplaybooks.audit_purge', 'on', true);
    DELETE FROM public.audit_logs
    WHERE playbook_id = playbook AND id = ANY(purge_ids);
    PERFORM set_config('agentplaybooks.audit_purge', 'off', true);

    INSERT INTO public.audit_logs (
      playbook_id, operation, status, actor_type, actor_id, target
    ) VALUES (
      playbook,
      'audit.retention_purge',
      'success',
      COALESCE(p_actor_type, 'system'),
      COALESCE(p_actor_id, 'retention'),
      to_char(timezone('UTC', p_older_than), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );

    total := total + n;
    playbooks_touched := playbooks_touched + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'purged', total,
    'playbooks', playbooks_touched,
    'older_than', p_older_than
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_audit_logs(timestamptz, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_audit_logs(timestamptz, uuid, text, text) TO service_role;

COMMIT;

-- --------------------------------------------------------------------
-- Folded in from 20261025130000_audit_config_changes.sql
-- Keep this section identical to the migration.
-- --------------------------------------------------------------------

-- Record every change to who can do what, and to what agents are told, in the
-- audit trail — from the database, so no write path can skip it.
--
-- Until now the trail held vault operations and federated calls only. Turning
-- a playbook public, issuing or revoking an API key, adding a collaborator,
-- pointing an MCP server somewhere else or rewriting a skill left no trace.
-- These writes happen in some forty places across the REST API, the MCP tools
-- and the management API, and owners can also write some of these tables
-- directly through the Data API. A trigger on each table is the one place all
-- of them pass through.
--
-- Recorded tables and operations:
--
--   playbooks               playbook.create / playbook.update / playbook.visibility / playbook.delete
--   skills                  skill.create / skill.update / skill.delete
--   mcp_servers             mcp_server.create / mcp_server.update / mcp_server.delete
--   api_keys                api_key.create / api_key.update / api_key.rotate / api_key.revoke / api_key.delete
--   playbook_collaborators  collaborator.invite / collaborator.accept / collaborator.update / collaborator.remove
--
-- `target` names the object and the columns that changed. Values are recorded
-- only for access-control columns (visibility, role, permissions, is_active,
-- expires_at); content such as instructions or skill bodies is not copied into
-- the trail, and key hashes and invite token hashes never are.
--
-- The actor:
--
--   * a write through the Data API with a user's own JWT is that user;
--   * a write by the application (service_role) carries the actor the app
--     authenticated, in the `x-apb-actor` request header (`type:id`); the
--     header is trusted only from service_role, so a user cannot claim to be
--     someone else;
--   * anything else (an operator in psql, a migration) is `system` and the
--     database role.
--
-- Bookkeeping columns (updated_at, star_count, last_used_at, a server's cached
-- tool list) do not produce events. Children deleted by a cascade from a
-- deleted playbook do not either: the playbook.delete row covers them.

BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE SCHEMA IF NOT EXISTS audit_private;

CREATE OR REPLACE FUNCTION audit_private.request_actor(OUT actor_type text, OUT actor_id text, OUT request_id text)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  claims json := nullif(current_setting('request.jwt.claims', true), '')::json;
  headers json := nullif(current_setting('request.headers', true), '')::json;
  claimed text;
BEGIN
  request_id := left(COALESCE(headers ->> 'x-apb-request-id', headers ->> 'x-request-id', headers ->> 'cf-ray'), 128);
  IF claims ->> 'role' = 'service_role' THEN
    claimed := headers ->> 'x-apb-actor';
    IF claimed IS NOT NULL AND position(':' IN claimed) > 1 THEN
      actor_type := left(split_part(claimed, ':', 1), 32);
      actor_id := nullif(left(substr(claimed, position(':' IN claimed) + 1), 128), '');
      RETURN;
    END IF;
    actor_type := 'system';
    actor_id := 'service_role';
    RETURN;
  END IF;
  IF claims ->> 'sub' IS NOT NULL THEN
    actor_type := 'owner';
    actor_id := left(claims ->> 'sub', 128);
    RETURN;
  END IF;
  actor_type := 'system';
  actor_id := current_user::text;
END;
$$;

CREATE OR REPLACE FUNCTION audit_private.record_config_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  entity text;
  ignored text[];
  shown text[];
  old_row jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  new_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  row_data jsonb := COALESCE(new_row, old_row);
  changed text[] := ARRAY[]::text[];
  details text[] := ARRAY[]::text[];
  col text;
  op text;
  label text;
  playbook uuid;
  actor record;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'playbooks' THEN
      entity := 'playbook';
      ignored := ARRAY['updated_at', 'star_count', 'created_at'];
      shown := ARRAY['visibility'];
      playbook := (row_data ->> 'id')::uuid;
      label := row_data ->> 'guid';
    WHEN 'skills' THEN
      entity := 'skill';
      ignored := ARRAY['created_at'];
      shown := ARRAY[]::text[];
      playbook := (row_data ->> 'playbook_id')::uuid;
      label := row_data ->> 'name';
    WHEN 'mcp_servers' THEN
      entity := 'mcp_server';
      ignored := ARRAY['tools', 'resources', 'created_at'];
      shown := ARRAY['transport_type'];
      playbook := (row_data ->> 'playbook_id')::uuid;
      label := row_data ->> 'name';
    WHEN 'api_keys' THEN
      entity := 'api_key';
      ignored := ARRAY['last_used_at', 'created_at'];
      shown := ARRAY['role', 'permissions', 'is_active', 'expires_at'];
      playbook := (row_data ->> 'playbook_id')::uuid;
      label := row_data ->> 'key_prefix';
    WHEN 'playbook_collaborators' THEN
      entity := 'collaborator';
      ignored := ARRAY['created_at'];
      shown := ARRAY['role'];
      playbook := (row_data ->> 'playbook_id')::uuid;
      label := COALESCE(row_data ->> 'user_id', 'pending-invite');
    ELSE
      RETURN NULL;
  END CASE;

  -- A child removed because its playbook was deleted: playbook.delete covers
  -- it. AFTER triggers run once the cascade is complete, so the playbook is
  -- already gone when the child's trigger fires.
  IF TG_OP = 'DELETE' AND entity <> 'playbook'
     AND NOT EXISTS (SELECT 1 FROM public.playbooks p WHERE p.id = playbook) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR col IN SELECT jsonb_object_keys(new_row) LOOP
      CONTINUE WHEN col = ANY(ignored);
      IF new_row -> col IS DISTINCT FROM old_row -> col THEN
        changed := changed || col;
        IF col = ANY(shown) THEN
          details := details || format('%s=%s->%s', col, COALESCE(old_row ->> col, 'null'), COALESCE(new_row ->> col, 'null'));
        END IF;
      END IF;
    END LOOP;
    IF cardinality(changed) = 0 THEN
      RETURN NULL;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    FOREACH col IN ARRAY shown LOOP
      IF new_row ? col THEN
        details := details || format('%s=%s', col, COALESCE(new_row ->> col, 'null'));
      END IF;
    END LOOP;
  END IF;

  op := entity || CASE TG_OP
    WHEN 'INSERT' THEN CASE entity WHEN 'collaborator' THEN '.invite' ELSE '.create' END
    WHEN 'DELETE' THEN CASE entity WHEN 'collaborator' THEN '.remove' ELSE '.delete' END
    ELSE '.update'
  END;
  IF TG_OP = 'UPDATE' THEN
    IF entity = 'playbook' AND 'visibility' = ANY(changed) THEN
      op := 'playbook.visibility';
    ELSIF entity = 'api_key' AND 'key_hash' = ANY(changed) THEN
      op := 'api_key.rotate';
    ELSIF entity = 'api_key' AND (old_row ->> 'is_active')::boolean AND NOT (new_row ->> 'is_active')::boolean THEN
      op := 'api_key.revoke';
    ELSIF entity = 'collaborator' AND old_row ->> 'accepted_at' IS NULL AND new_row ->> 'accepted_at' IS NOT NULL THEN
      op := 'collaborator.accept';
    END IF;
  END IF;

  SELECT * INTO actor FROM audit_private.request_actor();

  INSERT INTO public.audit_logs (playbook_id, operation, target, status, actor_type, actor_id, request_id)
  VALUES (
    playbook,
    op,
    left(concat_ws(' ',
      entity || ':' || COALESCE(label, row_data ->> 'id'),
      CASE WHEN cardinality(changed) > 0 THEN 'changed=' || array_to_string(changed, ',') END,
      CASE WHEN cardinality(details) > 0 THEN array_to_string(details, ' ') END
    ), 500),
    'success',
    actor.actor_type,
    actor.actor_id,
    actor.request_id
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION audit_private.request_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION audit_private.record_config_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_config_change ON public.playbooks;
CREATE TRIGGER audit_config_change
  AFTER INSERT OR UPDATE OR DELETE ON public.playbooks
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_config_change();

DROP TRIGGER IF EXISTS audit_config_change ON public.skills;
CREATE TRIGGER audit_config_change
  AFTER INSERT OR UPDATE OR DELETE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_config_change();

DROP TRIGGER IF EXISTS audit_config_change ON public.mcp_servers;
CREATE TRIGGER audit_config_change
  AFTER INSERT OR UPDATE OR DELETE ON public.mcp_servers
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_config_change();

DROP TRIGGER IF EXISTS audit_config_change ON public.api_keys;
CREATE TRIGGER audit_config_change
  AFTER INSERT OR UPDATE OR DELETE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_config_change();

DROP TRIGGER IF EXISTS audit_config_change ON public.playbook_collaborators;
CREATE TRIGGER audit_config_change
  AFTER INSERT OR UPDATE OR DELETE ON public.playbook_collaborators
  FOR EACH ROW EXECUTE FUNCTION audit_private.record_config_change();

COMMIT;

-- --------------------------------------------------------------------
-- Folded in from 20261025140000_private_instance.sql
-- Keep this section identical to the migration.
-- --------------------------------------------------------------------

-- A switch that makes a self-hosted instance private: no playbook can be public
-- or unlisted, so nothing on it is readable without signing in.
--
-- Anonymous access follows from visibility in many places — the public
-- listings, the MCP manifest and tools of a public playbook, an unlisted
-- playbook read by its GUID, its memory and runs. Rather than gate each of
-- them, the switch removes what they serve: with it on, a playbook can only be
-- private.
--
-- Turn it on (as a database owner), then make existing playbooks private and
-- restart the Data API so its pooled connections pick up the setting:
--
--   ALTER DATABASE postgres SET agentplaybooks.private_instance = 'on';
--   UPDATE public.playbooks SET visibility = 'private' WHERE visibility <> 'private';
--
-- Unset it with ALTER DATABASE postgres RESET agentplaybooks.private_instance.
-- An instance that never sets it behaves exactly as before.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_private_instance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('agentplaybooks.private_instance', true) = 'on'
     AND NEW.visibility::text <> 'private' THEN
    RAISE EXCEPTION 'This instance is private: a playbook cannot be %', NEW.visibility
      USING ERRCODE = 'check_violation',
            HINT = 'Set visibility to private. The operator enabled agentplaybooks.private_instance.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_private_instance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_private_instance ON public.playbooks;
CREATE TRIGGER enforce_private_instance
  BEFORE INSERT OR UPDATE OF visibility ON public.playbooks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_private_instance();

COMMIT;

-- --------------------------------------------------------------------
-- Folded in from 20261026090000_account_offboarding.sql
-- Keep this section identical to the migration.
-- --------------------------------------------------------------------

-- Offboarding: a disabled account's credentials stop working, and all of an
-- account's credentials can be revoked in one step.
--
-- Banning or deleting a user in Supabase Auth stopped their sign-in, but the
-- API keys they had issued kept working: key lookup never looked at the
-- account behind the key. The application now asks account_is_active() for
-- the owner of every presented credential — the user behind a user API key,
-- the owner of the playbook behind a playbook API key, and the signed-in user
-- of a session (a banned user's access token stays valid until it expires).
--
-- revoke_account_credentials() deactivates every user API key of an account,
-- every API key and mTLS secret client of the playbooks it owns. The rows are
-- kept (is_active = false), so the audit trail can still name them; playbook
-- key revocations are recorded as api_key.revoke by the audit triggers.

BEGIN;

CREATE OR REPLACE FUNCTION public.account_is_active(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = p_user_id
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_account_credentials(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  user_keys integer;
  playbook_keys integer;
  clients integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  UPDATE public.user_api_keys SET is_active = false
  WHERE user_id = p_user_id AND is_active;
  GET DIAGNOSTICS user_keys = ROW_COUNT;

  UPDATE public.api_keys SET is_active = false
  WHERE is_active AND playbook_id IN (SELECT id FROM public.playbooks WHERE user_id = p_user_id);
  GET DIAGNOSTICS playbook_keys = ROW_COUNT;

  -- secret_clients arrives with a later migration than some installs have.
  clients := 0;
  IF to_regclass('public.secret_clients') IS NOT NULL THEN
    EXECUTE 'UPDATE public.secret_clients SET is_active = false
             WHERE is_active AND playbook_id IN (SELECT id FROM public.playbooks WHERE user_id = $1)'
      USING p_user_id;
    GET DIAGNOSTICS clients = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'user_api_keys', user_keys,
    'playbook_api_keys', playbook_keys,
    'secret_clients', clients
  );
END;
$$;

REVOKE ALL ON FUNCTION public.account_is_active(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_account_credentials(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_is_active(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_account_credentials(uuid) TO service_role;

COMMIT;

-- Folded in from 20261028062350_increase_skill_attachment_limit_to_25.sql
-- Keep the database ceiling aligned with ATTACHMENT_LIMITS.MAX_FILES_PER_SKILL.
-- CREATE OR REPLACE preserves the existing trigger and function EXECUTE grants.
CREATE OR REPLACE FUNCTION public.check_attachment_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF (SELECT COUNT(*) FROM public.skill_attachments WHERE skill_id = NEW.skill_id) >= 25 THEN
    RAISE EXCEPTION 'Maximum 25 attachments per skill allowed';
  END IF;
  RETURN NEW;
END;
$function$;
