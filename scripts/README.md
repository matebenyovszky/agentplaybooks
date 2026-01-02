# AgentPlaybooks Scripts

This directory contains utility scripts for managing AgentPlaybooks data.

## Seed Script

Seeds the database with sample skills and MCP servers.

### Sources

- **Skills**: Fetched from [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) - a curated collection of cursor rules/prompts
- **MCP Servers**: Official servers from [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)

### Text Processing

All imported skills have text replacements applied to generalize them:
- `claude` → `agent`
- `Claude` → `Agent`  
- `anthropic` → `AI provider`

### Usage

```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
export GITHUB_TOKEN="ghp_..." # Optional, for higher rate limits

# Run seed script
npm run seed

# Dry run (shows what would be done)
npm run seed:dry
```

### PowerShell (Windows)

```powershell
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."

.\scripts\seed-data.ps1
# Or with options:
.\scripts\seed-data.ps1 -DryRun
.\scripts\seed-data.ps1 -SkipMigrations
```

## GitHub Skill Parser

Standalone utility for parsing cursor rules from GitHub.

### Usage

```bash
# Parse a single .cursorrules file
npm run seed:skills -- https://github.com/PatrickJS/awesome-cursorrules/blob/main/rules/nextjs/.cursorrules

# Scan an entire repository
npm run seed:skills -- https://github.com/PatrickJS/awesome-cursorrules

# Output as JSON
npm run seed:skills -- https://github.com/PatrickJS/awesome-cursorrules --json
```

### Features

- Parses `.cursorrules` files from GitHub
- Auto-detects technologies (React, Next.js, Python, etc.)
- Applies text replacements (claude → agent)
- Extracts descriptions and categories
- Supports rate limit handling with optional `GITHUB_TOKEN`

## MCP Servers

The seed script includes these public MCP servers (no authentication required):

| Server | Description |
|--------|-------------|
| `filesystem` | Local file operations |
| `memory` | Knowledge graph storage |
| `fetch` | Web page fetching |
| `puppeteer` | Browser automation |
| `sqlite` | SQLite database access |
| `time` | Timezone utilities |
| `sequential-thinking` | Structured reasoning |
| `everything` | Windows file search |

### Servers Requiring Authentication

These are included in the data but marked as `requires_auth: true`:

| Server | Required Config |
|--------|----------------|
| `brave-search` | `BRAVE_API_KEY` |
| `postgres` | `POSTGRES_URL` |

## Database Schema

The scripts expect these tables to exist (created by migrations):

```sql
-- Skills
public_skills (
  id, author_id, name, description, definition, 
  examples, tags, source_url, source_type, is_verified
)

-- MCP Servers
public_mcp_servers (
  id, author_id, name, description, transport_type, 
  transport_config, tools, resources, tags, 
  source_url, source_type, is_verified
)
```

## Development

### Adding New Skill Sources

1. Edit `scripts/seed-data.ts`
2. Add your source to the `CONFIG` object
3. Create a fetch function similar to `fetchCursorRulesSkills`

### Adding New MCP Servers

1. Edit the `KNOWN_PUBLIC_MCP_SERVERS` array in `scripts/seed-data.ts`
2. Follow the existing format for tools/resources/transport config

### Text Replacement Rules

To add/modify replacements:

```typescript
// In scripts/seed-data.ts or scripts/github-skill-parser.ts
const CONFIG = {
  text_replacements: [
    { from: /\bsomeword\b/gi, to: 'replacement' },
    // Add more...
  ],
};
```

## Troubleshooting

### Rate Limits

If you see `GitHub rate limit exceeded`:
1. Set `GITHUB_TOKEN` environment variable
2. Create a token at: https://github.com/settings/tokens

### Missing System User

The seed script uses a fixed system user ID. For production:
1. Create a user in `auth.users` with ID `00000000-0000-0000-0000-000000000001`
2. Or modify `getOrCreateSystemUser()` in the script

### RLS Errors

Make sure you're using `SUPABASE_SERVICE_ROLE_KEY` (not the anon key) to bypass Row Level Security during seeding.

