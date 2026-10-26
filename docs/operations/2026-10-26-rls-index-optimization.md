# RLS and foreign-key index optimization

The production advisor reported 35 `auth_rls_initplan`, 42
`multiple_permissive_policies`, and five `unindexed_foreign_keys` findings.
There was no observed resource shortage. These changes reduce work as the
tables grow; they are not evidence of a measured end-to-end latency improvement.

Migration `20261026212458_optimize_rls_and_foreign_key_indexes.sql`:

- Wraps request-constant `auth.uid()` and `auth.role()` calls in scalar SELECTs
  so Postgres can use InitPlans instead of calling them for every row.
- Removes eight redundant permissive policies. The surviving policies cover
  the same roles, commands, USING and WITH CHECK conditions. In particular,
  the canvas ALL policy already supplies the identical SELECT predicate.
- Combines the two PUBLIC / ALL secrets policies with the original OR for
  both USING and WITH CHECK. The original service JWT branch is preserved.
- Adds B-tree indexes on MCP publisher, run creator, version actor API keys,
  and the composite canvas `(run_id, playbook_id)` foreign key. Existing
  canvas indexes beginning with `run_id` have different second columns.

No grants, RLS enablement, function privileges, or application authorization
rules change. Editor secret access remains enforced by the central API
authorization model. This migration does not expose server-only tables.

The affected production tables were each below 400 KiB including indexes at
preflight. The atomic migration uses a 3-second lock timeout and 60-second
statement timeout. On a much larger installation, plan a separate concurrent
index rollout rather than raising these limits during traffic.

## Verification

A local Postgres (PGlite) fixture reconstructed all 49 live policies, with
synthetic public, unlisted and private rows. Before/after results matched for
408 SELECT / INSERT / UPDATE / DELETE probes across anonymous, two owners,
an unrelated authenticated user, the bypass-RLS service role, and the legacy service JWT branch under a non-bypass database role. UPDATE
probes attempted ownership reassignment. The migration also replayed cleanly;
the policy count became 40. This is bounded fixture evidence, not a full
production authorization or load test.

The production deployment workflow runs its existing checks, applies the
migration and verifies the recorded version, five valid index definitions,
and the absence of direct per-row identity calls in public policies.

## Remaining advisor findings

Six role-specific SELECT overlaps are expected to remain: public content
plus owner access on playbooks, skills, MCP servers and attachments, and
owner plus auditor access on audit logs and checkpoints. Their role scopes
differ. Flattening them or narrowing PUBLIC to anon solely to silence the
advisor would require a separate authorization change.

Do not remove indexes based only on the fresh heap's `unused_index` counters.
No-policy RLS findings on service-only tables also do not justify adding
client access policies.

References: [Supabase RLS performance guidance](https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations),
[foreign-key indexes](https://supabase.github.io/splinter/0001_unindexed_foreign_keys/),
[advisor implementation](https://github.com/supabase/splinter/blob/main/splinter.sql).
