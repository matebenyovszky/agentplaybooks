---
title: Deep MCP Integration — AgentPlaybooks meets Clawdbot
description: How to connect your AgentPlaybooks with Clawdbot, the trending open-source self-hosted AI assistant that supports WhatsApp, Telegram, and full MCP protocol.
date: 2026-01-27
author: Mate Benyovszky
---

# Deep MCP Integration: AgentPlaybooks meets Clawdbot

The AI assistant landscape just got a major shake-up. **Clawdbot**, the open-source, self-hosted personal AI assistant created by Peter Steinberger, is trending across developer communities — and for good reason. It combines the power of Claude, ChatGPT, and Gemini with full **Model Context Protocol (MCP)** support, WhatsApp/Telegram/Discord integration, and complete local control.

Today, we're excited to announce first-class support for Clawdbot in **AgentPlaybooks**. This means you can now power your Clawdbot with portable, shareable playbooks — complete with skills, personas, and persistent memory.

## What is Clawdbot?

Clawdbot is an **AI Gateway** that acts as a bridge between popular messaging platforms and large language model APIs. Key features include:

- 🔐 **Self-hosted privacy** — Runs on your own hardware (typically a Mac Mini)
- 📱 **Multi-platform messaging** — WhatsApp, Telegram, Discord, and more
- 🧠 **Persistent memory** — Remembers context across conversations
- 🤖 **Proactive messaging** — Can initiate conversations based on triggers
- 🔧 **Full MCP support** — Extends capabilities via the Model Context Protocol
- 🌐 **Multi-LLM backend** — Choose Claude, ChatGPT, Gemini, or local models

Unlike cloud-based AI assistants, Clawdbot keeps your data local and gives you complete control over the AI's behavior.

## Why MCP Changes Everything

The **Model Context Protocol** is an open standard (developed by Anthropic) that allows AI agents to connect to external tools and data sources. Think of it as a universal plugin system for AI.

With MCP, your Clawdbot can:
- Access real-time data from external APIs
- Execute tools and functions
- Read from persistent memory stores
- Follow structured skill definitions

AgentPlaybooks provides a fully compliant MCP server endpoint for every playbook — making integration seamless.

## Setting Up AgentPlaybooks with Clawdbot

### Step 1: Create Your Playbook

First, create a playbook at [agentplaybooks.ai/dashboard](/dashboard) with:

- **Personas** — Define how your assistant should behave
- **Skills** — What capabilities it should have
- **Memory** — Persistent context it should remember

### Step 2: Get Your MCP Endpoint

Every public playbook gets an MCP endpoint:

```
https://agentplaybooks.ai/api/mcp/YOUR_GUID
```

### Step 3: Configure Clawdbot

Add your AgentPlaybooks MCP server to Clawdbot's configuration. In your `config.yaml`:

```yaml
# Clawdbot config.yaml
llm:
  provider: anthropic  # or openai, google
  model: claude-sonnet-4-20250514

mcp_servers:
  - name: agent-playbook
    transport: http
    url: https://agentplaybooks.ai/api/mcp/YOUR_GUID
    description: My custom AI playbook with skills and memory

messaging:
  whatsapp:
    enabled: true
    phone_number: "+1234567890"
  telegram:
    enabled: true
    bot_token: "your_bot_token"
```

### Step 4: Verify Connection

Start Clawdbot and verify the MCP connection:

```bash
clawdbot status

# Output should show:
# MCP Servers:
#   ✓ agent-playbook (connected)
#     - Tools: 5 available
#     - Resources: 3 available
```

## What Your Clawdbot Gets

Once connected, Clawdbot inherits everything from your playbook:

### Tools (from Skills)

Your skills become callable tools. For example:

| Playbook Skill | Clawdbot Tool |
|---------------|---------------|
| `search_web` | `search_web(query)` |
| `summarize_text` | `summarize_text(text, length)` |
| `translate_document` | `translate_document(text, target_lang)` |

### Resources

Clawdbot can read your playbook resources:

```
playbook://YOUR_GUID/personas  → AI personalities
playbook://YOUR_GUID/memory    → Persistent storage
playbook://YOUR_GUID/skills    → Capability definitions
```

### Persistent Memory

The killer feature: **shared memory across platforms**. Update a memory entry via Clawdbot on WhatsApp, and it's immediately available when you chat on Telegram or Discord.

```javascript
// Clawdbot automatically syncs memory
await mcp.writeResource("playbook://GUID/memory/user_preferences", {
  timezone: "Europe/Budapest",
  language: "hu",
  notification_style: "brief"
});
```

