# Skills

Skills are portable instructional documents that describe how an agent should solve a class of tasks. They use SKILL.md-compatible content and are deliberately separate from executable MCP/OpenAPI tools.

## What is a Skill?

A skill includes:

- **Name** - Human-readable identifier
- **Description** - When the agent should load the skill
- **Content** - The SKILL.md instruction body
- **Licence** - Optional usage licence
- **Priority** - Ordering/context priority

## Why Use Skills?

1. **Portability** - Same skill works across ChatGPT, Claude, custom agents
2. **Consistency** - Standardized format ensures reliable behavior
3. **Reusability** - Create once, use everywhere
4. **Community** - Browse and add skills from the public repository

## Skill Structure

```json
{
  "name": "Codebase search",
  "description": "Use when locating code patterns or definitions",
  "content": "# Codebase search\nUse repository search first...",
  "licence": "MIT",
  "priority": 80
}
```

## Creating Skills

### Via Dashboard

1. Navigate to your playbook
2. Click **"Add Skill"**
3. Fill in the skill details
4. Write the SKILL.md instructions
5. Save and optionally publish to community

### Via API

```bash
POST /api/playbooks/:guid/skills
Authorization: Bearer apb_live_xxx
Content-Type: application/json

{
  "name": "My custom guide",
  "description": "Use when the task needs this workflow",
  "content": "# Workflow\nFollow these steps...",
  "licence": "MIT",
  "priority": 50
}
```

## Anthropic and MCP Compatibility

Skills are supplied as instructions/resources, not declared as executable Anthropic tools. The live MCP endpoint reads skills with `list_skills` and `get_skill`; executable tools come from federated MCP/OpenAPI integrations:

```python
# Python example with Claude
import anthropic

# Fetch executable tools and instructional skills
playbook = requests.get("https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=anthropic").json()
tools = playbook["tools"]
skills = playbook["skills"]

# Use with Claude
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "Search for handleSubmit"}]
)
```

## OpenAI GPT Compatibility

The OpenAPI export exposes actual federated operations as callable actions and includes skills under `x-playbook.skills` as context:

```
GET /api/playbooks/:guid?format=openapi
```

This returns an OpenAPI 3.0 specification that can be used as a GPT Action.

## Public Skill Repository

Browse community-contributed skills at [agentplaybooks.ai/explore](https://agentplaybooks.ai/explore):

- **Coding** - Code search, refactoring, documentation
- **Writing** - Grammar check, summarization, translation
- **Data** - Data analysis, visualization, conversion
- **Automation** - Task scheduling, notifications, integrations
- **Research** - Web search, fact-checking, citations

## Best Practices

1. **Clear descriptions** - AI uses this to decide when to use the skill
2. **Actionable content** - Describe a reproducible workflow
3. **Examples in content** - Include examples where they improve the instructions
4. **Focused skills** - Each skill should cover one coherent workflow
5. **Use tools for execution** - Put network/API operations in MCP or OpenAPI integrations

---

## Claude Coworker Compatible Skills

[Claude Coworker](https://claude.ai/cowork) is Anthropic's desktop AI agent that can organize files, convert documents, and automate workflows. Skills from AgentPlaybooks work directly with Coworker via MCP.

### File Organization Skill

```json
{
  "name": "organize_files",
  "description": "Organize files in a folder according to rules based on file type, date, and naming patterns",
  "input_schema": {
    "type": "object",
    "properties": {
      "source_folder": {
        "type": "string",
        "description": "Path to folder containing files to organize"
      },
      "rules": {
        "type": "string",
        "description": "Organization rules in natural language (e.g., 'PDFs to Documents/PDFs, images to Photos by month')"
      },
      "dry_run": {
        "type": "boolean",
        "description": "Preview changes without moving files",
        "default": true
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
  "description": "Convert raw notes or data into formatted documents following company templates",
  "input_schema": {
    "type": "object",
    "properties": {
      "input_path": {
        "type": "string",
        "description": "Path to source document"
      },
      "template": {
        "type": "string",
        "enum": ["meeting_notes", "weekly_report", "project_brief", "custom"],
        "description": "Template to apply"
      },
      "output_format": {
        "type": "string",
        "enum": ["markdown", "html", "pdf"],
        "default": "markdown"
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
  "description": "Generate structured reports from data files with optional charts and executive summary",
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
        "enum": ["weekly", "monthly", "quarterly", "custom"]
      },
      "include_charts": {
        "type": "boolean",
        "description": "Include data visualizations",
        "default": true
      },
      "executive_summary": {
        "type": "boolean",
        "description": "Generate executive summary section",
        "default": true
      }
    },
    "required": ["data_sources", "report_type"]
  }
}
```

### Using Skills with Coworker

Export your playbook skills for Claude Coworker:

```bash
# Export instructional skills
curl -s "https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=anthropic" \
  | jq '.skills' > ~/Documents/CoworkerSkills/my_skills.json

# Or connect via MCP (recommended)
# Add to claude_desktop_config.json:
# "mcpServers": {"playbook": {"transport": "http", "url": "https://agentplaybooks.ai/api/mcp/YOUR_GUID"}}
```
