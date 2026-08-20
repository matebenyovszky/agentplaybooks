# AgentPlaybooks

**One playbook, every agent.** A portable operating environment for AI agents — persona, skills, MCP servers, project instructions, and memory in one source of truth.

Keep your agents yours. AgentPlaybooks stores skills, personas, MCP servers, project instructions, and memory in one portable playbook, so you can switch platforms, use several at once, or self-host without vendor lock-in.

Your agent setup stays in sync across Claude, ChatGPT, Cursor, Codex, Gemini, local models, and future platforms. The playbook is the portable source of truth—not any single vendor or editor.

## Highlights

- Personas: 1 per playbook, stored directly on the playbook record
- Skills: JSON schema definitions plus optional SKILL.md content
- Skill attachments: secure file storage for code, prompts, and docs
- MCP servers: tools and resources in Model Context Protocol format
- Canvas: versioned markdown work documents for long-running agent workflows
- Memory: key-value store with tags and descriptions
- Export formats: JSON, OpenAPI, MCP, Anthropic, Markdown
- API keys: Role-Based Access Control (Viewer, Coworker, Admin)
- Team collaboration: one-time editor invites without sharing human credentials or agent API keys
- Marketplace: Public and Unlisted playbooks, skills, MCP servers
- Theme: System-aware Light and Dark modes

## Tech Stack

