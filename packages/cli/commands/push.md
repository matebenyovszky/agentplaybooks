---
description: Push live playbook records and a private, versioned portable backup to agentplaybooks.ai
argument-hint: "[path]"
---

Push the local playbook to the linked (or a new) remote playbook.

1. Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js" push $ARGUMENTS --json`
   If it fails with a missing-key error, ask the user to run
   `agentplaybooks login` (or set `AGENTPLAYBOOKS_API_KEY`) first — never ask
   them to paste the key into the chat.
2. Summarize the plan: playbook create/update, live instruction/skill/MCP
   records, private snapshot contents (full skill trees, custom agents, MCP
   references, manifest), and any conflicts. A conflict prevents an incomplete
   backup from being applied.
   An instruction conflict means the project-root `AGENTS.md` and `CLAUDE.md`
   disagree — the fix is to make one import the other, never to copy text. Note that remote entries
   missing locally are left untouched, that hosted-only MCP settings (timeouts,
   auth, curated tool lists, descriptions) are preserved rather than
   overwritten, and that no secret values are ever uploaded. Local overrides,
   settings, hooks, and worktrees are outside the portable backup.
3. If the CLI refuses because of likely hard-coded credentials, help the user
   move the values to environment references (`${VAR}`) and re-plan — do not
   bypass it. The reference then appears in the manifest's `spec.secrets`, which
   is how a teammate learns what to set.
4. Only after the user confirms, re-run with `--apply` and report the playbook
   GUID so teammates can `pull` it.
