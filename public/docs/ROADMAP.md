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

## Phase 2: Security, Enterprise Readiness & Distribution 🚧

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
  - Done for the two surfaces that handle credentials: federated MCP calls and
    the secrets vault (`secret.*`), both in one `audit_logs` table read at
    `GET /api/playbooks/:guid/audit`. Skills, memory and canvas writes are still
    unrecorded — they add an `operation` namespace, not a table — and there is
    no export or retention policy yet.

- [ ] **Secrets for local stdio MCP servers** - The last gap in "pull and it works"
  - A locally spawned MCP server (`npx some-mcp` with `env.API_KEY`) runs on the
    user's machine, so the hosted `use_secret` proxy cannot help it
  - `apb secrets run -- <command>` already injects values into one child process
    without writing to disk; the remaining work is having a local agent client
    launch its stdio servers through that path
  - Deliberately not solved by writing a `.env` file: a credential on disk is the
    thing we are trying to avoid

- [x] **One credential, one store** - Federation resolves from the vault
  - `transport_config.auth.token_secret` (and `api_key_secret`, `client_secret`)
    resolve against the playbook vault by exact name — store a credential once,
    reference it everywhere. The server editor autocompletes vault names and
    shows where each reference resolves from.
  - Vault use by federation is proxy-style (injected server-side, never
    returned), so the reveal flag is not bypassed; a secret's `allowed_hosts`,
    when set, is enforced against the server's destinations
  - `mcp_server_secrets` is gone. It was first raised to the vault's crypto, then
    removed outright: a second store meant the credentials most worth stealing
    sat in the weaker box, without the rotation, expiry, usage accounting, and
    audit trail the vault already had.

### Discoverability: SEO & AI Search 🚧

> **Why this matters:** this tool is found in two ways — a developer searching a
> specific problem ("sync claude skills to cursor"), and someone asking a model.
> Those audiences want different things from the same pages. A crawler wants
> stable URLs and unambiguous facts; a model wants readable markdown and
> explicit contrast. Most of the work below serves both, but the ordering
> differs depending on which you optimise for.

Shipped as a first pass:

- [x] **Per-route metadata and canonicals** — every route declares its own
  title, description and canonical URL. Previously the root layout pinned
  `alternates.canonical` to the homepage, and the docs routes exported no
  `generateMetadata` at all. Because Next.js shallow-merges metadata, every
  `/docs/*` and `/blog/*` page emitted an identical title and a canonical
  pointing at the front page — asking search engines to treat the entire
  documentation corpus as duplicates of the homepage.
- [x] **One canonical origin** — `src/lib/site-url.ts`. `agentplaybooks.ai` is
  the brand and therefore the canonical host; `apbks.com` remains useful as a
  short link domain and consolidates onto it, because canonical tags are built
  from the constant rather than from the request host.
- [x] **Complete sitemap, current `robots.ts`** — `/blog` and the missing doc
  slugs added; paths that `robots.txt` disallows removed, since listing them
  sent contradictory signals. Retired Anthropic crawler names replaced with
  `ClaudeBot` / `Claude-User` / `Claude-SearchBot`, and `OAI-SearchBot` added.

Open, in rough order of value:

- [ ] **Locale-prefixed routing** — the highest-value item, because the content
  already exists and simply cannot be reached. Locale comes from the
  `NEXT_LOCALE` cookie, so every language lives at the same URL and a crawler
  (arriving without a cookie) only ever sees English. The hu/de/es docs and blog
  posts have no address to rank at, and the sitemap's hreflang entries are inert
  because they all point at one URL. Prefixes like `/hu/docs/cli` turn 20
  documents into 80 indexable URLs and make hreflang meaningful. The cost is a
  routing change — `src/app/[locale]/`, middleware, and a link-based language
  switcher replacing the cookie-based one — which makes this the most expensive
  item as well as the most valuable.

- [ ] **Server-rendered marketplace with a URL per skill** — `/explore` is a
  client component that fetches in `useEffect`, so a crawler sees an empty shell
  and none of the marketplace is indexable. This is the only content asset that
  grows without anyone writing prose: every public skill is a page somebody
  searches for. `src/lib/skill-markdown.ts` and the `/.well-known/skills/` route
  already have the data-fetch shape; what is missing is a server-rendered
  listing plus `/skills/<name>` detail pages with their own metadata, in the
  sitemap.

- [ ] **Comparison pages (`/compare/...`)** — "X vs Y" and "X alternative" are
  the highest-intent, lowest-competition queries for a new developer tool, and
  answer engines cite comparison pages disproportionately because they are
  structured and explicitly contrastive. [Obsidian and
  AgentPlaybooks](./obsidian.md) is the first one, but it is buried in the docs;
  a `/compare` hub with short paths would rank better. Candidates: raw dotfiles,
  Claude Code plugin marketplaces, Cursor rules alone, Notion, prompt
  registries, the MCP registry. Non-negotiable rule: every page must contain
  visible rows where the alternative wins. Without them both readers and models
  discount the rest of the page.

