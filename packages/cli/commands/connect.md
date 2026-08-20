---
description: Connect this project to a hosted playbook's MCP endpoint — plan first, apply on approval
argument-hint: "<playbook-guid> [path] [--target=claude,cursor] [--key-env=VAR]"
---

Point the agent tool at a hosted playbook's own MCP endpoint, so memory, skills,
and every federated tool arrive through one connection instead of a local copy.

1. Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js" connect $ARGUMENTS --json`
2. Report the plan: the endpoint URL, the config entry name, which files would be
   created or merged, and the environment variable the key will be read from.
   The key itself is never written to disk — the config carries `${VAR}`.
3. If `keyPresentInEnvironment` is false, say so before applying. A variable set
   after the agent tool started is invisible to it, and from the inside that
   looks identical to a rejected key: the connection establishes, no tools
   appear, and refreshing fails. The user needs to set it and restart the tool.
4. Conflicts mean the target's config already holds a different definition under
   that name, or its format cannot represent this one. Do not work around them —
   report what conflicts and ask which should win.
5. Only after the user confirms, run the same command with `--apply` and report
   what was written (backups land in `.agentplaybooks/backups/`).

The playbook GUID is the last path segment of its MCP endpoint URL, which the
playbook's MCP tab shows.
