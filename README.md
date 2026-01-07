# AgentPlaybooks

Platform-independent memory and toolkit for AI agents.

Give your AI agents, GPTs, and robots a platform-independent vault. Store skills, personas, and MCP servers, then move between AI platforms without losing anything.

## Highlights

- Personas: 1 per playbook, stored directly on the playbook record
- Skills: JSON schema definitions plus optional SKILL.md content
- Skill attachments: secure file storage for code, prompts, and docs
- MCP servers: tools and resources in Model Context Protocol format
- Memory: key-value store with tags and descriptions
- Export formats: JSON, OpenAPI, MCP, Anthropic, Markdown
- API keys: Role-Based Access Control (Viewer, Coworker, Admin)
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

- Website: https://agentplaybooks.ai
- Docs: https://agentplaybooks.ai/docs
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

### Personas (owner only)

```
POST   /api/playbooks/:id/personas
PUT    /api/playbooks/:id/personas/:pid
DELETE /api/playbooks/:id/personas/:pid
```

### Skills (owner only)

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

### Playbook API keys (owner only)

```
GET    /api/playbooks/:id/api-keys
POST   /api/playbooks/:id/api-keys
DELETE /api/playbooks/:id/api-keys/:kid
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
  scripts/                 # Seed and build scripts
  supabase/
    migrations/            # Database migrations
  public/
  open-next.config.ts
  wrangler.jsonc
```

## Database Schema

- playbooks: core entity (includes visibility enum: private, public, unlisted)
- skills: skill definitions and optional SKILL.md content
- skill_attachments: secure attachment storage for skills
- mcp_servers: MCP tools and resources
- memories: key-value memory store
- api_keys: playbook-scoped API keys with RBAC roles
- user_api_keys: user-scoped API keys
- profiles: public user profile data
- playbook_stars: marketplace stars

All tables use Row Level Security (RLS).

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the PolyForm Noncommercial License 1.0.0.

### What this means:

You CAN:
- Use the software for personal projects, learning, and experimentation
- Use it internally within your organization for non-commercial purposes
- Modify and adapt it for your own non-commercial use
- Use it for research, education, and charitable purposes

You CANNOT (without permission):
- Sell the software or offer it as a paid service
- Use it to provide commercial services to others
- Monetize the software or concept in any way

For commercial licensing, please contact the project maintainer.

See the LICENSE file for full details.
