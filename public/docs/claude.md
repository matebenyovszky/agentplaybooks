# AgentPlaybooks in Claude

Your playbooks work in every Claude surface — claude.ai on the web, Claude
Desktop, Cowork, Claude Code, and the mobile apps — through one MCP endpoint
that signs you in with your AgentPlaybooks account. There is no API key to
create, copy, or rotate for Claude.

There are three ways in. Pick by what you want Claude to reach:

| Route | Reaches | Works in | Setup |
|---|---|---|---|
| [**The AgentPlaybooks plugin**](#the-plugin) | Every playbook in your account, plus a skill that teaches Claude how to use them | Chat, Cowork, Claude Code | Install once, sign in |
| [**A custom connector**](#a-custom-connector) | One playbook, or the whole account | Web, Desktop, Cowork, mobile | Paste a URL, sign in |
| [**Claude Code only**](#claude-code) | One playbook or the account, plus local `doctor` and `sync` | Claude Code | One command |

## The plugin

The plugin bundles three things:

- the **AgentPlaybooks connector** for the account endpoint
  (`https://agentplaybooks.ai/api/mcp/manage`). Every playbook you own or have
  been given is reachable through it — including one shared with you after you
  install — and each tool call names the playbook it targets;
- a **playbooks skill**, so Claude knows to look up the right playbook, adopt
  its persona and instructions when you ask it to, store durable facts in its
  memory rather than repeating them, and ask before changing anything shared;
- the **`/agentplaybooks:doctor` and `/agentplaybooks:sync` commands** for
  Claude Code, which audit and synchronize the agent configuration files in a
  project.

**From claude.ai or the desktop app.**

1. Open [Customize → Plugins](https://claude.ai/customize/plugins).
2. Once the plugin is listed in Anthropic's directory, find **AgentPlaybooks**
   under **Discover** and select **Add**. Until then — or on a plan without the
   directory — choose **Add → Add marketplace**, enter
   `matebenyovszky/agentplaybooks`, and add **AgentPlaybooks** from it.
3. Open the plugin's **Connectors** tab. Adding a plugin does not sign you in to
   anything: select **Add** if the connector shows *Not added*, then
   **Connect**, and sign in to AgentPlaybooks.

A plugin added on your account is available in chat, Cowork, and — at the next
session start — Claude Code. On Team and Enterprise plans an Owner decides
which plugin sources members see, and adds the connector for the organization
if members cannot.

**From the command line, in Claude Code.**

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Then run `/mcp`, choose **agentplaybooks-account**, and sign in.

The plugin deliberately carries no executables — claude.ai and Cowork refuse a
plugin with a `bin/` directory — so its commands run the published CLI through
`npx`, pinned to the version the plugin was released with. For the CLI's other
commands (`connect`, `pull`, `push`, `backups`), install it from npm: see
[CLI](/docs/cli).

## A custom connector

Use this to give Claude one specific playbook — so its persona and instructions
arrive as the server's own prompt — or when you do not want the plugin.

1. Open [Customize → Connectors](https://claude.ai/customize/connectors) and
   choose **Add custom connector**. On a Team or Enterprise plan, an Owner adds
   it under [Organization settings → Connectors](https://claude.ai/admin-settings/connectors)
   (**Add → Custom → Web**), and members then connect with their own account.
   The Free plan allows one custom connector.
2. Paste the URL:
   - one playbook: `https://agentplaybooks.ai/api/mcp/<guid>` — copy it from the
     playbook's **Integrations** tab;
   - the whole account: `https://agentplaybooks.ai/api/mcp/manage`.
3. Leave the OAuth client ID and secret empty. If the dialog asks how to
   authenticate, choose **Sign in now** (labelled **Always required** in some
   versions of the dialog); if it asks how Claude identifies
   itself, choose **Register automatically**.
4. Select **Add**, then **Connect**, and sign in to AgentPlaybooks.

A connector added on claude.ai is available in Claude Desktop, Cowork, and the
mobile apps too. In a chat, turn it on from **+ → Connectors**.

### What the sign-in grants

The connector acts as you. It can read and change what your account can read
and change, in every playbook it can reach — no more. Every tool declares
whether it only reads: read-only tools — list, search, get — run without asking,
and Claude asks before a tool that changes a playbook other people may share,
unless you choose **Always allow** for that tool. Deleting, and calling a
connected service, are marked destructive.

Secret values never reach Claude. `list_secrets` returns names only, and
`use_secret` makes the request with the value injected on the AgentPlaybooks
server.

## Claude Code

Add one playbook or the account with a single command, then sign in from `/mcp`:

```bash
claude mcp add --transport http apb-my-playbook https://agentplaybooks.ai/api/mcp/<guid>
```

```bash
claude mcp add --transport http agentplaybooks-account https://agentplaybooks.ai/api/mcp/manage
```

For a configuration the whole team shares through the repository, use
`apb connect <guid> --apply` or `apb connect --account --apply` instead — see
[CLI](/docs/cli). Those write `.mcp.json` entries that read an API key from an
environment variable, for clients and CI jobs that cannot run a browser sign-in.

## Claude Desktop's config file does not work for this

`claude_desktop_config.json` describes **local** servers only: a `command` and
its arguments, launched on your machine. A `url` and `headers` written there are
ignored — the server never appears, and nothing reports an error. Earlier
versions of these docs recommended exactly that. Use the plugin or a custom
connector; both work in Claude Desktop.

## Self-hosted instances

A self-hosted AgentPlaybooks server works the same way when its Supabase Auth
has the OAuth server enabled: add `https://<your-server>/api/mcp/manage` or
`.../api/mcp/<guid>` as a custom connector. Claude connects from Anthropic's
infrastructure, not from your machine, so the server has to be reachable from
there — for a server inside a private network, Claude's
[MCP tunnels](https://claude.com/docs/connectors/mcp-tunnels/overview) are the
supported route. Claude Code can also reach an intranet server directly with
`apb connect`, which runs on your machine.

The plugin itself points at agentplaybooks.ai; for a self-hosted server, use a
custom connector instead.

## Troubleshooting

- **The connector shows Connect or Reconnect, not Connected.** The sign-in did
  not finish. Select it again and complete the AgentPlaybooks sign-in in the
  window that opens.
- **No tools appear.** Open the connector's page and check **Tool
  permissions**. If the list is empty, disconnect and connect again.
- **A tool call is refused.** The refusal names the missing permission or the
  reason — for example, a playbook shared with you as a viewer cannot be
  written. Ask the playbook's owner to change your role.
- **Claude Code says the server needs authentication.** Run `/mcp`, choose the
  server, and select **Authenticate**.
