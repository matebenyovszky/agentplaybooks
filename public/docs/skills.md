# Skills

Skills are structured capability definitions that describe what an AI agent can do. They follow the [Anthropic skill structure](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use) format, making them compatible with Claude and other AI systems.

## What is a Skill?

A skill is a reusable capability definition that includes:

- **Name** - Unique identifier for the skill
- **Description** - What the skill does (used for AI reasoning)
- **Definition** - Structured parameters and schema (JSON Schema)
- **Examples** - Sample inputs/outputs for better AI understanding

## Why Use Skills?

1. **Portability** - Same skill works across ChatGPT, Claude, custom agents
2. **Consistency** - Standardized format ensures reliable behavior
3. **Reusability** - Create once, use everywhere
4. **Community** - Browse and add skills from the public repository

## Skill Structure

```json
{
  "name": "search_codebase",
  "description": "Search for code patterns, function definitions, or file contents in the project codebase",
  "definition": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query or pattern to look for"
      },
      "file_type": {
        "type": "string",
        "description": "Filter by file extension (e.g., 'ts', 'py', 'md')",
        "optional": true
      },
      "max_results": {
        "type": "integer",
        "description": "Maximum number of results to return",
        "default": 10
      }
    },
    "required": ["query"]
  },
  "examples": [
    {
      "input": { "query": "handleSubmit", "file_type": "tsx" },
      "output": "Found 3 matches in src/components/..."
    }
  ]
}
```

## Creating Skills

### Via Dashboard

1. Navigate to your playbook
2. Click **"Add Skill"**
3. Fill in the skill details
4. Test with example inputs
5. Save and optionally publish to community

### Via API

```bash
POST /api/playbooks/:guid/skills
Authorization: Bearer apb_live_xxx
Content-Type: application/json

{
  "name": "my_custom_skill",
  "description": "Does something useful",
  "definition": { ... }
}
```

## Anthropic Compatibility

AgentPlaybooks skills are designed to be directly compatible with Anthropic's tool use format:

```python
# Python example with Claude
import anthropic

# Fetch skills from AgentPlaybooks
skills_response = requests.get("https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=anthropic")
tools = skills_response.json()["tools"]

# Use with Claude
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    tools=tools,  # Skills from AgentPlaybooks
    messages=[{"role": "user", "content": "Search for handleSubmit"}]
)
```

## OpenAI GPT Compatibility

Skills are also exportable in OpenAPI format for ChatGPT Custom GPTs:

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
2. **Specific parameters** - Well-defined schemas reduce errors
3. **Examples** - Include diverse examples for better AI understanding
4. **Atomic skills** - Each skill should do one thing well
5. **Version carefully** - Changing schemas may break existing integrations

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
# Export skills in Anthropic format
curl -s "https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=anthropic" \
  | jq '.tools' > ~/Documents/CoworkerSkills/my_skills.json

# Or connect via MCP (recommended)
# Add to claude_desktop_config.json:
# "mcpServers": {"playbook": {"transport": "http", "url": "https://agentplaybooks.ai/api/mcp/YOUR_GUID"}}
```

