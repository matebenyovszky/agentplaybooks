# CLI 0.9.0 — plugin reliability and chat-first hosted access

Release candidate. Publication and authenticated host acceptance are separate
gates; do not infer either from this document or the package version.

- On-demand `apb connection check`: OAuth discovery, MCP initialize/catalog and
  account identity, with bounded requests and redacted failures.
- Chat-first Codex/OpenAI skill routing for playbooks, skills, memory, canvas,
  connected MCP/OpenAPI tools and server-side secret use. Local CLI instructions
  load only on demand. Separate skills-only and complete remote plugin archives.
- Credential-derived `get_profile`, per-tool OAuth metadata and local-session
  account switching on the consent screen. Existing MCP URL stays unchanged.
- Compact name-filtered playbook pages and bounded memory metadata pages.
  Core management discovery stays compact (16 tools); full remains 53 tools.
- Safe updates of generated skill files using sync state, backup hashes and
  preview revalidation. Local edits and deletions remain conflicts; symlinked
  backup paths are refused. Custom-agent/MCP entry updates remain future work.
- Credential-free reusable Doctor Action with JSON report, summary and badge.
- Offline ROS 2 package/launch inventory, explicitly not a robot runtime or
  safety certification. Robot pilot remains deferred.
- Hermes memory 0.4.0: offline initialize, explicit recall by default, optional
  automatic recall with a shared eight-search budget, per-source failure and
  duplicate suppression, and authenticated-request cooldown. Writes recheck
  private visibility; profile reinitialization discards clients and recall state.

For acceptance evidence and outstanding cloud consent, see
[the reliability plan](../plugin-reliability-plan.md) and
[the rollout checklist](../plugin-reliability-review.md).