| Category | Technology | Purpose |
| --- | --- | --- |
| Framework | [Next.js 15](https://nextjs.org/) + [React 19](https://react.dev/) | App Router, SSR |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) | Utility-first CSS |
| Animation | [Framer Motion](https://www.framer.com/motion/) | UI animations |
| Icons | [Lucide React](https://lucide.dev/) | Icon library |
| API | [Hono](https://hono.dev/) | Edge API routing |
| Database | [Supabase](https://supabase.com/) | Postgres + Auth + RLS |
| i18n | [next-intl](https://next-intl-docs.vercel.app/) | Localization |
| Docs | [MDX](https://mdxjs.com/) | Markdown + React |
| Hosting | [Cloudflare Pages](https://pages.cloudflare.com/) | Edge deployment |
| Adapter | [@opennextjs/cloudflare](https://opennext.js.org/) | Next.js on Workers |

## Live Demo

- Website: https://apbks.com
- Docs: https://apbks.com/docs
- GitHub: https://github.com/matebenyovszky/agentplaybooks

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm
- Supabase account
- Cloudflare account (optional for deployment)

### Installation

```bash
git clone https://github.com/matebenyovszky/agentplaybooks.git
cd agentplaybooks
npm install
```

### Environment Variables

Create a `.env.local` file with:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Development

```bash
npm run dev
```

Open http://localhost:3000

### Cloudflare Deployment

```bash
npm run build:worker
npm run preview
npx wrangler deploy
```

## CLI and Claude Code Plugin (`packages/cli`)

`agentplaybooks doctor <project>` audits local agent configuration
(instructions, Agent Skills, MCP servers, likely hard-coded secrets, drift)
and `agentplaybooks sync <project>` creates the canonical
`agentplaybook.json` plus the platform files missing from enabled targets:
Claude Code (`.claude/skills` + `.mcp.json`), Cursor (`.cursor/skills` +
`.cursor/mcp.json`), ChatGPT/Codex (`.codex/skills` + `.codex/config.toml`),
Google Antigravity (`.agents/skills`), and Hermes Agent (`.agents/skills`
registered in `~/.hermes/config.yaml`, plus that file's `mcp_servers:` and
`SOUL.md`).
`login` / `playbooks` / `pull` / `push` synchronize skills, MCP servers, and the
manifest with a hosted playbook using a user API key; secret values never move,
only the references the playbook declares in `spec.secrets`. All mutating
commands are plan-only until `--apply`. See
[packages/cli/README.md](packages/cli/README.md).

The same package doubles as a Claude Code / Claude Cowork plugin (skill +
slash commands). Install it from this repository:

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

## API Overview

### Public and Unlisted playbook access

Public playbooks are visible to everyone. Unlisted playbooks are accessible via GUID but hidden from search.


```
GET /api/playbooks/:guid
GET /api/playbooks/:guid?format=openapi
GET /api/playbooks/:guid?format=mcp
GET /api/playbooks/:guid?format=anthropic
GET /api/playbooks/:guid?format=markdown

GET /api/playbooks/:id/personas
GET /api/playbooks/:id/skills
GET /api/playbooks/:guid/memory
```

Note: `:id` supports both UUID and GUID for personas and skills.

### Authenticated playbook CRUD (session auth)

```
GET    /api/playbooks
POST   /api/playbooks
PUT    /api/playbooks/:id
DELETE /api/playbooks/:id
```

### Personas (owner or editor)

```
POST   /api/playbooks/:id/personas
PUT    /api/playbooks/:id/personas/:pid
DELETE /api/playbooks/:id/personas/:pid
```

### Skills (owner or editor)

```
POST   /api/playbooks/:id/skills
PUT    /api/playbooks/:id/skills/:sid
DELETE /api/playbooks/:id/skills/:sid
```

### Memory writes (API key or owner)

```
PUT    /api/playbooks/:guid/memory/:key
DELETE /api/playbooks/:guid/memory/:key
```

### Canvas work documents

Canvas documents belong to an isolated workflow run, so multiple teams can execute the same
playbook without sharing work products. They are long-form markdown artifacts that agents can revise over time. Use
memory for durable facts and structured state; use canvas for deliverables such as a PR review,
research report, implementation plan, or draft that may be edited passage by passage.

```http
GET    /api/playbooks/:guid/runs
POST   /api/playbooks/:guid/runs
GET    /api/playbooks/:guid/canvas?runId=:runId
POST   /api/playbooks/:guid/canvas
GET    /api/playbooks/:guid/canvas/:slug?runId=:runId
PUT    /api/playbooks/:guid/canvas/:slug?runId=:runId
PATCH  /api/playbooks/:guid/canvas/:slug?runId=:runId
DELETE /api/playbooks/:guid/canvas/:slug?runId=:runId
```

`PUT` replaces document fields and requires `expectedVersion`. `PATCH` performs an incremental
`append`, `prepend`, or exact `replace` operation and also requires `expectedVersion`. A stale
version returns HTTP `409`, preventing two agents from silently overwriting each other's work.

```bash
curl -X PATCH 'https://your-domain.com/api/playbooks/abc123/canvas/pr-review?runId=RUN_UUID' \
  -H "Authorization: Bearer apb_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "replace",
    "search": "## Security review\nPending.",
    "content": "## Security review\nNo blocking issues found.",
    "expectedVersion": 3
  }'
```

### Playbook API keys (owner only)

```
GET    /api/playbooks/:id/api-keys
POST   /api/playbooks/:id/api-keys
DELETE /api/playbooks/:id/api-keys/:kid
```

### Human collaboration (session auth; owner manages access)

Human editors are invited with a one-time link. They can edit playbook content, while ownership controls remain owner-only.

```
GET    /api/playbooks/:id/collaborators
POST   /api/playbooks/:id/collaborators
DELETE /api/playbooks/:id/collaborators/:collaboratorId

GET    /api/collaboration-invites/:token
POST   /api/collaboration-invites/:token
```

Invite links expire after 72 hours and can be accepted once. See [Team Collaboration](https://apbks.com/docs/team-collaboration) for the full permission model and security notes.

### Playbook Secrets (owner or API key)

Secrets are encrypted using AES-256-GCM. Agents can use the `use_secret` MCP tool or proxy endpoint to use secrets in HTTP requests without ever reading the plaintext value.

```
GET    /api/playbooks/:guid/secrets          # List metadata only
POST   /api/playbooks/:guid/secrets          # Create encrypted secret
PUT    /api/playbooks/:guid/secrets/:name    # Update/rotate secret
DELETE /api/playbooks/:guid/secrets/:name    # Delete secret

# Dashboard only
GET    /api/playbooks/:guid/secrets/reveal/:name

# Proxy external requests using a secret
POST   /api/playbooks/:guid/secrets/proxy
```

### User profile and user API keys (Management)


```
GET    /api/user/profile
PUT    /api/user/profile

GET    /api/user/api-keys
POST   /api/user/api-keys
DELETE /api/user/api-keys/:kid
```

### Marketplace and stars

```
GET /api/public/playbooks
GET /api/public/skills
GET /api/public/skills/:id
GET /api/public/mcp
GET /api/public/mcp/:id

GET  /api/playbooks/:id/star
POST /api/playbooks/:id/star
GET  /api/user/starred
```

### Memory write-back (playbook API key or owner)

```
GET    /api/playbooks/:guid/memory
PUT    /api/playbooks/:guid/memory/:key
DELETE /api/playbooks/:guid/memory/:key
```

### MCP endpoints

```
GET  /api/mcp/:guid       # MCP manifest
POST /api/mcp/:guid       # MCP JSON-RPC

POST /api/mcp/manage      # MCP management server (user API key)
```

### Management OpenAPI

```
GET /api/manage/openapi.json
```

### Health

```
GET /api/health
```

## API Key Usage

Playbook API keys let agents read/write memory for a single playbook.

```bash
curl -X PUT https://your-domain.com/api/playbooks/abc123/memory/user_preferences \
  -H "Authorization: Bearer apb_live_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"value": {"theme": "dark"}}'
```

User API keys are used for management endpoints and the MCP management server:

```bash
curl -X POST https://your-domain.com/api/mcp/manage \
  -H "Authorization: Bearer apb_live_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"list_playbooks","params":{}}'
```

## Project Structure

```
agentplaybooks/
  src/
    app/
      api/                 # Hono API + MCP endpoints
      dashboard/           # Authenticated UI
      enterprise/          # Enterprise landing page
      explore/             # Marketplace
      login/               # Auth pages
      page.tsx             # Marketing home
    components/
      playbook/            # Editor components
      ui/                  # UI primitives
    i18n/
      messages/            # Translation files
      config.ts            # i18n configuration
    lib/
      storage/             # Storage adapters
      supabase/            # Supabase client and types
      attachment-validator.ts
      utils.ts
  packages/
    cli/                   # AgentPlaybooks CLI + Claude Code plugin
  scripts/                 # Seed and build scripts
  supabase/
    migrations/            # Database migrations
  public/
  open-next.config.ts
  wrangler.jsonc
```

## Database Schema

- playbooks: core entity (includes visibility enum: private, public, unlisted; persona fields for agent identity and `instructions` for always-on project rules)
- mcp_server_secrets: encrypted credentials for federated MCP/OpenAPI servers (service-role only)
- mcp_proxy_audit_logs: owner-readable audit trail for federated calls
- skills: skill definitions and optional SKILL.md content
- skill_attachments: secure attachment storage for skills
- mcp_servers: MCP tools and resources
- playbook_runs: isolated executions of a reusable playbook
- canvas: versioned markdown work documents
- memories: key-value memory store
- api_keys: playbook-scoped API keys with RBAC roles
- user_api_keys: user-scoped API keys
- playbook_collaborators: accepted human editor memberships and hashed one-time invites
- profiles: public user profile data
- playbook_stars: marketplace stars

### A note on Row Level Security

RLS is enabled on the tables listed above, but it is **not** the primary
authorization mechanism at runtime. Almost all API routes query with the
service-role key, which bypasses RLS; authorization is enforced in application
code (`src/app/api/_shared/guards.ts`).

RLS *is* load-bearing for the handful of endpoints that read public playbooks
with the anon key — the MCP manifest (`/api/mcp/:guid`), its tool routes, and
the public skills/MCP listings. Those depend on the anon `SELECT` policies in
`supabase/migrations/20260107_permissions_refactor.sql`. Removing or disabling
those policies breaks the endpoints rather than merely relaxing them.

Policies written against `auth.uid()` are currently inert, because no
JWT-bearing client performs table queries — the browser talks only to
`/api/*`, never to Postgres directly.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT — see [LICENSE](LICENSE).

Use it for anything, including commercially. Keep the copyright notice and the
permission notice in copies or substantial portions.
