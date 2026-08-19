# AgentPlaybooks Roadmap

This document outlines the development roadmap for AgentPlaybooks — the open source, portable operating environment for AI agents (and, in time, physical robots).

## Legend

| Status | Meaning |
|--------|---------|
| ✅ | Completed |
| 🚧 | In Progress |
| 📋 | Planned |
| 💡 | Under Consideration |

---

## Phase 1: Foundation (Current)

### Core Platform ✅

- [x] **Playbook CRUD** - Create, read, update, delete playbooks
- [x] **Personas** - System prompts that define AI personality
- [x] **Skills** - Structured capabilities (Anthropic format)
- [x] **MCP Servers** - Model Context Protocol configurations
- [x] **Memory** - Key-value storage for AI agents
- [x] **Canvas** - Working documents for ongoing context
- [x] **Multi-format Export** - JSON, OpenAPI, MCP, Markdown, Anthropic

### Authentication & Security ✅

- [x] **Supabase Auth** - OAuth (Google, GitHub), Email/Password
- [x] **API Keys** - Bearer token authentication for agents
- [x] **Row Level Security** - Database-level access control
- [x] **Public/Private Playbooks** - Visibility control

### Public Features ✅

- [x] **Community library** - Browse and discover public playbooks
- [x] **Star System** - Star favorite playbooks
- [x] **Search** - Find playbooks by name/description
- [x] **Demo Playbook** - Try before signup

### Platform Integrations ✅

- [x] **ChatGPT Custom GPTs** - OpenAPI integration
- [x] **Claude** - Direct system prompt + MCP
- [x] **Gemini** - System instruction integration
- [x] **Grok** - System prompt support
- [x] **Local LLMs** - Ollama, LM Studio compatibility
- [x] **Cursor/Windsurf** - MCP server integration

---

## Phase 2: Enhanced Security & Enterprise Ready 🚧

### API Security Enhancements 📋

- [ ] **Read API Authentication** - Optional auth for read endpoints
  - Configurable per-playbook (public read vs. authenticated read)
  - Useful for sensitive playbooks that shouldn't be publicly accessible
  
- [ ] **API Key Auto-Revocation** - Automatic expiration
  - Set expiration time when creating API key
  - Background job to clean up expired keys
  - Notification before expiration (email/webhook)
  
- [ ] **Rate Limiting** - Prevent abuse
  - Per-key rate limits
  - Configurable limits per plan tier

- [ ] **Audit Logging** - Track all API access
  - Who accessed what, when
  - Export logs for compliance

- [ ] **Secrets for local stdio MCP servers** - The last gap in "pull and it works"
  - A locally spawned MCP server (`npx some-mcp` with `env.API_KEY`) runs on the
    user's machine, so the hosted `use_secret` proxy cannot help it
  - `apb secrets run -- <command>` already injects values into one child process
    without writing to disk; the remaining work is having a local agent client
    launch its stdio servers through that path
  - Deliberately not solved by writing a `.env` file: a credential on disk is the
    thing we are trying to avoid

- [ ] **One credential, one store** - Unify federation secrets with the vault (medium term)
  - Today `transport_config.auth.token_secret` resolves only from the per-server
    `mcp_server_secrets` payload, so the same token can be needed in two places
  - Plan: keep the per-server payload authoritative, then fall back to the
    playbook vault by name — no migration, nothing existing breaks
  - Open question to settle first: a key with `secrets:read` can proxy vault
    secrets, so federation credentials moving into the vault must either be
    marked non-proxyable or pinned with `allowed_hosts`
  - ✅ Done as a first step: `mcp_server_secrets` now matches the vault's crypto
    (HKDF key per server, ciphertext bound to its server id, `v2:` prefix with
    the previous format still readable), so the two stores are no longer
    unequally protected while the merge is designed

### Code Quality 📋

- [ ] **Open Source Cleanup**
  - Remove hardcoded values
  - Environment variable documentation
  - Docker/docker-compose setup
  - Contributing guidelines (CONTRIBUTING.md)
  - Code of conduct
  - ~~License review (MIT)~~ — done, relicensed to MIT
  - Security policy (SECURITY.md)
  - Issue templates
  - PR templates

---

## Phase 3: Intelligence Layer 📋

### RAG (Retrieval-Augmented Generation) 💡

- [ ] **Document Attachments**
  - Upload PDFs, docs, markdown files to playbooks
  - Automatic text extraction and chunking
  
- [ ] **Vector Storage**
  - Embed documents using OpenAI/local embeddings
  - Store in Supabase pgvector or dedicated vector DB
  
- [ ] **Semantic Search**
  - Query documents by meaning, not just keywords
  - Return relevant chunks with context
  
- [ ] **RAG API Endpoint**
  - `POST /api/playbooks/:guid/query`
  - Returns relevant context for agent queries
  - Configurable similarity threshold

### Memory Enhancements 📋

- [ ] **Structured Memory Types**
  - Facts (persistent knowledge)
  - Episodes (conversation history)
  - Preferences (user settings)
  
- [ ] **Memory Namespaces**
  - Separate memory per user/session
  - Cross-playbook memory sharing

---

