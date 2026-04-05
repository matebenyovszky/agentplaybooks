---
title: Connect Any Playbook as an MCP Server — Cursor, Claude, and Beyond
description: Step-by-step guide to connecting AgentPlaybooks to Cursor IDE, Claude Desktop, Claude Code, and other MCP-compatible tools. One URL, copy-paste config, instant AI tools.
date: 2026-04-05
author: Mate Benyovszky
---

# Connect Any Playbook as an MCP Server

Every playbook on AgentPlaybooks is also a live **MCP (Model Context Protocol) server**. That means you can plug it straight into Cursor, Claude Desktop, Claude Code, or any MCP-compatible client — and your AI agent immediately gets access to the playbook's tools, memory, canvas, and personas.

Today we're making this even easier with a new **Integrations** tab in the playbook dashboard and updated documentation covering Cursor IDE setup front and center.

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io/) is an open standard (originally developed by Anthropic) that lets AI assistants connect to external tools and data sources over a simple JSON-RPC interface. Think of it as a universal plugin system for AI.

AgentPlaybooks implements the MCP server specification for every playbook. Your skills become callable tools, your memory becomes readable/writable state, and your personas provide system prompt context — all via a single HTTP endpoint.

## The New Integrations Tab

We've restructured the playbook editor. The old "API Keys" tab is now called **Integrations** and contains everything you need to connect your playbook to external platforms:

1. **Connect as MCP Server** — Ready-to-copy JSON configs for Cursor, Claude Desktop, and Claude Code. The configs are pre-filled with your playbook's GUID and name.
2. **Use with AI Platforms** — Quick-action buttons (Open in Claude, Open in ChatGPT, export as ZIP) plus API endpoint reference.
3. **Platform Cards** — One-click links to step-by-step guides for Cursor, ChatGPT, Claude, Gemini, Claude Code, and generic API integration.
4. **API Keys** — Generate and manage authentication keys for write access.

## Connecting to Cursor IDE

Cursor has native MCP support. Here's how to connect:

### 1. Open the Integrations Tab

Go to your playbook in the dashboard and click the **Integrations** tab (the puzzle icon).

### 2. Copy the Cursor Config

You'll see a ready-to-copy JSON block. It looks like this:

```json
{
  "mcpServers": {
    "agentplaybooks-my-assistant": {
      "url": "https://agentplaybooks.ai/api/mcp/YOUR_GUID"
    }
  }
}
```

### 3. Paste into Cursor Settings

Save the JSON to one of:
- **Project-level**: `.cursor/mcp.json` in your project root
- **Global**: `~/.cursor/mcp.json` for all projects

### 4. Restart and Verify

Restart Cursor (or reload the window). Your playbook's tools will appear in Cursor's MCP tools panel.

## Connecting to Claude Desktop

```json
{
  "mcpServers": {
    "agentplaybooks-my-assistant": {
      "transport": "http",
      "url": "https://agentplaybooks.ai/api/mcp/YOUR_GUID"
    }
  }
}
```

Save this to your `claude_desktop_config.json` and restart Claude Desktop.

## Connecting to Claude Code

One command:

```bash
claude mcp add agentplaybooks-my-assistant https://agentplaybooks.ai/api/mcp/YOUR_GUID --transport http
```

Verify with `claude mcp list`.

## Authentication

**Public playbooks** require no authentication for read access. Anyone can connect and use the tools.

**Private playbooks** need an API key. Generate one from the Integrations tab and add it to your config:

```json
{
  "mcpServers": {
    "my-playbook": {
      "url": "https://agentplaybooks.ai/api/mcp/YOUR_GUID",
      "headers": {
        "Authorization": "Bearer apb_live_your_key_here"
      }
    }
  }
}
```

**Write-back** (saving to memory or canvas) always requires an API key, even for public playbooks. Keys come in three roles:
- **Viewer** — Read-only
- **Coworker** — Read + write
- **Admin** — Full access

## What Your AI Agent Gets

Once connected, your AI agent has access to:

| Component | MCP Capability |
|---|---|
| **Skills** | Callable tools with defined input schemas |
| **Memory** | Read/write/search persistent key-value store |
| **Canvas** | Read/write structured markdown documents |
| **Personas** | System prompt and personality context |
| **Secrets** | Server-side credential proxy (values never exposed) |

Built-in tools include `read_memory`, `write_memory`, `search_memory`, `read_canvas`, `write_canvas`, `patch_canvas_section`, `get_canvas_toc`, `list_secrets`, `use_secret`, and more.

## Testing Your Connection

From the Integrations tab, copy the test command:

```bash
curl -s https://agentplaybooks.ai/api/mcp/YOUR_GUID | head -c 200
```

If you see JSON with `protocolVersion` and `serverInfo`, you're good.

## What's Next

- **Cursor Marketplace** — We're working on listing AgentPlaybooks in the Cursor extension/MCP marketplace
- **Windsurf** and other MCP-compatible IDEs — Same endpoint works everywhere
- **Management MCP Server** — Use `https://agentplaybooks.ai/api/mcp/manage` with a User API Key to create and manage playbooks from within your AI agent

Check the [MCP Integration docs](/docs/mcp-integration) and [Platform Integrations guide](/docs/platform-integrations) for the full reference.

---

*AgentPlaybooks — Your AI's universal memory and toolkit. One playbook, every platform.*
