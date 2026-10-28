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
- **Your own servers too, in Claude Code.** Every AgentPlaybooks server you
  log in to with the CLI — your organisation's own, one inside a private
  network, or several at once — is reachable through one more connection,
  with each playbook marked by its server.
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
  `npx` (`@agentplaybooks/cli@0.8.0` from the npm registry). `doctor` only reads
  local files. `sync` writes local files only after you approve its plan. Neither
  sends project files anywhere.
- **Local MCP server, in Claude Code and in Cowork on your computer:**
  `node server/servers.mjs`, a readable script with no dependencies, which
  needs Node.js 20 or later. It reads the user API keys the AgentPlaybooks CLI
  stored in `~/.agentplaybooks/credentials.json` when you ran
  `login --url=<server>`, and sends each key only to the server it was stored
  for, as the `X-API-Key` header, over HTTPS — or over HTTP to your own
  machine; a plain-HTTP address on the network is skipped. It passes on the
  tool calls you approve and returns the answers. It starts nothing else and
  writes nothing. Claude's chat apps do not run it.
- Nothing else. The plugin has no hooks.

## Privacy

The plugin itself collects nothing. Using the connector means using the hosted
agentplaybooks.ai service, which stores the playbook content you create —
persona, instructions, skills, memory, canvas, connected-server definitions —
and processes only what it needs to run that service, such as your account
email. It does not sell personal data. Secret values are stored encrypted
(AES-256-GCM) and are never returned through the connector. The CLI commands
run locally and do not send your project files to AgentPlaybooks. The local
server talks only to the servers you logged in to; what those store is up to
whoever runs them. You can delete
your account, and everything it owns, under Settings → Delete account on
agentplaybooks.ai.

Full policy: https://agentplaybooks.ai/privacy. Questions go to the maintainers
through https://github.com/matebenyovszky/agentplaybooks/issues.

## Self-hosted instances

In Claude Code, add your organisation's server — or several — by storing a
user API key for it with the CLI, then reconnecting `agentplaybooks-servers`
from `/mcp`:

```bash
npx --yes @agentplaybooks/cli@0.8.0 login --url=https://playbooks.example.org
```

The CLI takes the key from `AGENTPLAYBOOKS_API_KEY`, or prompts for it without
echoing the value. Enter the key locally; do not paste it into a conversation.

`logout --url=<server>` removes the key again. A server whose certificate comes
from a CA outside your operating system's store needs that CA's file in
`NODE_EXTRA_CA_CERTS`, in the `env` block of `~/.claude/settings.json` and in
the terminal where you run `login`. In Claude's chat apps, add the server as a
custom connector by URL instead — `https://<your-server>/api/mcp/manage` — as
described at https://agentplaybooks.ai/docs/claude.

## Links

- Documentation: https://agentplaybooks.ai/docs/claude
- Source: https://github.com/matebenyovszky/agentplaybooks
- Issues and support: https://github.com/matebenyovszky/agentplaybooks/issues
- Terms: https://agentplaybooks.ai/terms

Licensed under the MIT License.
