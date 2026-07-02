---
title: Using Nous Hermes with AgentPlaybooks
description: Learn how to connect the powerful open-source Nous Hermes agent model to your Playbooks using MCP and OpenAPI.
date: 2026-06-15
author: Mate Benyovszky
---

# Using Nous Hermes with AgentPlaybooks

Open-source models have made incredible leaps in tool-calling and reasoning capabilities. **Nous Hermes** (such as Hermes 3) is specifically fine-tuned for advanced agentic workflows and function calling, making it an ideal companion for AgentPlaybooks. 

In this guide, we will walk you through how to use the Hermes agent model with your Playbook to give it a persistent memory, a persona, and access to secure MCP tools.

## 🤖 Why Hermes?

The Hermes family of models excels at:
- **Following complex system prompts**: It perfectly adopts your Playbook's Persona.
- **Function calling**: It natively understands JSON schemas and can reliably trigger your Playbook's Skills and MCP Servers.
- **Autonomy**: It can execute multi-step plans without hallucinating tool inputs.

By combining Hermes with AgentPlaybooks, you break the model out of its isolated, stateless chat box and give it a real operating environment.

## 🔌 Connection Methods

Because Hermes is often run locally (via Ollama or LM Studio) or accessed via cloud providers (like OpenRouter), you have two primary ways to connect it to AgentPlaybooks.

### Method 1: The Model Context Protocol (MCP)

If you are using an MCP-compatible client to run Hermes, you can connect your Playbook directly as an MCP Server.

1. Create a **Playbook API Key** in your AgentPlaybooks dashboard.
2. In your local MCP client configuration, add your Playbook's endpoint:
   ```json
   "mcpServers": {
     "my-playbook": {
       "command": "npx",
       "args": ["-y", "@agentplaybooks/mcp-client", "https://apbks.com/api/mcp/YOUR_PLAYBOOK_GUID"],
       "env": {
         "PLAYBOOK_API_KEY": "apb_live_xxxxxxxxxxx"
       }
     }
   }
   ```
3. Boot up your client with the Hermes model selected. Hermes will immediately read the provided `resources` (your Playbook's Canvas and Memory) and understand the available `tools` (your Skills and external integrations).

### Method 2: OpenAPI Function Calling

If you are writing a custom Python or Node.js script to orchestrate Hermes (e.g., using `llama-cpp-python` or the OpenAI-compatible OpenRouter API), you can fetch the OpenAPI spec of your Playbook dynamically.

```bash
curl "https://apbks.com/api/playbooks/YOUR_PLAYBOOK_GUID?format=openapi"
```

1. Parse this OpenAPI JSON into standard OpenAI function definitions.
2. Pass these functions to your Hermes model in the `tools` array of your chat completion request.
3. Include your Playbook's Persona as the `system` message.
4. When Hermes decides to call a tool, your script executes the HTTP request against the AgentPlaybooks API using your API Key.

## 🛡️ Secure Execution

Whether you use MCP or OpenAPI, Hermes inherits all the security features of AgentPlaybooks. If Hermes needs to interact with an external API (like GitHub or a database), it can use the **Secrets Vault**. 

Hermes will never see your raw API keys. Instead, it will use the `use_secret` tool to ask the Playbook to execute the request on its behalf, ensuring zero-exposure credential management.

## Next Steps

Combine Hermes with our [Platform Integrations](/docs/platform-integrations) to see how you can build a truly autonomous, open-source agent workflow today!
