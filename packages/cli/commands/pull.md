---
description: Restore the latest or a selected portable playbook backup into this project
argument-hint: "<playbook-id-or-guid> [path]"
---

Pull a remote AgentPlaybooks playbook into the local project.

1. If no playbook reference was given, run
   `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js" playbooks` and let the
   user pick one. If that fails with a missing-key error, ask the user to run
   `agentplaybooks login` (or set `AGENTPLAYBOOKS_API_KEY`) first — never ask
   them to paste the key into the chat.
2. Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js" pull $ARGUMENTS --json`
3. Summarize the plan: which instruction, full skill-tree, custom-agent,
   MCP-reference, and manifest files would be restored, plus conflicts with
   existing local files (these are skipped, never overwritten). If the
   playbook has no portable snapshot, explain that the CLI falls back to its
   legacy instructions, SKILL.md content, and MCP server records. OpenAPI
   federation servers are hosted-only and cannot be translated.
4. Only after the user confirms, re-run with `--apply`, then run
   `sync` to propagate the pulled skills, agents, and MCP servers to the platform
   targets. On a fresh project no target exists yet, so read `suggestedTargets`
   from the sync plan and offer `sync --target=<types> --apply`.
5. If the playbook declares `spec.secrets`, list the environment variables the
   user still needs to set. Never ask for or echo their values.
