# Getting Started

This guide will help you create your first playbook and connect it to an AI agent.

## Prerequisites

- A web browser
- An AI platform (ChatGPT, Claude, or any custom agent)

## Step 1: Create an Account

1. Go to [agentplaybooks.ai](https://agentplaybooks.ai)
2. Click "Get Started" or "Sign In"
3. Register with email, Google, or GitHub

## Step 2: Create Your First Playbook

1. From the Dashboard, click **"Create Playbook"**
2. Give it a name (e.g., "My AI Assistant")
3. You'll be taken to the Playbook Editor

## Step 3: Add a Persona

Personas are system prompts that define your AI's personality and behavior.

1. In the Playbook Editor, go to the **Personas** tab
2. Click **"Add Persona"**
3. Enter a name and system prompt:

```
You are a helpful coding assistant. You:
- Write clean, well-documented code
- Explain concepts clearly
- Suggest best practices
- Ask clarifying questions when needed
```

4. Save your changes

## Step 4: Add Skills (Optional)

Skills define specific capabilities or tasks your AI can perform.

1. Go to the **Skills** tab
2. Click **"Add Skill"**
3. Define a skill like "Code Review":

```json
{
  "name": "code_review",
  "description": "Review code for bugs, style issues, and improvements",
  "parameters": {
    "type": "object",
    "properties": {
      "code": {
        "type": "string",
        "description": "The code to review"
      },
      "language": {
        "type": "string",
        "description": "Programming language"
      }
    }
  }
}
```

## Step 5: Publish Your Playbook

1. Go to the **Settings** tab
2. Toggle **"Public"** to make your playbook accessible
3. Copy your playbook URL: `https://agentplaybooks.ai/api/playbooks/YOUR_GUID`

## Step 6: Connect to Your AI

### For ChatGPT (Custom GPT)

1. Create a new Custom GPT
2. In the Instructions field, add:

```
Before responding, fetch my playbook for context:
GET https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=markdown

Use the personas and skills defined there.
```

### For Claude

Use the MCP endpoint directly:

```
GET https://agentplaybooks.ai/api/mcp/YOUR_GUID
```

### For Custom Agents

Fetch the playbook in your preferred format:

```bash
# JSON (default)
curl https://agentplaybooks.ai/api/playbooks/YOUR_GUID

# OpenAPI spec
curl https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=openapi

# MCP format
curl https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=mcp
```

## Step 7: Enable AI Write-Back (Optional)

Let your AI store information in the playbook's memory:

1. Go to the **API Keys** tab
2. Click **"Generate New Key"**
3. Copy the key (shown only once!)
4. Give the key to your AI:

```
You can store memories at:
PUT https://agentplaybooks.ai/api/playbooks/YOUR_GUID/memory/memory_name
Authorization: Bearer YOUR_API_KEY
Body: {"value": {...}}
```

## Next Steps

- [Platform Integrations](./platform-integrations.md) - Detailed guide for ChatGPT, Claude, Gemini, Grok, and API integrations
- [Explore the public repository](/explore) for pre-built skills
- Read the [API Reference](./api-reference.md) for all endpoints
- Learn about [MCP Integration](./mcp-integration.md) for Claude
