# AgentPlaybooks Documentation

Welcome to the AgentPlaybooks documentation.

## Quick Links

### Getting Started
- [What is a Playbook?](./playbooks.md) - Understanding the core concept
- [Getting Started](./getting-started.md) - First steps with AgentPlaybooks
- [Platform Integrations](./platform-integrations.md) - Connect to ChatGPT, Claude, Gemini, Grok & more
- [Cross-platform Agent Backups](./portable-agent-backups.md) - Migrate and restore complete portable agent configuration
- [Hermes Memory Provider](./hermes-memory.md) - Native memory setup, profile boundaries, and shared knowledge
- [Team Collaboration](./team-collaboration.md) - Share playbooks securely with human editors
- [Roadmap](./ROADMAP.md) - Development roadmap and future plans

### Core Concepts
- [Playbooks](./playbooks.md) - Complete agent operating environment
- [Skills](./skills.md) - Structured capability definitions
- [Memory](./memory.md) - Persistent key-value storage
- [MCP Integration](./mcp-integration.md) - Model Context Protocol guide
- [Federated MCP & OpenAPI Tools](./mcp-federation.md) - Secure upstream tools, OAuth, secrets, and audit logs

### Reference
- [API Reference](./api-reference.md) - Complete API documentation
- [Management API & MCP](./management-api.md) - AI-driven playbook management
- [Developer Guide](./developer-guide.md) - Contributing and development
- [Self-Hosting](./self-hosting.md) - Deploy your own instance
- [Architecture](./architecture.md) - System design and components

## What is AgentPlaybooks?

AgentPlaybooks is a vendor-neutral, platform-independent home for AI agents, including Gemini Gems (Gem agents). It provides:

- **Personas** - Reusable system prompts that work across any AI platform
- **Skills** - Structured capabilities in Anthropic skill format
- **MCP Servers** - Model Context Protocol configurations
- **Memory** - Persistent key-value storage accessible by AI agents
- **Team Collaboration** - Account-bound editor access without sharing API keys
- **Multi-Format Export** - JSON, OpenAPI, MCP protocol, Markdown

## Why AgentPlaybooks?

When you use multiple AI platforms (ChatGPT, Claude, custom agents), you often need to:
- Re-create the same system prompts
- Re-configure the same tools and capabilities
- Lose context when switching platforms

AgentPlaybooks solves this with a portable source of truth that any compatible AI can access. Your agents, skills, tools, and memory remain yours when you switch platforms, work across several platforms at once, or self-host the service.

## Contributing

This documentation is both:
- Displayed on [GitHub](https://github.com/matebenyovszky/agentplaybooks) as standard Markdown
- Rendered on our website at [apbks.com/docs](https://apbks.com/docs)

This documentation is open source. Found an issue? [Edit on GitHub](https://github.com/matebenyovszky/agentplaybooks/tree/main/docs).