## Phase 4: Enterprise Features 📋

### Agent Gateway 💡

- [ ] **Centralized MCP/Skill Proxy**
  - Single endpoint for all agent capabilities
  - Load balancing across MCP servers
  - Caching layer for performance

### MCP Proxy & API Gateway 📋

> **Why this matters:** MCP protocol can be token-inefficient for simple operations. Sometimes a plain webhook, curl command, or standard REST/OpenAPI call is more efficient and costs fewer tokens. We want to support the best tool for each job.

- [x] **External MCP Runtime Proxy**
  - Include configured external tools and resources in `tools/list` and `resources/list`
  - Route `tools/call` and `resources/read` to the configured upstream MCP server
  - Support upstream authentication and secrets without exposing credentials
  - Report upstream availability, timeouts, and structured errors
  - Add integration tests with HTTP/SSE MCP servers such as research providers

- [ ] **Multi-Protocol MCP Server Exposure**
  - Expose MCP servers via OpenAPI/REST endpoints
  - Convert MCP tools to OpenAI function calling format
  - HTTP/SSE transport adapter for stdio-based MCP servers
  - Unified authentication layer for proxied MCP calls
  
- [ ] **MCP Aggregation**
  - Combine multiple MCP servers into single endpoint
  - Tool namespace management (avoid conflicts)
  - Selective tool exposure per playbook
  
- [ ] **MCP → OpenAPI Bridge**
  - Auto-generate OpenAPI specs from MCP server definitions
  - Enable ChatGPT Custom GPTs to use any MCP server
  - Swagger UI for MCP tool testing

- [ ] **Universal API Proxy**
  - Define skills as simple REST/webhook calls (token-efficient alternative to MCP)
  - Curl-style skill definitions in playbooks
  - OpenAPI spec import → auto-generate skills
  - GraphQL endpoint support
  - Response transformation and caching

### Dynamic Canvas 💡

- [ ] **Visual Agent Workflows**
  - Drag-and-drop skill composition
  - Real-time collaboration
  - Version history with diff view

### Workspaces 💡

- [x] **Playbook Collaboration MVP**
  - One-time editor invitations and shared playbooks
  - Owner-only secrets, API keys, visibility, sharing, and deletion
- [ ] **Team Workspaces**
  - Shared playbook collections
  - Role-based access (admin, editor, viewer)
  - Team billing

### Sandbox Apps 💡

- [ ] **Code Execution Environments**
  - Safe sandboxed execution for skills
  - Python, JavaScript, shell support
  - Resource limits and timeouts

### Playbook Runner 💡

- [ ] **Execute on Your Own AI**
  - Test playbooks with your API keys
  - Compare outputs across models
  - A/B testing for personas

### Visual Agents 💡

- [ ] **Graphical Agent Representation**
  - Visualize agent decision trees
  - Monitor agent state in real-time
  - Debug agent behavior

### Enterprise Apps 💡

- [ ] **Build & Maintain at Scale**
  - Custom branding
  - SSO (SAML, OIDC)
  - SLA guarantees
  - Dedicated support

---

## Phase 5: Ecosystem 💡

### Marketplace Monetization

- [ ] **Paid Skills/Playbooks**
  - Creators can sell premium content
  - Revenue sharing model
  - Stripe integration

### Plugin System

- [ ] **Extensible Architecture**
  - Custom skill types
  - Third-party integrations
  - Webhook automation

### Mobile Apps

- [ ] **iOS/Android Apps**
  - Manage playbooks on the go
  - Push notifications for memory updates
  - Voice input for quick edits

### CLI Tool

- [ ] **Command Line Interface**
  - `agentplaybooks init` - Create new playbook
  - `agentplaybooks push` - Deploy changes
  - `agentplaybooks pull` - Sync local copy
  - CI/CD integration

---

## Contributing

We welcome contributions! See our [Developer Guide](./developer-guide.md) for how to get started.

### Priority Areas

1. **Security enhancements** - API key management, rate limiting
2. **Documentation** - More examples, tutorials, video content
3. **Platform integrations** - New AI platforms and tools
4. **RAG implementation** - Document storage and retrieval

### How to Propose Features

1. Open a GitHub Issue with `[Feature Request]` prefix
2. Describe the use case and proposed solution
3. Discuss with maintainers
4. Submit a PR if approved

---

## Timeline

| Phase | Target | Status |
|-------|--------|--------|
| Phase 1: Foundation | Q4 2025 | ✅ Complete |
| Phase 2: Security & Enterprise | Q1 2026 | 🚧 In Progress |
| Phase 3: Intelligence Layer | Q2 2026 | 📋 Planned |
| Phase 4: Enterprise Features | Q3-Q4 2026 | 💡 Exploring |
| Phase 5: Ecosystem | 2027+ | 💡 Future |

---

## Feedback

Have ideas? Found something missing?

- 💬 [GitHub Discussions](https://github.com/matebenyovszky/agentplaybooks/discussions)
- 🐛 [Report Issues](https://github.com/matebenyovszky/agentplaybooks/issues)
- 📧 [Email](mailto:hello@agentplaybooks.ai)

---

*Last updated: January 2026*