- [ ] **JSON-LD structured data** — there is none today.
  `SoftwareApplication` and `Organization` (with `sameAs` to GitHub) so a model
  receives the category, licence and brand identity as fact rather than
  inference; `TechArticle` on docs and `BlogPosting` on posts; `BreadcrumbList`
  so results read `agentplaybooks.ai › Docs › CLI` instead of a bare URL.
  `FAQPage` is nearly free — the landing page's "Sound Familiar?" section is
  already question/answer pairs under `landing.useCases.cases.*`. This is the
  highest signal-to-noise channel an AI crawler has; everything else it must
  infer from prose.

- [ ] **`llms.txt` and raw markdown endpoints** — serve `/docs/<slug>.md` as
  `text/markdown` so AI clients read the source instead of parsing a styled
  shell, plus an `/llms.txt` index. Cheap here because the docs already *are*
  markdown files and `serveWellKnownSkills` already implements exactly this
  shape (markdown content type, cache headers, open CORS). Worth stating the
  split honestly: the raw `.md` endpoints have clear immediate value, while
  `llms.txt` is a convention with real adoption among developer docs but no
  commitment from any major model vendor — treat it as cheap insurance and a
  signal to developers evaluating the project, not a guaranteed traffic channel.

### Obsidian Plugin 📋

> **Why this matters:** a large share of the people who already keep a
> `Prompts/` or `Skills/` folder keep it in an Obsidian vault, and the community
> plugin directory reaches precisely that audience. Both sides speak markdown
> with frontmatter, so this is unusually cheap for the distribution it buys.
> The positioning is set out in [Obsidian and
> AgentPlaybooks](./obsidian.md): Obsidian is optimised for humans and this
> platform for machines, so the vault stays the authoring surface and is never
> asked to become a runtime.

- [ ] **Two-way sync for a `Skills/` folder** — a vault folder laid out as
  `<name>/SKILL.md` is already exactly what `apb push` reads, so the plugin's
  job is to make that a button instead of a terminal. Conflicts must behave the
  way the CLI does: same-named definitions with differing content are reported
  and skipped, never silently overwritten.
- [ ] **"Publish this note as a skill" command** — the note's frontmatter
  becomes the skill's `name` and `description`, with validation mirroring
  `apb doctor` so a note that is not a valid Agent Skill explains why before
  anything is uploaded.
- [ ] **Pull canvas documents into the vault** — an agent's finished work
  document arrives as an ordinary note, so deliverables are read where the
  human reads everything else.
- [ ] **Install from `/.well-known/skills/`** — already served with open CORS
  and no credential, so the plugin can browse and install public skills without
  an account. This is the one piece that needs no new backend work.
- [ ] **Refuse to store secrets in the vault** — the plugin must not put a
  credential in its own settings. That is exactly the failure mode a
  vault-based AI setup falls into: plaintext in
  `.obsidian/plugins/<name>/data.json`, then into Sync, then into git history if
  the vault is versioned. The vault holds the *reference*; the value stays in
  the encrypted store. This constraint is the sharpest single reason the
  platform exists, so the plugin cannot be the thing that violates it.

### Discoverability: SEO & AI Search 🚧

> **Why this matters:** this tool is found in two ways — a developer searching a
> specific problem ("sync claude skills to cursor"), and someone asking a model.
> Those audiences want different things from the same pages. A crawler wants
> stable URLs and unambiguous facts; a model wants readable markdown and
> explicit contrast. Most of the work below serves both, but the ordering
> differs depending on which you optimise for.

Shipped as a first pass:

- [x] **Per-route metadata and canonicals** — every route declares its own
  title, description and canonical URL. Previously the root layout pinned
  `alternates.canonical` to the homepage, and the docs routes exported no
  `generateMetadata` at all. Because Next.js shallow-merges metadata, every
  `/docs/*` and `/blog/*` page emitted an identical title and a canonical
  pointing at the front page — asking search engines to treat the entire
  documentation corpus as duplicates of the homepage.
- [x] **One canonical origin** — `src/lib/site-url.ts`. `agentplaybooks.ai` is
  the brand and therefore the canonical host; `apbks.com` remains useful as a
  short link domain and consolidates onto it, because canonical tags are built
  from the constant rather than from the request host.
- [x] **Complete sitemap, current `robots.ts`** — `/blog` and the missing doc
  slugs added; paths that `robots.txt` disallows removed, since listing them
  sent contradictory signals. Retired Anthropic crawler names replaced with
  `ClaudeBot` / `Claude-User` / `Claude-SearchBot`, and `OAI-SearchBot` added.

Open, in rough order of value:

- [ ] **Locale-prefixed routing** — the highest-value item, because the content
  already exists and simply cannot be reached. Locale comes from the
  `NEXT_LOCALE` cookie, so every language lives at the same URL and a crawler
  (arriving without a cookie) only ever sees English. The hu/de/es docs and blog
  posts have no address to rank at, and the sitemap's hreflang entries are inert
  because they all point at one URL. Prefixes like `/hu/docs/cli` turn 20
  documents into 80 indexable URLs and make hreflang meaningful. The cost is a
  routing change — `src/app/[locale]/`, middleware, and a link-based language
  switcher replacing the cookie-based one — which makes this the most expensive
  item as well as the most valuable.

