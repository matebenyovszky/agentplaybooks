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
  secret_name text
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
  created_at timestamp with time zone DEFAULT now() NOT NULL
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

ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_role_check CHECK ((role = ANY (ARRAY['viewer'::text, 'coworker'::text, 'admin'::text])));

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'denied'::text, 'error'::text])));

ALTER TABLE public.canvas ADD CONSTRAINT canvas_version_positive CHECK ((version > 0));

ALTER TABLE public.memories ADD CONSTRAINT memories_memory_type_check CHECK ((memory_type = ANY (ARRAY['flat'::text, 'hierarchical'::text])));

ALTER TABLE public.memories ADD CONSTRAINT memories_retention_policy_check CHECK ((retention_policy = ANY (ARRAY['permanent'::text, 'session'::text, 'auto'::text])));

ALTER TABLE public.memories ADD CONSTRAINT memories_status_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'blocked'::text]))));

ALTER TABLE public.memories ADD CONSTRAINT memories_tier_check CHECK ((tier = ANY (ARRAY['working'::text, 'contextual'::text, 'longterm'::text])));

ALTER TABLE public.playbook_collaborators ADD CONSTRAINT playbook_collaborators_state_check CHECK ((((user_id IS NULL) AND (accepted_at IS NULL)) OR ((user_id IS NOT NULL) AND (accepted_at IS NOT NULL))));

ALTER TABLE public.playbook_runs ADD CONSTRAINT playbook_runs_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'archived'::text])));

ALTER TABLE public.playbook_versions ADD CONSTRAINT playbook_versions_change_type_check CHECK ((change_type = ANY (ARRAY['UPDATE'::text, 'DELETE'::text, 'MANUAL_SAVE'::text])));

ALTER TABLE public.secrets ADD CONSTRAINT secrets_category_check CHECK ((category = ANY (ARRAY['api_key'::text, 'password'::text, 'token'::text, 'certificate'::text, 'connection_string'::text, 'general'::text])));

ALTER TABLE public.skill_attachments ADD CONSTRAINT content_size_match CHECK ((octet_length(content) = size_bytes));

ALTER TABLE public.skill_attachments ADD CONSTRAINT max_file_size CHECK ((size_bytes <= 51200));

ALTER TABLE public.skill_attachments ADD CONSTRAINT no_path_traversal CHECK (((filename !~~ '%..%'::text) AND (filename !~~ '%/%'::text) AND (filename !~~ '%\%'::text)));

ALTER TABLE public.skill_attachments ADD CONSTRAINT safe_filename CHECK (((length(filename) <= 100) AND (filename ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$'::text)));

ALTER TABLE public.skill_versions ADD CONSTRAINT skill_versions_change_type_check CHECK ((change_type = ANY (ARRAY['UPDATE'::text, 'DELETE'::text, 'MANUAL_SAVE'::text])));

ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

ALTER TABLE public.audit_logs ADD CONSTRAINT mcp_proxy_audit_logs_mcp_server_id_fkey FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE;

ALTER TABLE public.audit_logs ADD CONSTRAINT mcp_proxy_audit_logs_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE;

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
