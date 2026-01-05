# Developer Guide

This guide is for developers contributing to AgentPlaybooks or building extensions.

## Project Overview

AgentPlaybooks is a platform-independent memory and toolkit for AI agents. It allows users to:

1. **Create Playbooks** - Collections of personas, skills, MCP servers, and memory
2. **Export in Multiple Formats** - JSON, OpenAPI, MCP protocol, Markdown
3. **Enable AI Write-back** - AI agents can update memory via API keys
4. **Browse Community Repository** - Public skills and MCP servers

## Technology Stack

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Framework** | [Next.js](https://nextjs.org/) | 16.x | React framework with App Router |
| **Runtime** | [React](https://react.dev/) | 19.x | UI library |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | 4.x | Utility-first CSS |
| **Animation** | [Framer Motion](https://www.framer.com/motion/) | 12.x | Declarative animations |
| **UI Components** | [Aceternity UI](https://ui.aceternity.com/) | - | Premium UI components |
| **Icons** | [Lucide React](https://lucide.dev/) | 0.5.x | Icon library |
| **API** | [Hono](https://hono.dev/) | 4.x | Fast edge-first web framework |
| **Database** | [Supabase](https://supabase.com/) | - | PostgreSQL + Auth + RLS |
| **i18n** | [next-intl](https://next-intl-docs.vercel.app/) | 4.x | Internationalization |
| **Docs** | [MDX](https://mdxjs.com/) | 3.x | Markdown + React |
| **Hosting** | [Cloudflare Pages](https://pages.cloudflare.com/) | - | Edge deployment |
| **Adapter** | [@opennextjs/cloudflare](https://github.com/opennextjs/cloudflare) | 1.x | Next.js → Cloudflare |

## Repository Structure

```
agentplaybooks/
├── docs/                           # Documentation (GitHub + Website)
│   ├── README.md                   # Overview
│   ├── getting-started.md          # Quick start guide
│   ├── architecture.md             # System design
│   ├── api-reference.md            # API documentation
│   ├── mcp-integration.md          # MCP protocol guide
│   ├── skills.md                   # Skills documentation
│   ├── memory.md                   # Memory documentation
│   ├── developer-guide.md          # This file
│   └── self-hosting.md             # Self-hosting guide
│
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── page.tsx                # Landing page
│   │   ├── layout.tsx              # Root layout
│   │   ├── globals.css             # Global styles
│   │   ├── login/                  # Authentication pages
│   │   │   └── page.tsx            # Login/Register
│   │   ├── dashboard/              # Authenticated user area
│   │   │   ├── page.tsx            # Playbook list
│   │   │   └── playbook/[id]/      # Playbook editor
│   │   ├── explore/                # Public repository
│   │   │   └── page.tsx            # Browse skills/MCPs
│   │   ├── enterprise/             # Enterprise landing
│   │   │   └── page.tsx            # B2B features
│   │   ├── docs/                   # Documentation viewer
│   │   │   └── page.tsx            # MDX renderer
│   │   └── api/                    # API routes (Hono)
│   │       ├── [[...route]]/       # Main API
│   │       │   └── route.ts        # Playbooks, memory, etc.
│   │       ├── mcp/[guid]/         # MCP server endpoints
│   │       │   └── route.ts        # MCP protocol handler
│   │       └── docs/[...slug]/     # Docs API
│   │           └── route.ts        # Serve markdown files
│   │
│   ├── components/                 # React components
│   │   └── ui/                     # UI components
│   │       ├── sidebar.tsx         # Navigation sidebar
│   │       ├── floating-navbar.tsx # Top navigation
│   │       ├── bento-grid.tsx      # Feature grid
│   │       ├── spotlight.tsx       # Spotlight effect
│   │       └── card-hover-effect.tsx
│   │
│   ├── lib/                        # Utilities
│   │   ├── utils.ts                # cn() and helpers
│   │   └── supabase/               # Supabase client
│   │       ├── client.ts           # Browser client
│   │       ├── server.ts           # Server client
│   │       └── types.ts            # Generated types
│   │
│   ├── i18n/                       # Internationalization
│   │   ├── config.ts               # next-intl config
│   │   ├── request.ts              # Locale routing
│   │   └── messages/               # Translation files
│   │       ├── en.json
│   │       ├── hu.json
│   │       ├── de.json
│   │       └── es.json
│   │
│   └── mdx-components.tsx          # Custom MDX components
│
├── supabase/
│   └── migrations/                 # Database migrations
│       └── 20260102_initial_schema.sql
│
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD pipeline
│
├── package.json                    # Dependencies
├── next.config.ts                  # Next.js config
├── tailwind.config.ts              # Tailwind config
├── wrangler.jsonc                  # Cloudflare config
├── open-next.config.ts             # OpenNext config
└── README.md                       # Project README
```

## Development Setup

### Prerequisites

- Node.js 20+
- npm 10+
- Git
- Supabase account (free tier OK)
- Cloudflare account (free tier OK)

### Local Development

```bash
# Clone repository
git clone https://github.com/matebenyovszky/agentplaybooks.git
cd agentplaybooks

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your Supabase credentials
# NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
# SUPABASE_SERVICE_ROLE_KEY=xxx

# Run development server
npm run dev

# Open http://localhost:3000
```

### Database Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the migration in SQL Editor:
   - Copy contents of `supabase/migrations/20260102_initial_schema.sql`
   - Paste into SQL Editor and run
3. Enable Auth providers (Email, Google, GitHub) in Authentication settings

## Key Concepts

### Playbooks

A playbook is a container for:
- **Personas** - System prompts for AI agents
- **Skills** - Structured capability definitions (Anthropic format)
- **MCP Servers** - Model Context Protocol configurations
- **Memory** - Key-value storage for context
- **API Keys** - For write-back authentication

### Multi-Format Export

Each playbook can be exported as:

| Format | Use Case | Endpoint |
|--------|----------|----------|
| JSON | Custom agents | `/api/playbooks/:guid` |
| OpenAPI | ChatGPT GPTs | `/api/playbooks/:guid?format=openapi` |
| MCP | Claude, Cursor | `/api/mcp/:guid` |
| Markdown | Documentation | `/api/playbooks/:guid?format=markdown` |
| Anthropic | Claude tools | `/api/playbooks/:guid?format=anthropic` |

### Row Level Security (RLS)

All database access uses Supabase RLS:

- **Authenticated users** - Full CRUD on their own data
- **Public playbooks** - Read-only access for anyone
- **API keys** - Validated at API layer, bypass RLS with service role

## Development Tasks

### Task: Playbook Editor UI ✅ COMPLETED

**Goal:** Create the UI for editing playbooks

**Files created:**

```
src/components/playbook/
├── index.ts              # Barrel export
├── PersonaEditor.tsx     # System prompt editor with auto-save
├── SkillEditor.tsx       # JSON schema editor (visual + raw)
├── McpServerEditor.tsx   # Tools & resources editor
├── MemoryEditor.tsx      # Key-value editor with search
└── ApiKeyManager.tsx     # Generate/revoke API keys
```

**Component Details:**

#### PersonaEditor
- Expandable card with inline name editing
- Auto-resizing textarea for system prompts
- Metadata JSON editor
- Debounced auto-save (1.5s delay)
- Copy to clipboard for prompts
- Delete with confirmation dialog

#### SkillEditor  
- Two view modes: **Visual Editor** & **JSON Schema**
- Visual mode: Add/remove parameters, set types, descriptions
- Parameter types: string, number, integer, boolean, array, object
- Required field toggling
- Examples JSON array editor
- Real-time JSON validation with error display

#### McpServerEditor
- Tabbed interface: Tools | Resources
- Add tools with name, description, inputSchema
- Add resources with URI, name, mimeType
- JSON editors for advanced editing
- Link to MCP documentation

#### MemoryEditor
- Search/filter memories by key or value
- Add new memory entries
- Edit in modal dialog with JSON validation
- Refresh button for latest data
- Timestamp display (updated_at)

#### ApiKeyManager
- Permission-based key creation modal
- Available permissions: memory, skills, personas (read/write)
- One-time key display with copy warning
- Key list with prefix and permission badges
- Revoke keys with confirmation

**Main Editor Page:** `src/app/dashboard/playbook/[id]/page.tsx`

Features:
- Sticky header with save status indicator
- Tabbed navigation: Personas | Skills | MCP | Memory | API Keys | Settings
- Debounced auto-save for playbook settings
- Public/Private toggle in header
- Settings tab with:
  - Description textarea
  - Visibility controls (Private/Public)
  - All API endpoints with copy buttons
  - Danger zone for playbook deletion
- Animated tab transitions (Framer Motion)

**Demo Mode:** `src/app/demo/playbook/page.tsx`

- Full editor experience without authentication
- localStorage persistence for demo data
- "Demo Mode" banner with sign-up CTA
- Same components as authenticated editor
- Prompt to register when saving

### Task: API Endpoints ✅ COMPLETED

**Goal:** Implement CRUD operations for playbooks

**Files:**
- `src/app/api/[[...route]]/route.ts` - Main API file (Hono framework)

**Implemented Endpoints:**

```typescript
// Playbooks (JWT auth required for mutations)
GET    /api/playbooks              // List user's playbooks
POST   /api/playbooks              // Create playbook
GET    /api/playbooks/:guid        // Get playbook (public or owned) + format param
PUT    /api/playbooks/:id          // Update playbook
DELETE /api/playbooks/:id          // Delete playbook

// Personas (JWT auth required)
GET    /api/playbooks/:id/personas
POST   /api/playbooks/:id/personas
PUT    /api/playbooks/:id/personas/:pid
DELETE /api/playbooks/:id/personas/:pid

// Skills (JWT auth required)
GET    /api/playbooks/:id/skills
POST   /api/playbooks/:id/skills
PUT    /api/playbooks/:id/skills/:sid
DELETE /api/playbooks/:id/skills/:sid

// Memory (API key or JWT for writes)
GET    /api/playbooks/:guid/memory          // Public read for public playbooks
PUT    /api/playbooks/:guid/memory/:key     // Requires API key or owner
DELETE /api/playbooks/:guid/memory/:key     // Requires API key or owner

// API Keys (JWT auth, owner only)
GET    /api/playbooks/:id/api-keys
POST   /api/playbooks/:id/api-keys          // Returns plain key ONCE
DELETE /api/playbooks/:id/api-keys/:kid

// Public Repository
GET    /api/public/skills
GET    /api/public/skills/:id
GET    /api/public/mcp
GET    /api/public/mcp/:id

// Health Check
GET    /api/health
```

**Format Parameter:**

The `GET /api/playbooks/:guid` endpoint supports multiple output formats:

| Format | Use Case |
|--------|----------|
| `json` (default) | Custom agents, direct API use |
| `openapi` | ChatGPT Custom Actions |
| `mcp` | Claude, Cursor MCP integration |
| `anthropic` | Anthropic tool definitions |
| `markdown` | Human-readable documentation |

**Authentication Flow:**

1. **JWT Auth** - For dashboard/management (from Supabase session)
2. **API Key Auth** - For AI agent write-back (`Bearer apb_live_xxx`)
3. **Public Access** - No auth needed for public playbook reads

**Key Implementation Details:**

- Uses `getServiceSupabase()` to bypass RLS where needed
- API keys stored as SHA-256 hash, validated against hash
- Ownership checked before all mutations

## Testing

```bash
# Run linter
npm run lint

# Type check
npx tsc --noEmit

# Build for production
npm run build
```

## Deployment

Deployment is automatic via GitHub Actions:

1. Push to `main` branch
2. GitHub Actions builds the project
3. Deploys to Cloudflare Pages

Manual deployment:
```bash
npm run build
npx wrangler pages deploy .open-next
```

## Code Style

- **TypeScript** - Strict mode enabled
- **Functional components** - No class components
- **Tailwind** - No custom CSS unless necessary
- **Server Components** - Default, use 'use client' only when needed
- **Naming** - camelCase for variables, PascalCase for components

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages)
- [Hono Documentation](https://hono.dev/docs)
- [Aceternity UI Components](https://ui.aceternity.com/components)
- [Anthropic Tool Use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use)
- [MCP Specification](https://modelcontextprotocol.io/)