## Real-World Use Cases

### 🏠 Smart Home Assistant

Use Clawdbot + AgentPlaybooks to create a personal home assistant:

**Playbook skills:**
- `control_lights` — Interface with Home Assistant
- `set_thermostat` — Adjust temperature
- `check_calendar` — Read today's events
- `send_reminder` — Push notifications

**Messaging platforms:**
- WhatsApp for family members
- Telegram for quick commands
- Discord for home automation logs

### 📊 Business Intelligence Bot

**Playbook skills:**
- `query_database` — Run SQL queries safely
- `generate_chart` — Create visualizations
- `summarize_report` — Condense long documents
- `schedule_meeting` — Book calendar slots

**Playbook memory:**
- Recent queries and results
- User preferences
- Commonly used metrics

### 🌍 Multilingual Support Agent

**Playbook personas:**
- Hungarian support persona
- English support persona
- German support persona

**Skills:**
- `detect_language` — Auto-detect user language
- `translate_response` — Translate before sending
- `log_ticket` — Create support tickets

## Advanced: Bidirectional Memory Sync

AgentPlaybooks supports write-back via API. Configure Clawdbot to persist memories:

```yaml
mcp_servers:
  - name: agent-playbook
    transport: http
    url: https://agentplaybooks.ai/api/mcp/YOUR_GUID
    auth:
      type: bearer
      token: apb_live_xxx  # Your AgentPlaybooks API key
    write_enabled: true
```

Now Clawdbot can update your playbook's memory:

```python
# Inside Clawdbot tool execution
def remember_user_preference(key: str, value: any):
    requests.put(
        f"https://agentplaybooks.ai/api/playbooks/{GUID}/memory/{key}",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"value": value}
    )
```

## Sample Clawdbot-Ready Playbook

Here's a complete playbook JSON you can import:

```json
{
  "name": "Clawdbot Personal Assistant",
  "description": "Multi-platform AI assistant with MCP integration",
  "personas": [
    {
      "name": "Assistant",
      "system_prompt": "You are a helpful personal assistant. You can search the web, manage tasks, and remember user preferences. Always be concise in messaging contexts."
    }
  ],
  "skills": [
    {
      "name": "quick_search",
      "description": "Search the web and return a brief summary suitable for messaging",
      "input_schema": {
        "type": "object",
        "properties": {
          "query": {"type": "string"},
          "max_results": {"type": "integer", "default": 3}
        },
        "required": ["query"]
      }
    },
    {
      "name": "set_reminder",
      "description": "Create a reminder that will be sent via the current messaging platform",
      "input_schema": {
        "type": "object",
        "properties": {
          "message": {"type": "string"},
          "when": {"type": "string", "description": "Natural language time like 'in 2 hours' or 'tomorrow at 9am'"}
        },
        "required": ["message", "when"]
      }
    },
    {
      "name": "manage_task",
      "description": "Add, complete, or list tasks from the personal task list",
      "input_schema": {
        "type": "object",
        "properties": {
          "action": {"type": "string", "enum": ["add", "complete", "list"]},
          "task": {"type": "string"},
          "priority": {"type": "string", "enum": ["low", "medium", "high"]}
        },
        "required": ["action"]
      }
    }
  ],
  "memory": {
    "user_name": "Friend",
    "preferred_language": "en",
    "notification_hours": "09:00-22:00"
  }
}
```

## The Privacy Advantage

Unlike cloud-only solutions, the Clawdbot + AgentPlaybooks combo offers:

| Feature | Cloud AI | Clawdbot + AgentPlaybooks |
|---------|----------|--------------------------|
| Data location | Provider's servers | Your local machine |
| Message privacy | Logged by vendor | Stays on device |
| Customization | Limited | Unlimited |
| Offline capability | None | Full (with local LLM) |
| Cost | Per-message fees | Fixed infrastructure |

## Getting Started Today

1. **Install Clawdbot** — Follow the [Clawdbot documentation](https://github.com/steipete/clawdbot)
2. **Create a playbook** — Design your AI at [agentplaybooks.ai/dashboard](/dashboard)
3. **Connect via MCP** — Add your playbook endpoint to Clawdbot config
4. **Start chatting** — Your AI assistant is ready on WhatsApp, Telegram, and Discord

---

The combination of Clawdbot's self-hosted infrastructure and AgentPlaybooks' portable playbooks creates the ultimate AI assistant stack — private, powerful, and completely under your control.

Ready to build your own? [Create your playbook →](/dashboard)

