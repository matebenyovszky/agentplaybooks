# Platform Integrations

This guide explains how to connect your AgentPlaybooks to various AI platforms, both through web interfaces and programmatic APIs.

## Prerequisites

Before integrating, make sure you have:

1. A published playbook with a public URL: `https://agentplaybooks.ai/api/playbooks/YOUR_GUID`
2. (Optional) An API key for write-back functionality
3. Your preferred format URL ready:
   - **JSON**: `/api/playbooks/YOUR_GUID` (recommended for Gemini Gems)
   - **Markdown**: `/api/playbooks/YOUR_GUID?format=markdown`
   - **OpenAPI**: `/api/playbooks/YOUR_GUID?format=openapi`
   - **Anthropic**: `/api/playbooks/YOUR_GUID?format=anthropic`
   - **MCP**: `/api/mcp/YOUR_GUID`

Note: The MCP manifest (`/api/playbooks/YOUR_GUID?format=mcp`) is a static export, while the MCP server endpoint (`/api/mcp/YOUR_GUID`) is a live MCP service.

---

# Part 1: Web Interface Integrations

These are step-by-step instructions for connecting playbooks through AI platform web interfaces.

---

## OpenAI ChatGPT (Custom GPTs)

ChatGPT Plus, Team, or Enterprise users can create Custom GPTs that use your playbook.

### Step 1: Create a New GPT

