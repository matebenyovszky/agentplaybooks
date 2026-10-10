---
title: Your playbooks in every Claude — one plugin, no API key
description: AgentPlaybooks now has a Claude plugin and an OAuth connector. Every playbook in your account reaches claude.ai, Claude Desktop, Cowork, Claude Code, and mobile, with nothing to paste and no secret ever shown to Claude.
date: 2026-09-30
author: Mate Benyovszky
---

# Your playbooks in every Claude — one plugin, no API key

Until today, the honest answer to "how do I use my playbook in Claude Desktop?"
was: you can't, not properly. Our own docs said otherwise. They told people to
put a URL and an `Authorization` header into `claude_desktop_config.json` — a
file that only describes *local* programs. Claude Desktop ignored the entry,
said nothing, and the server never appeared. Four documentation pages and the
dashboard repeated it.

That is fixed.

## What changed

**Every playbook endpoint is now an OAuth protected resource.** Point any client
that speaks MCP authorization at `https://agentplaybooks.ai/api/mcp/<guid>` — or
at `/api/mcp/manage` for the whole account — and it discovers our sign-in,
registers itself, and asks you to log in. No key to create, copy, paste, or
rotate. That works in claude.ai, Claude Desktop, Cowork, the mobile apps,
Claude Code, Cursor, and VS Code.

**There is a Claude plugin.** It bundles three things:

- the **account connector**, so every playbook you own or have been given is one
  connection away — including one a colleague shares with you next week;
- a **playbooks skill**, which teaches Claude the habits that make a shared
  playbook work: find the right playbook before acting, adopt its persona when
  you ask, put durable facts into memory instead of repeating them, and ask
  before changing anything other people rely on;
- **`/agentplaybooks:doctor` and `/agentplaybooks:sync`** for Claude Code, which
  audit and synchronize the agent configuration files in a project.

A plugin you add on claude.ai lands on your account, so it is in chat, in
Cowork, and — at the next session start — in Claude Code without installing it
again.

## How to get it

**Today, from the repository.** In claude.ai or the desktop app, open
**Customize → Plugins → Add → Add marketplace**, enter
`matebenyovszky/agentplaybooks`, and add AgentPlaybooks. Then open the plugin's
**Connectors** tab and select **Connect**. In Claude Code:

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

**From Anthropic's directory.** The plugin is built to the directory's rules and
goes into its review now. Once it is listed, it appears under **Discover** on Pro,
Max, Team, and Enterprise plans.

**Just one playbook?** Add it as a custom connector under **Customize →
Connectors** with its URL from the playbook's **Integrations** tab. That route
also applies the playbook's persona and instructions as the server's own prompt.
The Integrations tab now has the Claude steps and one-click buttons for Cursor
and VS Code.

All of it is in the new guide: [AgentPlaybooks in Claude](/docs/claude).

## What Claude can and cannot do with it

The connector acts as you, and no more than you: it reaches what your account
can reach. Every tool declares whether it only reads, so Claude can run reads —
listing, searching, opening a playbook — without asking, and asks before a tool
that changes something, unless you have chosen to always allow that tool.
Deleting and calling out to connected services are marked destructive.

Credentials stay where they are. `list_secrets` returns names. `use_secret` asks
the AgentPlaybooks server to make the request with the value injected there, and
only the response comes back. Claude never sees the key, and neither does the
conversation transcript.

## Building it to the directory's rules

Two things in the existing plugin would have kept it out of claude.ai entirely,
and they are worth knowing if you build one:

- **A top-level `bin/` folder makes claude.ai and Cowork refuse the whole plugin.**
  Our CLI plugin shipped its executable that way. The Claude plugin carries no
  executables; its commands run the published CLI through `npx`, pinned to the
  exact version it was released with, and the release check fails if a pin falls
  behind.
- **Every tool needs a title and its read-only and destructive hints.** The
  directory's portal reads them to decide what Claude may run without asking. All
  fifty of our tools declare both, and a test fails the build if one stops doing so.

The plugin is fourteen kilobytes of markdown and JSON. Everything it does is in
the [plugin's README](https://github.com/matebenyovszky/agentplaybooks/tree/main/plugins/agentplaybooks).
