---
title: Supercharge Claude Coworker with AgentPlaybooks
description: Learn how to enhance Anthropic's new Claude Coworker with portable skills, personas, and persistent memory from AgentPlaybooks.
date: 2026-01-20
author: Mate Benyovszky
---

# Supercharge Claude Coworker with AgentPlaybooks

Anthropic just launched **Claude Coworker** (also known as Claude Cowork) — a groundbreaking AI agent that operates directly on your Mac. Unlike chat-based assistants, Coworker can actually *do* things: organize files, convert documents, generate reports, and automate workflows without you lifting a finger.

But here's the challenge: how do you ensure Coworker follows your company's specific guidelines? How do you share a finely-tuned agent configuration across your team? That's exactly where **AgentPlaybooks** comes in.

## What is Claude Coworker?

Claude Coworker is Anthropic's research preview of an autonomous AI agent that:

- **Accesses your file system** — reads, writes, and organizes files in designated folders
- **Executes multi-step tasks** — plans and completes complex workflows autonomously
- **Uses connectors** — integrates with external services and data sources
- **Learns from skills** — follows modular instruction packages (Claude Skills)

It's built on the same technology as Claude Code (Anthropic's developer-focused CLI tool), but designed for everyone — from marketers to operations managers.

## The Power of Claude Skills

Claude Skills are instruction packages that teach Coworker how to handle specific tasks. Think of them as **portable expertise**. A skill might define:

- How to organize expense reports by quarter
- How to format meeting notes into a specific template
- How to generate weekly status reports from raw data

AgentPlaybooks takes this concept further by providing a **universal platform** to create, manage, and share these skills.

## Integrating AgentPlaybooks with Claude Coworker

### Method 1: Export Skills as Claude Skills Format

AgentPlaybooks skills are already compatible with Anthropic's tool format. To use them with Coworker:

1. **Export your playbook** in Anthropic format:
   ```
   https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=anthropic
   ```

2. **Convert skills to a local skill folder** that Coworker can access:
   ```bash
   curl -s "https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=anthropic" \
     | jq '.tools' > ~/Documents/CoworkerSkills/my_skills.json
   ```

3. **Point Coworker to your skills** in the Claude app settings.

### Method 2: MCP Integration (Recommended)

The most powerful integration is via **Model Context Protocol (MCP)**. AgentPlaybooks provides a live MCP endpoint for each playbook:

```
https://agentplaybooks.ai/api/mcp/YOUR_GUID
```

Configure Claude Coworker's MCP settings:

```json
{
  "mcpServers": {
    "my-playbook": {
      "transport": "http",
      "url": "https://agentplaybooks.ai/api/mcp/YOUR_GUID"
    }
  }
}
```

Now Coworker has access to:
- **Tools** — All your playbook skills as callable functions
- **Resources** — Personas, memory, and skill definitions
- **Persistent Memory** — Your agent remembers context across sessions

### Method 3: System Prompt Injection

For simpler setups, include your playbook in Coworker's operating context:

1. Export as markdown:
   ```bash
   curl -s "https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=markdown" > ~/Documents/playbook.md
   ```

2. Add to your designated Coworker folders as a reference document.

## Real-World Use Cases

### 🏢 Enterprise Knowledge Workers

*Problem*: Every employee's AI assistant behaves differently.
*Solution*: Create a company playbook with standardized personas and skills. Share via a single URL. Everyone's Coworker follows the same guidelines.

### 📊 Report Automation

*Problem*: Weekly reports take hours to compile.
*Solution*: Create a playbook with skills for:
- `extract_metrics` — Pull data from spreadsheets
- `format_report` — Apply company template
- `summarize_findings` — Generate executive summary

Coworker runs these autonomously every Friday morning.

### 📁 Document Organization

*Problem*: Files scattered across Downloads, Desktop, and random folders.
*Solution*: A playbook with organization rules in memory:
- Invoices → `/Documents/Finance/Invoices/2026/`
- Screenshots → `/Documents/Screenshots/{date}/`
- Meeting notes → `/Documents/Meetings/{project}/`

## Sample Skills for Claude Coworker

Here are three production-ready skills you can add to your AgentPlaybooks playbook:

### File Organization Skill

```json
{
  "name": "organize_files",
  "description": "Organize files in a folder according to predefined rules based on file type, date, and naming patterns",
  "input_schema": {
    "type": "object",
    "properties": {
      "source_folder": {
        "type": "string",
        "description": "Path to the folder containing files to organize"
      },
      "rules": {
        "type": "string",
        "description": "Organization rules in natural language"
      }
    },
    "required": ["source_folder"]
  }
}
```

### Document Formatting Skill

```json
{
  "name": "format_document",
  "description": "Convert raw notes or data into a formatted document following company templates",
  "input_schema": {
    "type": "object",
    "properties": {
      "input_path": {
        "type": "string",
        "description": "Path to the source document"
      },
      "template": {
        "type": "string",
        "description": "Template name to apply (e.g., 'meeting_notes', 'weekly_report')"
      },
      "output_path": {
        "type": "string",
        "description": "Where to save the formatted document"
      }
    },
    "required": ["input_path", "template"]
  }
}
```

### Report Generation Skill

```json
{
  "name": "generate_report",
  "description": "Generate a structured report from data files, including charts and executive summary",
  "input_schema": {
    "type": "object",
    "properties": {
      "data_sources": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Paths to data files (CSV, Excel, JSON)"
      },
      "report_type": {
        "type": "string",
        "enum": ["weekly", "monthly", "quarterly", "custom"],
        "description": "Type of report to generate"
      },
      "include_charts": {
        "type": "boolean",
        "description": "Whether to include data visualizations"
      }
    },
    "required": ["data_sources", "report_type"]
  }
}
```

## Why AgentPlaybooks + Claude Coworker?

| Challenge | AgentPlaybooks Solution |
|-----------|------------------------|
| Skill fragmentation | Centralized, versioned skill library |
| Team inconsistency | Shared playbooks via URL |
| Vendor lock-in | Export to any format (Anthropic, OpenAI, MCP) |
| Context loss | Persistent memory across sessions |
| No visibility | Dashboard to manage all agent configurations |

## Getting Started

1. **Create a playbook** at [agentplaybooks.ai/dashboard](/dashboard)
2. **Add your skills and personas** using our intuitive editor
3. **Export via MCP** to connect with Claude Coworker
4. **Share with your team** — one URL, instant synchronization

---

Claude Coworker represents the future of AI assistance — agents that actually *work* alongside you. With AgentPlaybooks, you ensure that work is consistent, transferable, and under your control.

Ready to supercharge your AI coworker? [Start building your playbook today →](/dashboard)

