# AgentPlaybooks

**Platform-independent memory and toolkit for AI agents**

Give your AI agents, GPTs, and robots a platform-independent vault. Store skills, personas, and MCP servers - switch between AI platforms without losing anything.

## Features

- **Personas** - Define system prompts and AI personalities that work across any platform
- **Skills** - Create reusable capabilities and task definitions in Anthropic skill format
- **MCP Servers** - Configure Model Context Protocol servers for tools and resources
- **Memory** - Persistent key-value storage your AI can read and write to
- **Multi-Format Export** - JSON, OpenAPI for GPTs, MCP protocol, or human-readable Markdown
- **API Key Access** - Let your AI write back - update memory, skills, and personas programmatically
- **Public Repository** - Browse and add pre-built skills and MCP servers from the community

## Tech Stack

- **Frontend**: Next.js 16 + React 19 + Tailwind CSS + Framer Motion
- **Backend**: Cloudflare Workers (via OpenNext adapter)
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **UI Components**: Aceternity UI
- **i18n**: next-intl (EN, HU, DE, ES)

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm
- Supabase account
- Cloudflare account

### Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/agentplaybooks.git
cd agentplaybooks

# Install dependencies
npm install

# Create .env.local file
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
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
# Start development server
npm run dev

# Open http://localhost:3000
```

### Build for Cloudflare

```bash
# Build for Cloudflare Workers
npm run build:worker

# Preview locally
npm run preview

# Deploy (requires Cloudflare CLI setup)
npx wrangler deploy
```

## API Endpoints

### Public Playbook Access

```
GET /api/playbooks/:guid                    # Get playbook (JSON)
GET /api/playbooks/:guid?format=openapi     # OpenAPI 3.1 spec
GET /api/playbooks/:guid?format=mcp         # MCP Protocol format
GET /api/playbooks/:guid?format=markdown    # Human-readable
GET /api/playbooks/:guid/personas           # List personas
GET /api/playbooks/:guid/skills             # List skills
```

### Agent Write-back (requires API key)

```
GET  /api/agent/:guid/memory                # Read memories
POST /api/agent/:guid/memory                # Write memory
DELETE /api/agent/:guid/memory/:key         # Delete memory

POST /api/agent/:guid/skills                # Add skill
PUT  /api/agent/:guid/skills/:id            # Update skill

POST /api/agent/:guid/personas              # Add persona
PUT  /api/agent/:guid/personas/:id          # Update persona
```

### MCP Server Endpoint

```
GET  /api/mcp/:guid                         # MCP server manifest
POST /api/mcp/:guid                         # MCP JSON-RPC handler
```

### Public Repository

```
GET /api/public/skills                      # Browse public skills
GET /api/public/skills?tags=coding          # Filter by tags
GET /api/public/mcp                         # Browse public MCP servers
```

## API Key Usage

Generate an API key in the dashboard, then use it in your AI's requests:

```bash
curl -X POST https://your-domain.com/api/agent/abc123/memory \
  -H "Authorization: Bearer apb_live_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"key": "user_preferences", "value": {"theme": "dark"}}'
```

## Project Structure

```
agentplaybooks/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes (Hono)
│   │   ├── dashboard/          # Dashboard pages
│   │   ├── explore/            # Public repository
│   │   ├── login/              # Auth pages
│   │   └── page.tsx            # Landing page
│   ├── components/
│   │   └── ui/                 # Aceternity UI components
│   ├── i18n/
│   │   ├── messages/           # Translation files
│   │   └── config.ts           # i18n configuration
│   └── lib/
│       ├── supabase/           # Supabase client & types
│       └── utils.ts            # Utility functions
├── wrangler.jsonc              # Cloudflare config
└── open-next.config.ts         # OpenNext config
```

## Database Schema

- `playbooks` - Main entity containing personas, skills, MCP servers
- `personas` - System prompts / AI personalities
- `skills` - Capabilities / task definitions
- `mcp_servers` - MCP server configurations
- `memories` - Key-value storage for AI agents
- `api_keys` - For AI agent write-back access
- `public_skills` - Community skill repository
- `public_mcp_servers` - Community MCP repository
- `playbook_public_items` - Links playbooks to public items

All tables have Row Level Security (RLS) enabled.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT
