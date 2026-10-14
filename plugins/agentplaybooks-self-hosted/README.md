# AgentPlaybooks for Claude Code — self-hosted servers

The same plugin as `agentplaybooks`, for an AgentPlaybooks server your
organisation runs itself, often inside a private network. It gives Claude Code
every playbook your account can reach on that server — persona, instructions,
skills, memory, canvas, connected tools, and the secret proxy — in every
project, through one connection.

The hosted plugin signs in to agentplaybooks.ai with OAuth from Claude's apps.
This one runs in Claude Code on your machine instead, so it reaches a server
that Anthropic's infrastructure cannot, and it authenticates with the user API
key the AgentPlaybooks CLI already stores.

## Requirements

- Claude Code, and Node.js 20 or later on the same machine.
- A user API key for your account on the server, created under Dashboard →
  Settings → API Keys.

## Set up

1. Store the key once with the CLI. It takes the key from
   `AGENTPLAYBOOKS_API_KEY`, or prompts for it, and checks it against the
   server before saving it in `~/.agentplaybooks/credentials.json` (mode 0600).
   CLI releases after 0.6.0 read the key at the prompt without echoing it;
   0.6.0 itself still shows what you paste, so with it prefer the variable on
   a shared screen:

   ```bash
   npx --yes @agentplaybooks/cli@0.6.0 login --url=https://playbooks.example.org
   ```

2. Install the plugin and give it the same URL:

   ```bash
   claude plugin marketplace add matebenyovszky/agentplaybooks
   ```

   ```bash
   claude plugin install agentplaybooks-self-hosted@agentplaybooks --config server_url=https://playbooks.example.org
   ```

   Inside Claude Code, `/plugin install agentplaybooks-self-hosted@agentplaybooks`
   asks for the URL instead, and `/plugin configure` changes it later.

3. Start a new session and check `/mcp`: `agentplaybooks-account` should be
   connected. Ask Claude: "List my playbooks".

## Private certificate authorities

Claude Code trusts the operating system's certificate store, so a certificate
from your organisation's internal CA usually works as it is. A certificate from
a CA that is not in that store needs the CA's file named in
`NODE_EXTRA_CA_CERTS`, both for Claude Code — in `~/.claude/settings.json`:

```json
{ "env": { "NODE_EXTRA_CA_CERTS": "/path/to/your-ca.pem" } }
```

— and in the terminal where you run the CLI's `login`.

## How the key is used

The MCP server is declared with a `headersHelper`: for each connection, Claude
Code runs `scripts/mcp-headers.mjs`, which reads the key stored for exactly
that server — scheme, host, and port — and returns it as the `X-API-Key`
header. The key is not copied into Claude Code's settings or into an
environment variable, and `login`, `logout`, or a rotated key take effect on
the next connection. With no key stored for the server, the helper sends no
key and prints the `login` command to run.

The commands, the CLI, and the secret handling are the same as in the hosted
plugin: `/agentplaybooks-self-hosted:doctor` and `:sync` run the open-source
CLI pinned to `@agentplaybooks/cli@0.6.0` through `npx`, and secret values are
used on the server and never returned to Claude.

## Links

- Documentation: https://agentplaybooks.ai/docs/claude
- Source: https://github.com/matebenyovszky/agentplaybooks
- Issues and support: https://github.com/matebenyovszky/agentplaybooks/issues

Licensed under the MIT License.
