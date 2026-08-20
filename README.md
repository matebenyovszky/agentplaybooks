# AgentPlaybooks

**One playbook, every agent.** A portable operating environment for AI agents — persona, skills, MCP servers, project instructions, and memory in one source of truth.

Keep your agents yours. AgentPlaybooks stores skills, personas, MCP servers, project instructions, and memory in one portable playbook, so you can switch platforms, use several at once, or self-host without vendor lock-in.

Your agent setup stays in sync across Claude, ChatGPT, Cursor, Codex, Gemini, local models, and future platforms. The playbook is the portable source of truth—not any single vendor or editor.

## Highlights

**What a playbook holds**

- Persona: 1 per playbook, stored directly on the playbook record
- Instructions: always-on project rules — the `AGENTS.md` / `CLAUDE.md` content
- Skills: JSON schema definitions plus optional SKILL.md content
- Skill attachments: secure file storage for code, prompts, and docs
- MCP servers: tools and resources in Model Context Protocol format
- Memory: key-value store with tags and descriptions
- Canvas: versioned markdown work documents, scoped to a playbook run, so several
  teams can execute the same playbook without sharing work products

**Credentials, without handing them over**

- Secrets vault: AES-256-GCM, per-user derived keys. Agents reference a secret by
  name and the platform injects it server-side (`use_secret`), so the value never
  enters an agent's context. Optional per-secret host allow-lists.
- Federation: other MCP servers and OpenAPI services become tools on your
  playbook, with their credentials resolved from that same vault by name
- Audit trail: every federated call and every vault operation, refusals included

**Getting it into your tools**

- CLI + Claude Code plugin: audit your local agent config, then sync one playbook
  to Claude Code, Cursor, ChatGPT/Codex, Google Antigravity, Grok Bot and Hermes
- Publishing: a public playbook's skills are served as plain markdown over HTTP
  at `/.well-known/skills/` — installable from a URL, no registry, no sign-up
- Export formats: JSON, OpenAPI, MCP, Anthropic, Markdown

**Working with other people**

- API keys: role-based access control (Viewer, Coworker, Admin)
- Team collaboration: one-time editor invites without sharing human credentials or agent API keys
- Marketplace: Public and Unlisted playbooks, skills, MCP servers
- Theme: system-aware Light and Dark modes

## Tech Stack

