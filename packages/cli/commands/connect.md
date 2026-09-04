---
description: Connect an agent to an AgentPlaybooks account or one or more hosted playbooks — plan first, apply on approval
argument-hint: "<guid>[,<guid>...] [path] | --account [path] [--target=claude,hermes]"
---

Point the agent tool at either a whole AgentPlaybooks account or one or more
hosted playbooks. `--account` uses the account-management MCP endpoint and a
user API key; GUIDs use the scoped playbook endpoints. A user API key can also
authenticate those scoped endpoints when the account has access.

1. Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js" connect $ARGUMENTS --json`
2. Report the plan: the scope, endpoint URL(s), config entry name(s), which files would be
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

For the whole account use `connect --account`. For several playbooks use a
comma-separated list of GUIDs. A GUID is the last path segment of the MCP URL.
