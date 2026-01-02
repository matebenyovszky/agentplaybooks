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

