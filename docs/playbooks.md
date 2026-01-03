# What is a Playbook?

A **Playbook** is the complete operating environment for an AI agent - everything it needs to work effectively, all in one portable package. Think of it as an AI's "work profile" that travels with it across any platform.

## The Problem Playbooks Solve

When you use AI assistants across different platforms (ChatGPT, Claude, Gemini, local LLMs), you face these challenges:

- **Knowledge fragmentation** - Each platform has its own memory and context
- **Repeated setup** - Recreating system prompts and configurations everywhere
- **Platform lock-in** - Your AI's accumulated knowledge is trapped in one service
- **No portability** - Switching platforms means starting over

AgentPlaybooks solves this by providing a **platform-independent vault** that any AI can access.

## Playbook Components

A Playbook combines five core elements that together define an AI agent's complete working environment:

### 1. Persona - Personality & Style

The agent's base personality, communication style, and system prompt. This defines **HOW** the agent behaves and responds.

```markdown
# Persona Example

You are a senior software architect with 15 years of experience.
You:
- Write clean, well-documented code
- Explain complex concepts simply
- Ask clarifying questions before making assumptions
- Prefer simplicity over cleverness
```

**Use cases:**
- Consistent brand voice across all AI interactions
- Role-specific behavior (coder, writer, analyst)
- Custom interaction styles (formal, casual, technical)

### 2. Skills - Knowledge & Capabilities

Structured task definitions and knowledge the agent can use. Skills define **WHAT** the agent knows and can do. Written in Anthropic Skill format for maximum compatibility.

```json
{
  "name": "code_review",
  "description": "Review code for bugs, security issues, and improvements",
  "parameters": {
    "type": "object",
    "properties": {
      "code": { "type": "string", "description": "The code to review" },
      "language": { "type": "string", "description": "Programming language" },
      "focus": { 
        "type": "array", 
        "items": { "type": "string" },
        "description": "Areas to focus on: security, performance, style"
      }
    },
    "required": ["code"]
  }
}
```

**Use cases:**
- Structured task definitions
- Company-specific procedures
- Domain expertise (legal, medical, technical)
- *Coming soon: Attach documents for deeper knowledge*

### 3. MCP Servers - Tools & Integrations

External tools and APIs the agent can access via the [Model Context Protocol](https://modelcontextprotocol.io/). MCP provides a standardized way for AI to use external tools.

**Important:** Code execution happens at the agent itself - the MCP server just provides the connection and tool definitions.

```json
{
  "name": "database_tools",
  "tools": [
    {
      "name": "query_database",
      "description": "Execute a read-only SQL query",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string" },
          "database": { "type": "string" }
        }
      }
    }
  ],
  "resources": [
    {
      "uri": "db://schema",
      "name": "Database Schema",
      "mimeType": "application/json"
    }
  ]
}
```

**Use cases:**
- Database access
- File system operations
- API integrations
- Custom tool definitions

### 4. Canvas - Working Documents

Structured markdown documents that serve as the agent's persistent workspace. Notes, drafts, project files - documents the agent can read and write across sessions.

```markdown
# Project: Website Redesign

## Status
In Progress - Phase 2

## Key Decisions
- Using Next.js 16 with App Router
- Tailwind CSS for styling
- Supabase for backend

## Open Questions
- [ ] Confirm color palette with design team
- [ ] Review performance requirements

## Notes
2024-01-15: Initial meeting with stakeholders...
```

**Use cases:**
- Project documentation
- Meeting notes and summaries
- Draft documents
- Research notes
- Persistent scratchpads

### 5. Memory - Persistent Context

Key-value storage for remembering facts, preferences, and state across sessions. The agent's long-term memory for structured data.

```json
{
  "user_preferences": {
    "code_style": "functional",
    "preferred_language": "TypeScript",
    "verbosity": "concise"
  },
  "project_context": {
    "name": "AgentPlaybooks",
    "stack": ["Next.js", "Supabase", "Cloudflare"],
    "last_task": "Implemented i18n support"
  }
}
```

**Use cases:**
- User preferences
- Session state
- Accumulated facts
- Configuration data

## How It All Fits Together

```
┌─────────────────────────────────────────────────────────────┐
│                        PLAYBOOK                             │
│  "My Coding Assistant"                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   PERSONA   │  │   SKILLS    │  │ MCP SERVERS │         │
│  │             │  │             │  │             │         │
│  │ How I act   │  │ What I know │  │ Tools I use │         │
│  │ & respond   │  │ & can do    │  │ & connect   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │         CANVAS          │  │         MEMORY          │  │
│  │                         │  │                         │  │
│  │   Working documents     │  │   Persistent facts      │  │
│  │   Notes, drafts, files  │  │   Key-value storage     │  │
│  └─────────────────────────┘  └─────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              Works on ANY AI platform:
         ChatGPT • Claude • Gemini • Local LLMs
              • Custom Agents • Future Robots
```

## Accessing Your Playbook

Once published, your playbook is available in multiple formats:

| Format | URL | Use Case |
|--------|-----|----------|
| JSON | `/api/playbooks/GUID` | Programmatic access |
| Markdown | `/api/playbooks/GUID?format=markdown` | Human readable |
| OpenAPI | `/api/playbooks/GUID?format=openapi` | ChatGPT Actions |
| Anthropic | `/api/playbooks/GUID?format=anthropic` | Claude API |
| MCP | `/api/mcp/GUID` | Model Context Protocol |

## Creating Your First Playbook

1. **Sign up** at [agentplaybooks.ai](https://agentplaybooks.ai)
2. **Create a playbook** from the dashboard
3. **Add a persona** - Define your AI's personality
4. **Add skills** - Define what it can do
5. **Publish** - Make it accessible
6. **Connect** - Give the URL to your AI

See [Getting Started](./getting-started.md) for detailed instructions.

## Best Practices

### Personas
- Be specific about communication style
- Include examples of good responses
- Define what the AI should NOT do

### Skills
- Use clear, descriptive names
- Include parameter descriptions
- Add examples for complex skills

### Canvas
- Use consistent document structure
- Include timestamps for notes
- Organize with clear headings

### Memory
- Use descriptive key names
- Keep values structured (JSON)
- Document what each key stores

## Next Steps

- [Platform Integrations](./platform-integrations.md) - Connect to ChatGPT, Claude, Gemini
- [MCP Integration](./mcp-integration.md) - Deep dive into Model Context Protocol
- [API Reference](./api-reference.md) - Full endpoint documentation


