-- Evaluate request identity once per statement, rather than once per row.
-- Keep policy roles, commands, predicates and implicit WITH CHECK semantics.
-- Remove only redundant permissive branches; no grants or RLS state change.
-- Five small FK indexes also cover joins and ON DELETE checks.

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

-- The retained ALL policies already cover these operation-specific policies.
-- Public read duplicates differ only in their name / playbooks alias.
DROP POLICY IF EXISTS "Public playbooks are readable" ON public."playbooks";
DROP POLICY IF EXISTS "Public playbook skills readable" ON public."skills";
DROP POLICY IF EXISTS "Users can insert own playbooks" ON public."playbooks";
DROP POLICY IF EXISTS "Users can read own playbooks" ON public."playbooks";
DROP POLICY IF EXISTS "Users can update own playbooks" ON public."playbooks";
DROP POLICY IF EXISTS "Users can delete own playbooks" ON public."playbooks";
DROP POLICY IF EXISTS "Users can read own skills" ON public."skills";
DROP POLICY IF EXISTS "Canvas documents follow run access" ON public."canvas";

-- Same PUBLIC role and ALL command: preserve the original permissive OR.
-- Keep the existing auth.role() branch for semantic compatibility; replacing
-- it with a TO clause would change how a JWT role and a database role interact.
DROP POLICY IF EXISTS "Secrets: service role" ON public.secrets;

ALTER POLICY "Authenticated users can star" ON public."playbook_stars"
    WITH CHECK (((SELECT auth.uid()) = user_id));

ALTER POLICY "Canvas writers follow run access" ON public."canvas"
  USING ((EXISTS ( SELECT 1
 FROM playbook_runs
 WHERE ((playbook_runs.id = canvas.run_id) AND ((playbook_runs.created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = canvas.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
 FROM playbook_collaborators
 WHERE ((playbook_collaborators.playbook_id = canvas.playbook_id) AND (playbook_collaborators.user_id = (SELECT auth.uid())) AND (playbook_collaborators.accepted_at IS NOT NULL)))))))))
  WITH CHECK ((EXISTS ( SELECT 1
 FROM playbook_runs
 WHERE ((playbook_runs.id = canvas.run_id) AND (playbook_runs.playbook_id = canvas.playbook_id)))));

ALTER POLICY "Owner access api_keys" ON public."api_keys"
  USING ((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = api_keys.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = api_keys.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))));

ALTER POLICY "Owner access mcp_servers" ON public."mcp_servers"
  USING ((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = mcp_servers.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = mcp_servers.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))));

ALTER POLICY "Owner access memories" ON public."memories"
  USING ((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = memories.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = memories.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))));

ALTER POLICY "Owner access skills" ON public."skills"
  USING ((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = skills.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = skills.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))));

ALTER POLICY "Owners can read audit logs" ON public."audit_logs"
  USING ((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = audit_logs.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))));

ALTER POLICY "Run creators can delete runs" ON public."playbook_runs"
  USING (((created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = playbook_runs.playbook_id) AND (playbooks.user_id = (SELECT auth.uid())))))));

ALTER POLICY "Run creators can update runs" ON public."playbook_runs"
  USING (((created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = playbook_runs.playbook_id) AND (playbooks.user_id = (SELECT auth.uid())))))))
  WITH CHECK (((created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = playbook_runs.playbook_id) AND (playbooks.user_id = (SELECT auth.uid())))))));

ALTER POLICY "Runs follow playbook access" ON public."playbook_runs"
  USING (((created_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = playbook_runs.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
 FROM playbook_collaborators
 WHERE ((playbook_collaborators.playbook_id = playbook_runs.playbook_id) AND (playbook_collaborators.user_id = (SELECT auth.uid())) AND (playbook_collaborators.accepted_at IS NOT NULL))))));

ALTER POLICY "Users can view their own API keys" ON public."user_api_keys"
  USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Secrets: owner full access" ON public."secrets"
  USING (((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = secrets.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))) OR ((SELECT auth.role()) = 'service_role'::text)))
  WITH CHECK (((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = secrets.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))) OR ((SELECT auth.role()) = 'service_role'::text)));

ALTER POLICY "Users can create runs for accessible playbooks" ON public."playbook_runs"
    WITH CHECK (((created_by = (SELECT auth.uid())) AND ((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = playbook_runs.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
 FROM playbook_collaborators
 WHERE ((playbook_collaborators.playbook_id = playbook_runs.playbook_id) AND (playbook_collaborators.user_id = (SELECT auth.uid())) AND (playbook_collaborators.accepted_at IS NOT NULL)))))));