- [ ] **Server-rendered marketplace with a URL per skill** — `/explore` is a
  client component that fetches in `useEffect`, so a crawler sees an empty shell
  and none of the marketplace is indexable. This is the only content asset that
  grows without anyone writing prose: every public skill is a page somebody
  searches for. `src/lib/skill-markdown.ts` and the `/.well-known/skills/` route
  already have the data-fetch shape; what is missing is a server-rendered
  listing plus `/skills/<name>` detail pages with their own metadata, in the
  sitemap.

- [ ] **Comparison pages (`/compare/...`)** — "X vs Y" and "X alternative" are
  the highest-intent, lowest-competition queries for a new developer tool, and
  answer engines cite comparison pages disproportionately because they are
  structured and explicitly contrastive. [Obsidian and
  AgentPlaybooks](./obsidian.md) is the first one, but it is buried in the docs;
  a `/compare` hub with short paths would rank better. Candidates: raw dotfiles,
  Claude Code plugin marketplaces, Cursor rules alone, Notion, prompt
  registries, the MCP registry. Non-negotiable rule: every page must contain
  visible rows where the alternative wins. Without them both readers and models
  discount the rest of the page.

- [ ] **JSON-LD structured data** — there is none today.
  `SoftwareApplication` and `Organization` (with `sameAs` to GitHub) so a model
  receives the category, licence and brand identity as fact rather than
  inference; `TechArticle` on docs and `BlogPosting` on posts; `BreadcrumbList`
  so results read `agentplaybooks.ai › Docs › CLI` instead of a bare URL.
  `FAQPage` is nearly free — the landing page's "Sound Familiar?" section is
  already question/answer pairs under `landing.useCases.cases.*`. This is the
  highest signal-to-noise channel an AI crawler has; everything else it must
  infer from prose.

- [ ] **`llms.txt` and raw markdown endpoints** — serve `/docs/<slug>.md` as
  `text/markdown` so AI clients read the source instead of parsing a styled
  shell, plus an `/llms.txt` index. Cheap here because the docs already *are*
  markdown files and `serveWellKnownSkills` already implements exactly this
  shape (markdown content type, cache headers, open CORS). Worth stating the
  split honestly: the raw `.md` endpoints have clear immediate value, while
  `llms.txt` is a convention with real adoption among developer docs but no
  commitment from any major model vendor — treat it as cheap insurance and a
  signal to developers evaluating the project, not a guaranteed traffic channel.

### Obsidian Plugin 📋

> **Why this matters:** a large share of the people who already keep a
> `Prompts/` or `Skills/` folder keep it in an Obsidian vault, and the community
> plugin directory reaches precisely that audience. Both sides speak markdown
> with frontmatter, so this is unusually cheap for the distribution it buys.
> The positioning is set out in [Obsidian and
> AgentPlaybooks](./obsidian.md): Obsidian is optimised for humans and this
> platform for machines, so the vault stays the authoring surface and is never
> asked to become a runtime.

- [ ] **Two-way sync for a `Skills/` folder** — a vault folder laid out as
  `<name>/SKILL.md` is already exactly what `apb push` reads, so the plugin's
  job is to make that a button instead of a terminal. Conflicts must behave the
  way the CLI does: same-named definitions with differing content are reported
  and skipped, never silently overwritten.
- [ ] **"Publish this note as a skill" command** — the note's frontmatter
  becomes the skill's `name` and `description`, with validation mirroring
  `apb doctor` so a note that is not a valid Agent Skill explains why before
  anything is uploaded.
- [ ] **Pull canvas documents into the vault** — an agent's finished work
  document arrives as an ordinary note, so deliverables are read where the
  human reads everything else.
- [ ] **Install from `/.well-known/skills/`** — already served with open CORS
  and no credential, so the plugin can browse and install public skills without
  an account. This is the one piece that needs no new backend work.
- [ ] **Refuse to store secrets in the vault** — the plugin must not put a
  credential in its own settings. That is exactly the failure mode a
  vault-based AI setup falls into: plaintext in
  `.obsidian/plugins/<name>/data.json`, then into Sync, then into git history if
  the vault is versioned. The vault holds the *reference*; the value stays in
  the encrypted store. This constraint is the sharpest single reason the
  platform exists, so the plugin cannot be the thing that violates it.

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
2. **Discoverability** - Locale-prefixed routing, indexable marketplace, comparison pages
3. **Documentation** - More examples, tutorials, video content
4. **Platform integrations** - New AI platforms and tools, including the Obsidian plugin
5. **RAG implementation** - Document storage and retrieval

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
| Phase 2: Security, Enterprise & Distribution | Q1-Q3 2026 | 🚧 In Progress |
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

*Last updated: August 2026*