| Category | Technology | Purpose |
| --- | --- | --- |
| Framework | [Next.js 16](https://nextjs.org/) + [React 19](https://react.dev/) | App Router, SSR |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) | Utility-first CSS |
| Animation | [Framer Motion](https://www.framer.com/motion/) | UI animations |
| Icons | [Lucide React](https://lucide.dev/) | Icon library |
| API | [Hono](https://hono.dev/) | Edge API routing |
| Database | [Supabase](https://supabase.com/) | Postgres + Auth + RLS |
| i18n | [next-intl](https://next-intl-docs.vercel.app/) | Localization (en, hu, de, es) |
| Docs | Plain markdown in `public/docs` | Fetched and rendered client-side |
| Hosting | [Cloudflare Workers](https://workers.cloudflare.com/) | Edge deployment |
| Adapter | [@opennextjs/cloudflare](https://opennext.js.org/) | Next.js on Workers |

## Live Demo

- Website: https://agentplaybooks.ai — the canonical host; https://apbks.com is a short domain for links
- Docs: https://agentplaybooks.ai/docs
- GitHub: https://github.com/matebenyovszky/agentplaybooks

## Getting Started

### Prerequisites

- Node.js 22+ (`engines` in `package.json`; CI runs 22)
- npm 11+ — npm 10 writes a lockfile `npm ci` then rejects
- Supabase project
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

# Required for the secrets vault. 32 bytes as 64 hex characters:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Losing it means losing every stored secret — no vault operation can decrypt
# without it, and rotating it invalidates everything already encrypted.
SECRETS_ENCRYPTION_KEY=
```

Optional:

| Variable | Effect |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | The canonical origin used for canonical tags, the sitemap and robots. Defaults to `https://agentplaybooks.ai`. |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list. Replaces the hosted defaults entirely — set it on a self-hosted instance so the project's own domains are not trusted there. |
| `SECRETS_REQUIRE_ALLOWED_HOSTS` | `true` makes a secret's host allow-list mandatory: an unpinned secret cannot be used for outbound requests at all. |

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
Google Antigravity (`.agents/skills`), Grok Bot (`.agents/skills`, which it
discovers natively alongside `AGENTS.md`), and Hermes Agent (`.agents/skills`
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

Invite links expire after 72 hours and can be accepted once. See [Team Collaboration](https://agentplaybooks.ai/docs/team-collaboration) for the full permission model and security notes.

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

# Audit trail — shared with federated MCP calls
GET    /api/playbooks/:guid/audit?operation=secret.
```

Every vault operation is recorded, refusals included: what was done, to which secret, by the
owner or by which API key prefix, and for `secret.use` the destination host. An entry never
holds a secret value, a full outbound URL, or a key. Owner access only — a playbook API key
performs vault operations but cannot read the record of them.

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
GET  /api/mcp/:guid                    # MCP manifest
POST /api/mcp/:guid                    # MCP JSON-RPC
POST /api/mcp/:guid/tools/:tool        # Call one tool over plain HTTP

POST /api/mcp/manage                   # MCP management server (user API key)

GET    /api/mcp/config/:serverId       # Federated server config (owner)
POST   /api/mcp/config/:serverId
PUT    /api/mcp/config/:serverId
DELETE /api/mcp/config/:serverId
POST   /api/mcp/config/:serverId/test  # Try the connection before saving it

GET  /api/mcp-registry/search          # Search the public MCP registry
GET  /.well-known/mcp-registry-auth    # Registry ownership verification
```

Every tool a playbook exposes is also reachable as a plain HTTP call, so a
client that cannot speak MCP is not shut out:

```
POST /api/playbooks/:guid/operations/:operation
POST /api/control/:operation           # Account-level operations
```

### Publishing skills over HTTP

Skills are served as plain markdown — an index plus one `SKILL.md` per skill, no
credential, open CORS. Any client can install from a base URL with no registry
and no sign-up. Only *public* playbooks are served; unlisted and private ones
stay reachable through `apb pull`.

```
GET /.well-known/skills/                    # Site-wide: every public playbook's skills
GET /playbooks/:guid/.well-known/skills/    # One playbook
```

```bash
hermes skills install well-known:https://agentplaybooks.ai/.well-known/skills/<name>
```

### Connection catalogue

```
GET /api/connections
```

Curated templates for wiring up a federated MCP server or OpenAPI service.
Public, because a template is not a credential: every entry references the
secrets it needs **by name only**, to be resolved from the playbook's vault.

### Management

```
GET  /api/manage/openapi.json
GET  /api/manage/playbooks
POST /api/manage/playbooks
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
      .well-known/skills/  # Public skill publishing (site-wide)
      api/
        _shared/           # auth.ts, guards.ts — where authorization lives
        [[...route]]/      # Hono catch-all for most endpoints
        mcp/               # MCP manifest, JSON-RPC, federation config
        playbooks/         # Per-playbook routes (secrets, canvas, audit, …)
      dashboard/           # Authenticated UI
      enterprise/          # Self-hosting landing page
      explore/             # Marketplace
      login/               # Auth pages
      page.tsx             # Marketing home
    components/
      playbook/            # Editor components
      ui/                  # UI primitives
    i18n/
      messages/            # Translation files (en, hu, de, es)
      request.ts           # Server-side locale resolution
    lib/
      mcp/                 # Federation, secret references
      storage/             # Storage adapters
      supabase/            # Supabase client and types
      crypto.ts            # Secrets vault encryption
  packages/
    cli/                   # AgentPlaybooks CLI + Claude Code plugin
  .claude-plugin/          # Plugin marketplace manifest
  docs/                    # Contributor-facing notes
  public/
    blog/  docs/           # Markdown served to the client
  schemas/                 # JSON schemas (agentplaybook.json, …)
  scripts/                 # Seed and build scripts
  supabase/
    migrations/            # Database migrations
  tests/                   # Vitest suites
  open-next.config.ts
  wrangler.jsonc
```

## Database Schema

- playbooks: core entity (includes visibility enum: private, public, unlisted; persona fields for agent identity and `instructions` for always-on project rules)
- secrets: the vault — AES-256-GCM ciphertext, per-secret host allow-list, reveal flag, rotation and usage accounting
- audit_logs: owner-readable audit trail for federated MCP calls and secrets vault operations (`secret.*`); never holds values, full URLs or keys. Renamed from `mcp_proxy_audit_logs`.
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

There is deliberately **no second credential store**. Federated MCP and OpenAPI
servers used to keep their own encrypted secrets in `mcp_server_secrets`; that
table was dropped (`supabase/migrations/20260820_drop_mcp_server_secrets.sql`)
because a second store meant the credentials most worth stealing sat in the
weaker box, without the rotation, expiry, usage accounting and audit trail the
vault already had. `transport_config.auth.token_secret` now names a vault entry
instead.

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
3. Run the same checks CI runs, in the same order:

   ```bash
   npm run lint                        # eslint
   npm run test:all                    # vitest + the CLI suite
   npm run prebuild && npx tsc --noEmit
   npm run audit:production
   npm run build
   ```

4. Commit your changes and open a Pull Request

Two things worth knowing before your first PR:

- **Write the lockfile with npm 11.** npm 10 produces a `package-lock.json` that
  `npm ci` then rejects outright, so CI fails on install before it reaches your
  change. `npx npm@11 install` works on Node 20 as well.
- **Warnings are tolerated, errors are not.** `npm run lint` currently reports a
  known set of `react-hooks` and navigation warnings, tracked in the issues —
  a clean run means zero *errors*, not zero output.

## License

MIT — see [LICENSE](LICENSE).

Use it for anything, including commercially. Keep the copyright notice and the
permission notice in copies or substantial portions.