ALTER POLICY "Users can delete own attachments" ON public."skill_attachments"
  USING ((EXISTS ( SELECT 1
 FROM (skills s
 JOIN playbooks p ON ((p.id = s.playbook_id)))
 WHERE ((s.id = skill_attachments.skill_id) AND (p.user_id = (SELECT auth.uid()))))));

ALTER POLICY "Users can delete their own API keys" ON public."user_api_keys"
  USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users can delete versions of skills in their playbooks" ON public."skill_versions"
  USING ((playbook_id IN ( SELECT playbooks.id
 FROM playbooks
 WHERE (playbooks.user_id = (SELECT auth.uid())))));

ALTER POLICY "Users can insert own attachments" ON public."skill_attachments"
    WITH CHECK ((EXISTS ( SELECT 1
 FROM (skills s
 JOIN playbooks p ON ((p.id = s.playbook_id)))
 WHERE ((s.id = skill_attachments.skill_id) AND (p.user_id = (SELECT auth.uid()))))));

ALTER POLICY "Users can insert own profile" ON public."profiles"
    WITH CHECK (((auth_user_id = (SELECT auth.uid())) AND (id = (SELECT auth.uid()))));

ALTER POLICY "Users can insert their own API keys" ON public."user_api_keys"
    WITH CHECK (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users can manage own playbooks" ON public."playbooks"
  USING ((user_id = (SELECT auth.uid())))
  WITH CHECK ((user_id = (SELECT auth.uid())));

ALTER POLICY "Users can read own attachments" ON public."skill_attachments"
  USING ((EXISTS ( SELECT 1
 FROM (skills s
 JOIN playbooks p ON ((p.id = s.playbook_id)))
 WHERE ((s.id = skill_attachments.skill_id) AND (p.user_id = (SELECT auth.uid()))))));

ALTER POLICY "Users can unstar their own" ON public."playbook_stars"
  USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users can update own attachments" ON public."skill_attachments"
  USING ((EXISTS ( SELECT 1
 FROM (skills s
 JOIN playbooks p ON ((p.id = s.playbook_id)))
 WHERE ((s.id = skill_attachments.skill_id) AND (p.user_id = (SELECT auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
 FROM (skills s
 JOIN playbooks p ON ((p.id = s.playbook_id)))
 WHERE ((s.id = skill_attachments.skill_id) AND (p.user_id = (SELECT auth.uid()))))));

ALTER POLICY "Users can update own profile" ON public."profiles"
  USING ((auth_user_id = (SELECT auth.uid())))
  WITH CHECK ((auth_user_id = (SELECT auth.uid())));

ALTER POLICY "Users can update their own API keys" ON public."user_api_keys"
  USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users can view versions of skills in their playbooks" ON public."skill_versions"
  USING ((playbook_id IN ( SELECT playbooks.id
 FROM playbooks
 WHERE (playbooks.user_id = (SELECT auth.uid())))));

ALTER POLICY "Users can view versions of their playbooks" ON public."playbook_versions"
  USING ((playbook_id IN ( SELECT playbooks.id
 FROM playbooks
 WHERE (playbooks.user_id = (SELECT auth.uid())))));

ALTER POLICY "Owners can read audit chain checkpoints" ON public."audit_chain_checkpoints"
  USING ((EXISTS ( SELECT 1
 FROM playbooks
 WHERE ((playbooks.id = audit_chain_checkpoints.playbook_id) AND (playbooks.user_id = (SELECT auth.uid()))))));

CREATE INDEX IF NOT EXISTS mcp_servers_publisher_id_idx
  ON public.mcp_servers (publisher_id);
CREATE INDEX IF NOT EXISTS canvas_run_playbook_idx
  ON public.canvas (run_id, playbook_id);
CREATE INDEX IF NOT EXISTS playbook_runs_created_by_idx
  ON public.playbook_runs (created_by);
CREATE INDEX IF NOT EXISTS playbook_versions_changed_by_api_key_idx
  ON public.playbook_versions (changed_by_api_key_id);
CREATE INDEX IF NOT EXISTS skill_versions_changed_by_api_key_idx
  ON public.skill_versions (changed_by_api_key_id);

COMMIT;
