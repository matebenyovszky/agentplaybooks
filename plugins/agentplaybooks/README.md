# AgentPlaybooks for Claude

AgentPlaybooks keeps an AI agent's working setup in one portable playbook: a
persona, project instructions, skills, memory, canvas documents, connected
tools, and a secret vault. This plugin brings your playbooks into Claude — in
chat, Cowork, and Claude Code — so the same setup you use in Cursor, Codex, or
Hermes is available here, and what Claude learns is available there.

## What you get

- **Every playbook in your account, through one connection.** The plugin adds
  the AgentPlaybooks MCP connector. Sign in once with your AgentPlaybooks
  account; there is no API key to copy. Playbooks shared with you appear too,
  including ones shared after you install.
- **A skill for working with playbooks** from any Claude surface: open a
  playbook and adopt its persona and instructions, read and write its memory,
  use its skills, keep documents on its canvas, call its connected tools.
- **Secrets that stay secret.** A tool call that needs a stored credential names
  the secret, and the AgentPlaybooks server injects it. The value is never
  returned to Claude.
- **Local configuration tools in Claude Code.** `/agentplaybooks:doctor` audits
  a project's agent configuration and `/agentplaybooks:sync` keeps skills,
  instructions, and MCP definitions consistent across Claude Code, Cursor,
  Codex, and other tools.

## Getting started

1. Install the plugin, open it, and go to its **Connectors** tab.
2. Add the **agentplaybooks-account** connector if it shows *Not added*, then
   select **Connect** and sign in to agentplaybooks.ai. Create an account
   there first if you do not have one.
3. Ask Claude: "List my playbooks", or "Open my team playbook and follow its
   instructions".

## What the plugin runs and connects to

- **MCP connector:** `https://agentplaybooks.ai/api/mcp/manage`, over HTTPS,
  authenticated with OAuth through AgentPlaybooks' sign-in. Claude sends this
  server the tool calls you approve, and receives your playbook data in return.
- **Claude Code commands:** `/agentplaybooks:doctor` and `/agentplaybooks:sync`
  run the open-source AgentPlaybooks CLI, pinned to an exact version, through
  `npx` (`@agentplaybooks/cli@0.6.0` from the npm registry). `doctor` only reads
  local files. `sync` writes local files only after you approve its plan. Neither
  sends project files anywhere.
- Nothing else. The plugin has no hooks and runs nothing in the background.

## Privacy

The plugin itself collects nothing. Using the connector means using the hosted
agentplaybooks.ai service, which stores the playbook content you create —
persona, instructions, skills, memory, canvas, connected-server definitions —
and processes only what it needs to run that service, such as your account
email. It does not sell personal data. Secret values are stored encrypted
(AES-256-GCM) and are never returned through the connector. The CLI commands
run locally and do not send your project files to AgentPlaybooks. You can delete
your account, and everything it owns, under Settings → Delete account on
agentplaybooks.ai.

Full policy: https://agentplaybooks.ai/privacy. Questions go to the maintainers
through https://github.com/matebenyovszky/agentplaybooks/issues.

## Self-hosted instances

If your organisation runs its own AgentPlaybooks server, add it as a custom
connector by URL instead — `https://<your-server>/api/mcp/manage` — as
described at https://agentplaybooks.ai/docs/claude.

## Links

- Documentation: https://agentplaybooks.ai/docs/claude
- Source: https://github.com/matebenyovszky/agentplaybooks
- Issues and support: https://github.com/matebenyovszky/agentplaybooks/issues
- Terms: https://agentplaybooks.ai/terms

Licensed under the MIT License.