1. Go to [chat.openai.com](https://chat.openai.com)
2. Click your profile icon → **My GPTs** → **Create a GPT**
3. Or directly go to [chatgpt.com/gpts/editor](https://chatgpt.com/gpts/editor)

### Step 2: Configure the GPT

In the **Create** tab, fill in:

- **Name**: Your assistant's name
- **Description**: Brief description of what it does
- **Instructions**: This is your system prompt

### Step 3: Add System Instructions

In the **Instructions** field, add:

```
You are an AI assistant configured with a playbook from AgentPlaybooks.

IMPORTANT: At the start of each conversation, fetch your configuration:
1. Call the "getPlaybook" action to retrieve your personas, skills, and memory
2. Apply the persona(s) defined in the response
3. Use the skills as guidelines for your capabilities
4. Reference the memory for persistent context

Always follow the system prompts and guidelines defined in your playbook.
If the playbook contains memory entries, use them as context for your responses.
```

### Step 4: Add an Action (API Integration)

1. Scroll down to **Actions** → Click **Create new action**
2. Click **Import from URL**
3. Enter your OpenAPI URL:
   ```
   https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=openapi
   ```
4. Click **Import**

This creates an action called `getPlaybook` that fetches your configuration.

### Step 5: Enable Additional Capabilities

Enable these options for best results:

- ✅ **Web Browsing** - For fetching playbook updates
- ✅ **Code Interpreter** - For executing code-related skills
- ✅ **DALL-E Image Generation** - If your playbook includes image-related skills

### Step 6: Model & Reasoning Settings

For best results with complex playbooks:

1. If available, select **GPT-4o** or **GPT-4** as the base model
2. For reasoning tasks, consider enabling **Reasoning** mode (o1/o3 models)

### Step 7: Test and Publish

1. Test in the Preview panel
2. Click **Create** / **Update**
3. Choose visibility: **Only me**, **Anyone with a link**, or **Public**

### Advanced: Memory Write-back

To allow your GPT to store memories back to the playbook:

1. Add another action with this OpenAPI schema:

```yaml
openapi: 3.1.0
info:
  title: AgentPlaybooks Memory API
  version: "1.0"
servers:
  - url: https://agentplaybooks.ai
paths:
  /api/playbooks/{guid}/memory/{key}:
    put:
      operationId: writeMemory
      summary: Store a memory entry
      parameters:
        - name: guid
          in: path
          required: true
          schema:
            type: string
          description: Your playbook GUID
        - name: key
          in: path
          required: true
          schema:
            type: string
          description: Memory key name
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                value:
                  type: object
                  description: The value to store
      responses:
        "200":
          description: Memory saved successfully
      security:
        - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
```

2. In Action settings, set **Authentication** to **API Key**
3. Enter your AgentPlaybooks API key (format: `apb_live_xxx...`)

---

## Anthropic Claude (claude.ai)

Claude doesn't have a custom GPT-style system, but you can use Projects for persistent context.

### Method 1: Using Projects (Recommended)

Claude Pro and Team users can create Projects with custom instructions.

#### Step 1: Create a Project

1. Go to [claude.ai](https://claude.ai)
2. Click **Projects** in the sidebar
3. Click **+ New Project**
4. Name your project

#### Step 2: Add Project Instructions

In the **Project Instructions** field, add:

```
## Your Configuration

Fetch your playbook configuration from:
https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=markdown

Follow the personas, skills, and guidelines defined there.

## Initial Setup

At the start of each conversation:
1. Reference the playbook context provided above
2. Apply the persona defined in the playbook
3. Use the skills as your capability guidelines
4. Check memory entries for persistent context

## Memory Management

To view current memories:
https://agentplaybooks.ai/api/playbooks/YOUR_GUID/memory

When you need to remember something for future conversations, inform the user
that they can manually update the playbook memory, or provide them with the
data to save.
```

#### Step 3: Add Knowledge Files (Optional)

1. Click **Add content** → **Add files**
2. Download your playbook as a text file:
   ```
   curl https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=markdown -o playbook.md
   ```
3. Upload `playbook.md` to the project

#### Step 4: Configure Model Settings

For best results:
- Use **Claude Sonnet 4** or **Claude Opus 4** for complex tasks
- Enable **Extended thinking** for reasoning-heavy playbooks
- Set appropriate **Thinking budget** (higher for complex analysis)

### Method 2: Manual System Prompt

For single conversations without Projects:

1. Start a new chat
2. In your first message, include:

```
Please configure yourself with this playbook:

[Paste the content from: https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=markdown]

Follow these instructions as your operational guidelines for this conversation.
```

---

## Google Gemini (Gems / Gem agent)

### Using Gems (Gemini Advanced)

Gemini Advanced users can create Gems with custom instructions.

#### Step 1: Create a Gem

1. Go to [gemini.google.com](https://gemini.google.com)
2. Click **Gem manager** in the sidebar
3. Click **+ New Gem**

#### Step 2: Configure the Gem

- **Name**: Your assistant's name
- **Instructions**: Add your system prompt

#### Step 3: Add System Instructions (JSON works well for Gems)

```
You are an AI assistant configured with an AgentPlaybooks playbook.

## Your Configuration

At the start of each conversation, reference your playbook configuration.
For Gemini Gems, the JSON format works well:
https://agentplaybooks.ai/api/playbooks/YOUR_GUID

## Personas
[Copy the personas section from your playbook's markdown export]

## Skills
[Copy the skills section from your playbook's markdown export]

## Memory
Check for persistent context at: https://agentplaybooks.ai/api/playbooks/YOUR_GUID/memory

## Operating Guidelines
1. Always follow your defined persona(s)
2. Use your skills as capability guidelines
3. Reference memory for context about the user or project
4. Be consistent with your playbook's defined behavior
```

#### Step 4: Enable Extensions

If your playbook includes web-related skills:
- Enable **Google Search** extension
- Enable **Google Workspace** extension for document skills

#### Step 5: Model Settings

For reasoning-heavy playbooks:
- Gemini 2.0 Flash with Thinking is recommended for complex tasks
- Enable Deep Research for research-oriented playbooks

### Alternative: Google AI Studio

For more control, use [aistudio.google.com](https://aistudio.google.com):

1. Create a new prompt
2. Add your playbook content as the system instruction
3. Save as a tuned prompt for reuse

---

## xAI Grok

### Using Grok Projects (Grok 2/3)

#### Step 1: Create a Project

1. Go to [grok.x.ai](https://grok.x.ai) or access via X (Twitter)
2. Click **Projects** or **+** to create new
3. Name your project

#### Step 2: Add System Instructions

In the system prompt / project instructions:

```
You are an AI assistant operating according to an AgentPlaybooks configuration.

## Playbook URL
https://agentplaybooks.ai/api/playbooks/YOUR_GUID

## Instructions
1. Fetch and follow the playbook configuration at the start of each conversation
2. Apply the persona(s) defined in the playbook
3. Use skills as your capability guidelines
4. Reference memory for persistent context

## Persona
[Paste your persona content here]

## Skills
[List your skills here]

## Memory Context
Check: https://agentplaybooks.ai/api/playbooks/YOUR_GUID/memory
```

#### Step 3: Model Settings

For optimal results:
- Use **Grok 3** with **Thinking mode** enabled for complex reasoning
- Enable **DeepSearch** for research-oriented playbooks
- Consider **Big Brain** mode for analytical tasks

#### Step 4: Enable Tools

If available:
- Enable web search for playbooks requiring external data
- Enable image analysis for vision-related skills

---

## Claude Coworker (Desktop AI Agent)

Claude Coworker is Anthropic's autonomous AI agent that operates directly on macOS, with the ability to organize files, convert documents, and automate multi-step workflows.

### Method 1: MCP Integration (Recommended)

Configure Claude Coworker's MCP settings to connect to your playbook:

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

Coworker will have access to:
- **Tools** — All playbook skills as callable functions
- **Resources** — Personas, memory, and skill definitions
- **Persistent Memory** — Context that persists across sessions

### Method 2: Skills Folder Export

Export your playbook skills to a local folder:

```bash
curl -s "https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=anthropic" \
  | jq '.tools' > ~/Documents/CoworkerSkills/my_skills.json
```

Point Claude Coworker to this folder in the app settings.

### Method 3: System Prompt via Reference Document

1. Export as markdown:
   ```bash
   curl -s "https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=markdown" > ~/Documents/playbook.md
   ```

2. Add `playbook.md` to your designated Coworker folders as a reference.

### Sample Skills for Claude Coworker

```json
{
  "name": "organize_files",
  "description": "Organize files according to rules based on file type, date, and naming patterns",
  "input_schema": {
    "type": "object",
    "properties": {
      "source_folder": {"type": "string", "description": "Folder containing files to organize"},
      "rules": {"type": "string", "description": "Organization rules in natural language"}
    },
    "required": ["source_folder"]
  }
}
```

```json
{
  "name": "generate_report",
  "description": "Generate structured reports from data files with charts and executive summary",
  "input_schema": {
    "type": "object",
    "properties": {
      "data_sources": {"type": "array", "items": {"type": "string"}},
      "report_type": {"type": "string", "enum": ["weekly", "monthly", "quarterly"]}
    },
    "required": ["data_sources", "report_type"]
  }
}
```

---

## Clawdbot (Self-Hosted AI Assistant)

Clawdbot is an open-source, self-hosted AI assistant that bridges WhatsApp, Telegram, and Discord with Claude/ChatGPT/Gemini APIs. It features full MCP support and runs on local hardware for privacy.

### Step 1: Get Your MCP Endpoint

Every public playbook provides an MCP endpoint:

```
https://agentplaybooks.ai/api/mcp/YOUR_GUID
```

### Step 2: Configure Clawdbot

Add to your Clawdbot `config.yaml`:

```yaml
llm:
  provider: anthropic
  model: claude-sonnet-4-20250514

mcp_servers:
  - name: agent-playbook
    transport: http
    url: https://agentplaybooks.ai/api/mcp/YOUR_GUID
    description: My custom AI playbook

messaging:
  whatsapp:
    enabled: true
    phone_number: "+1234567890"
  telegram:
    enabled: true
    bot_token: "your_bot_token"
```

### Step 3: Enable Memory Write-back (Optional)

For bidirectional memory sync, add authentication:

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

### Step 4: Verify Connection

```bash
clawdbot status

# Output:
# MCP Servers:
#   ✓ agent-playbook (connected)
#     - Tools: 5 available
#     - Resources: 3 available
```

### What Clawdbot Inherits from Your Playbook

| Playbook Component | Clawdbot Feature |
|-------------------|------------------|
| Skills | Callable MCP tools |
| Personas | System prompt behavior |
| Memory | Shared state across platforms |

### Sample Clawdbot-Ready Playbook

```json
{
  "name": "Clawdbot Personal Assistant",
  "personas": [{
    "name": "Assistant",
    "system_prompt": "You are a helpful personal assistant. Be concise in messaging contexts."
  }],
  "skills": [
    {"name": "quick_search", "description": "Search web and return brief summary"},
    {"name": "set_reminder", "description": "Create reminder via current platform"},
    {"name": "manage_task", "description": "Add, complete, or list tasks"}
  ],
  "memory": {
    "preferred_language": "en",
    "notification_hours": "09:00-22:00"
  }
}
```

---

## Comparison Table: Web Interfaces

| Platform | Custom Instructions | Actions/Tools | Memory | Reasoning Mode |
|----------|-------------------|---------------|--------|----------------|
| ChatGPT (GPT) | ✅ System prompt | ✅ OpenAPI Actions | ✅ Via API | ✅ o1/o3 models |
| Claude | ✅ Projects | ❌ No actions | 📥 Read-only | ✅ Extended thinking |
| Gemini | ✅ Gems | ⚠️ Extensions only | 📥 Read-only | ✅ Thinking mode |
| Grok | ✅ Projects | ⚠️ Limited | 📥 Read-only | ✅ Thinking mode |
| Claude Coworker | ✅ Skills folder | ✅ MCP Tools | ✅ Via MCP | ✅ Built-in |
| Clawdbot | ✅ MCP config | ✅ MCP Tools | ✅ Bidirectional | ✅ Via backend LLM |

---

# Part 2: Programmatic / API Integrations

These are instructions for developers integrating playbooks into their applications.

---

## Claude Code (CLI Agent)

Claude Code is Anthropic's agentic CLI tool for coding tasks.

### Method 1: Using MCP Configuration

The cleanest integration is via MCP (Model Context Protocol).

#### Step 1: Configure MCP

Add to your `~/.claude/claude_desktop_config.json` (or `claude_code_config.json`):

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

#### Step 2: Verify Connection

```bash
claude mcp list
```

Your playbook tools and resources should appear.

#### Step 3: Use in Claude Code

When running Claude Code, it will automatically have access to:
- Your playbook's tools (from skills)
- Your playbook's resources (personas, memory, skills)

```bash
claude "Use my playbook configuration to review this code"
```

### Method 2: System Prompt File

Create a `.claude` or `CLAUDE.md` file in your project:

```markdown
# Project Configuration

## Playbook
This project uses AgentPlaybooks configuration from:
https://agentplaybooks.ai/api/playbooks/YOUR_GUID

## Persona
[Paste your persona here]

## Skills
[Paste your skills here]

## Guidelines
1. Follow the persona defined above
2. Use skills as your capability reference
3. Check memory at the URL above for context
```

### Method 3: Command-Line System Prompt

```bash
claude --system-prompt "$(curl -s https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=markdown)" "Your task here"
```

---

## OpenAI Responses API (GPT-5 / GPT-4.1)

The Responses API is OpenAI's new agentic API supporting tools and multi-turn conversations.

### Basic Integration

```python
import openai
import requests

# Fetch playbook configuration
playbook_url = "https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=anthropic"
playbook = requests.get(playbook_url).json()

client = openai.OpenAI()

# Create response with playbook context
response = client.responses.create(
    model="gpt-4.1",  # or gpt-5
    instructions=playbook["system_prompt"],
    input="Your user message here",
    tools=convert_anthropic_to_openai_tools(playbook["tools"]),
    # Enable reasoning for complex tasks
    reasoning={
        "effort": "high"  # low, medium, high
    }
)

print(response.output_text)
```

### Tool Conversion Helper

```python
def convert_anthropic_to_openai_tools(anthropic_tools):
    """Convert Anthropic tool format to OpenAI format"""
    openai_tools = []
    for tool in anthropic_tools:
        openai_tools.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"]
            }
        })
    return openai_tools
```

### With Memory Write-back

```python
import requests

def write_memory(guid, key, value, api_key):
    """Write a memory entry to the playbook"""
    response = requests.put(
        f"https://agentplaybooks.ai/api/playbooks/{guid}/memory/{key}",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        json={"value": value}
    )
    return response.json()

# Use in your agent loop
write_memory("YOUR_GUID", "last_task", {"summary": "Completed code review"}, "apb_live_xxx")
```

### Full Agentic Loop Example

```python
import openai
import requests
from typing import Generator

PLAYBOOK_GUID = "YOUR_GUID"
API_KEY = "apb_live_xxx"

def get_playbook():
    """Fetch current playbook configuration"""
    response = requests.get(
        f"https://agentplaybooks.ai/api/playbooks/{PLAYBOOK_GUID}?format=anthropic"
    )
    return response.json()

def run_agent(user_input: str) -> Generator[str, None, None]:
    """Run the agent with playbook configuration"""
    playbook = get_playbook()
    client = openai.OpenAI()
    
    response = client.responses.create(
        model="gpt-4.1",
        instructions=playbook["system_prompt"],
        input=user_input,
        tools=convert_anthropic_to_openai_tools(playbook.get("tools", [])),
        reasoning={"effort": "high"},
        stream=True
    )
    
    for event in response:
        if event.type == "response.output_text.delta":
            yield event.delta

# Usage
for chunk in run_agent("Review this code for security issues"):
    print(chunk, end="", flush=True)
```

---

## Anthropic Claude API

### Using Messages API with Tools

```python
import anthropic
import requests

# Fetch playbook in Anthropic format
playbook_url = "https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=anthropic"
playbook = requests.get(playbook_url).json()

client = anthropic.Anthropic()

message = client.messages.create(
    model="claude-sonnet-4-20250514",  # or claude-opus-4
    max_tokens=8192,
    system=playbook["system_prompt"],
    tools=playbook["tools"],
    messages=[
        {"role": "user", "content": "Your message here"}
    ]
)

print(message.content)
```

### With Extended Thinking

For complex reasoning tasks:

```python
message = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=16000,
    thinking={
        "type": "enabled",
        "budget_tokens": 10000  # Adjust based on complexity
    },
    system=playbook["system_prompt"],
    tools=playbook["tools"],
    messages=[
        {"role": "user", "content": "Analyze this complex problem..."}
    ]
)

# Access thinking process
for block in message.content:
    if block.type == "thinking":
        print("Thinking:", block.thinking)
    elif block.type == "text":
        print("Response:", block.text)
```

### Agentic Loop with Tool Execution

```python
import anthropic
import requests

PLAYBOOK_GUID = "YOUR_GUID"
API_KEY = "apb_live_xxx"

def run_claude_agent(task: str):
    """Run Claude agent with playbook and tool handling"""
    playbook_url = f"https://agentplaybooks.ai/api/playbooks/{PLAYBOOK_GUID}?format=anthropic"
    playbook = requests.get(playbook_url).json()
    
    client = anthropic.Anthropic()
    messages = [{"role": "user", "content": task}]
    
    while True:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=8192,
            system=playbook["system_prompt"],
            tools=playbook.get("tools", []),
            messages=messages
        )
        
        # Check for tool use
        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
        
        if not tool_use_blocks:
            # No more tools, return final response
            return "".join(b.text for b in response.content if b.type == "text")
        
        # Handle tool calls
        messages.append({"role": "assistant", "content": response.content})
        
        tool_results = []
        for tool_use in tool_use_blocks:
            result = execute_tool(tool_use.name, tool_use.input)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": str(result)
            })
        
        messages.append({"role": "user", "content": tool_results})

def execute_tool(name: str, input_data: dict):
    """Execute a tool - implement based on your playbook's skills"""
    # Example: memory operations
    if name == "read_memory":
        return requests.get(
            f"https://agentplaybooks.ai/api/playbooks/{PLAYBOOK_GUID}/memory"
        ).json()
    elif name == "write_memory":
        return requests.put(
            f"https://agentplaybooks.ai/api/playbooks/{PLAYBOOK_GUID}/memory/{input_data['key']}",
            headers={"Authorization": f"Bearer {API_KEY}"},
            json={"value": input_data["value"]}
        ).json()
    else:
        return {"error": f"Unknown tool: {name}"}
```

---

## xAI Grok API

### Basic Integration

```python
import requests

GROK_API_KEY = "your_grok_api_key"
PLAYBOOK_GUID = "YOUR_GUID"

# Fetch playbook
playbook = requests.get(
    f"https://agentplaybooks.ai/api/playbooks/{PLAYBOOK_GUID}?format=markdown"
).text

# Call Grok API
response = requests.post(
    "https://api.x.ai/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {GROK_API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "model": "grok-3",  # or grok-3-thinking
        "messages": [
            {
                "role": "system",
                "content": playbook
            },
            {
                "role": "user",
                "content": "Your message here"
            }
        ],
        "temperature": 0.7
    }
)

print(response.json()["choices"][0]["message"]["content"])
```

### With Thinking Mode

```python
response = requests.post(
    "https://api.x.ai/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {GROK_API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "model": "grok-3-thinking",  # Enable thinking
        "messages": [
            {"role": "system", "content": playbook},
            {"role": "user", "content": "Analyze this complex problem..."}
        ],
        "reasoning_effort": "high"  # low, medium, high
    }
)
```

---

## Google Gemini API

### Basic Integration

```python
import google.generativeai as genai
import requests

genai.configure(api_key="YOUR_GEMINI_API_KEY")

# Fetch playbook
playbook = requests.get(
    "https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=markdown"
).text

model = genai.GenerativeModel(
    model_name="gemini-2.0-flash-thinking-exp",  # With thinking
    system_instruction=playbook
)

response = model.generate_content("Your message here")
print(response.text)
```

### With Function Calling

```python
import google.generativeai as genai
import requests

# Fetch playbook with tools
playbook = requests.get(
    "https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=anthropic"
).json()

# Convert to Gemini format
def convert_to_gemini_tools(anthropic_tools):
    tools = []
    for tool in anthropic_tools:
        tools.append({
            "name": tool["name"],
            "description": tool["description"],
            "parameters": tool["input_schema"]
        })
    return tools

model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    system_instruction=playbook["system_prompt"],
    tools=convert_to_gemini_tools(playbook.get("tools", []))
)

chat = model.start_chat()
response = chat.send_message("Your message here")
print(response.text)
```

---

## Generic Integration Template

For any LLM that supports system prompts:

```python
import requests
from typing import Any

class PlaybookAgent:
    def __init__(self, playbook_guid: str, api_key: str = None):
        self.guid = playbook_guid
        self.api_key = api_key
        self.base_url = "https://agentplaybooks.ai/api"
    
    def get_playbook(self, format: str = "anthropic") -> dict:
        """Fetch playbook configuration"""
        response = requests.get(
            f"{self.base_url}/playbooks/{self.guid}?format={format}"
        )
        return response.json() if format != "markdown" else {"content": response.text}
    
    def get_system_prompt(self) -> str:
        """Get just the system prompt"""
        playbook = self.get_playbook("anthropic")
        return playbook.get("system_prompt", "")
    
    def get_tools(self) -> list:
        """Get tools in Anthropic format"""
        playbook = self.get_playbook("anthropic")
        return playbook.get("tools", [])
    
    def get_memory(self, key: str = None) -> Any:
        """Read memory entries"""
        url = f"{self.base_url}/playbooks/{self.guid}/memory"
        if key:
            url += f"?key={key}"
        return requests.get(url).json()
    
    def write_memory(self, key: str, value: Any) -> dict:
        """Write a memory entry (requires API key)"""
        if not self.api_key:
            raise ValueError("API key required for write operations")
        
        return requests.put(
            f"{self.base_url}/playbooks/{self.guid}/memory/{key}",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            },
            json={"value": value}
        ).json()
    
    def delete_memory(self, key: str) -> dict:
        """Delete a memory entry (requires API key)"""
        if not self.api_key:
            raise ValueError("API key required for delete operations")
        
        return requests.delete(
            f"{self.base_url}/playbooks/{self.guid}/memory/{key}",
            headers={"Authorization": f"Bearer {self.api_key}"}
        ).json()


# Usage example
agent = PlaybookAgent("YOUR_GUID", "apb_live_xxx")

# Get system prompt for any LLM
system_prompt = agent.get_system_prompt()

# Get tools (convert format as needed for your LLM)
tools = agent.get_tools()

# Read/write memory
memories = agent.get_memory()
agent.write_memory("last_session", {"task": "code review", "completed": True})
```

---

## Comparison Table: API Integrations

| Platform | SDK/API | Tools Support | Thinking/Reasoning | Best Format |
|----------|---------|---------------|-------------------|-------------|
| OpenAI Responses | `openai` | ✅ Functions | ✅ reasoning.effort | `anthropic` |
| Anthropic Claude | `anthropic` | ✅ Tools | ✅ thinking.budget | `anthropic` |
| Google Gemini | `google-generativeai` | ✅ Functions | ✅ thinking models | `anthropic` |
| xAI Grok | REST API | ✅ Functions | ✅ reasoning_effort | `markdown` |
| Claude Code | MCP | ✅ MCP Tools | ✅ Built-in | `mcp` |

---

## Recommended Settings by Use Case

### For Complex Reasoning Tasks

| Platform | Model | Settings |
|----------|-------|----------|
| OpenAI | gpt-4.1 / o3 | `reasoning.effort: "high"` |
| Anthropic | claude-opus-4 | `thinking.budget_tokens: 10000+` |
| Google | gemini-2.0-flash-thinking | Default thinking enabled |
| xAI | grok-3-thinking | `reasoning_effort: "high"` |

### For Fast, Simple Tasks

| Platform | Model | Settings |
|----------|-------|----------|
| OpenAI | gpt-4.1-mini | `reasoning.effort: "low"` |
| Anthropic | claude-sonnet-4 | No thinking |
| Google | gemini-2.0-flash | Default |
| xAI | grok-3 | Default |

### For Agentic Workflows

| Platform | Model | Recommended Setup |
|----------|-------|-------------------|
| OpenAI | gpt-4.1 | Responses API with tools |
| Anthropic | claude-sonnet-4 | Messages API with tools loop |
| Claude Code | claude-sonnet-4 | MCP integration |
| Google | gemini-2.0-flash | Function calling |

---

## Troubleshooting

### Common Issues

**"Playbook not found" error**
- Ensure your playbook is set to **Public**
- Verify the GUID is correct
- Check the URL format

**Tools not working**
- Verify skills are properly defined in your playbook
- Check the format parameter matches your platform's expectations
- Test with `?format=anthropic` for most platforms

**Memory write fails**
- Ensure you have an API key with `memory:write` permission
- Check the Authorization header format: `Bearer apb_live_xxx`
- Verify the API key is active and not expired

**Rate limiting**
- Agent writes: 60 requests/minute/API key
- Public reads: 100 requests/minute/IP
- Consider caching playbook configuration

### Getting Help

- [API Reference](./api-reference.md) - Full endpoint documentation
- [MCP Integration](./mcp-integration.md) - Model Context Protocol details
- [GitHub Issues](https://github.com/matebenyovszky/agentplaybooks/issues) - Report bugs



