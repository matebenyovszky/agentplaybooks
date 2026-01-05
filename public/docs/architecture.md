# Architecture

This document describes the technical architecture of AgentPlaybooks.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Consumers                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ ChatGPT  │  │  Claude  │  │  Custom  │  │  Enterprise AI   │ │
│  │  (GPTs)  │  │  (MCP)   │  │  Agents  │  │     Systems      │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
│       │             │             │                  │           │
│       │  OpenAPI    │   MCP       │   REST/JSON      │           │
│       ▼             ▼             ▼                  ▼           │
└───────┴─────────────┴─────────────┴──────────────────┴───────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge Network                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Cloudflare Workers                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │  │
│  │  │  REST API   │  │   OpenAPI   │  │   MCP Server    │    │  │
│  │  │   (Hono)    │  │  Generator  │  │    Endpoint     │    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘    │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Cloudflare Pages                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │  │
│  │  │   Landing   │  │  Dashboard  │  │      Docs       │    │  │
│  │  │    Page     │  │   (React)   │  │     (MDX)       │    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │    Auth     │  │  PostgreSQL │  │   Row Level Security    │  │
│  │  (JWT/OAuth)│  │  (Database) │  │      (RLS Policies)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 16 + React 19 | Server-side rendering, App Router |
| Styling | Tailwind CSS 4 | Utility-first CSS |
| Animation | Framer Motion | Smooth animations |
| UI Components | Aceternity UI | Modern, accessible components |
| i18n | next-intl | Multi-language support (EN/HU/DE/ES) |
| API | Hono | Fast, lightweight API framework |
| Database | Supabase PostgreSQL | Relational data with RLS |
| Auth | Supabase Auth | JWT, OAuth (Google, GitHub) |
| Hosting | Cloudflare Pages/Workers | Edge computing, global CDN |
| Docs | MDX | Markdown + React components |

## Database Schema

```
┌─────────────────┐       ┌─────────────────┐
│     users       │       │    playbooks    │
│  (auth.users)   │◄──────│                 │
├─────────────────┤  1:N  ├─────────────────┤
│ id (UUID)       │       │ id (UUID)       │
│ email           │       │ user_id (FK)    │
│ ...             │       │ guid (unique)   │
└─────────────────┘       │ name            │
                          │ is_public       │
                          └────────┬────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │    personas     │  │     skills      │  │   mcp_servers   │
    ├─────────────────┤  ├─────────────────┤  ├─────────────────┤
    │ id              │  │ id              │  │ id              │
    │ playbook_id(FK) │  │ playbook_id(FK) │  │ playbook_id(FK) │
    │ name            │  │ name            │  │ name            │
    │ system_prompt   │  │ definition      │  │ tools (JSONB)   │
    │ metadata        │  │ examples        │  │ resources       │
    └─────────────────┘  └─────────────────┘  └─────────────────┘
              
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │    memories     │  │    api_keys     │  │ playbook_public │
    ├─────────────────┤  ├─────────────────┤  │     _items      │
    │ id              │  │ id              │  ├─────────────────┤
    │ playbook_id(FK) │  │ playbook_id(FK) │  │ playbook_id     │
    │ key             │  │ key_hash        │  │ item_type       │
    │ value (JSONB)   │  │ permissions[]   │  │ item_id         │
    └─────────────────┘  └─────────────────┘  └─────────────────┘

    ┌─────────────────┐  ┌─────────────────┐
    │  public_skills  │  │ public_mcp_     │
    │                 │  │    servers      │
    ├─────────────────┤  ├─────────────────┤
    │ id              │  │ id              │
    │ author_id       │  │ author_id       │
    │ name            │  │ name            │
    │ tags[]          │  │ tags[]          │
    │ usage_count     │  │ usage_count     │
    │ is_verified     │  │ is_verified     │
    └─────────────────┘  └─────────────────┘
```

## Request Flow

### Public Playbook Read

```
1. Client → GET /api/playbooks/:guid?format=mcp
2. Cloudflare Worker receives request
3. Hono router matches route
4. Query Supabase (uses anon key, RLS allows public playbooks)
5. Format response based on ?format parameter
6. Return to client
```

### Authenticated Write-Back

```
1. AI Agent → PUT /api/playbooks/:guid/memory/:key
   Headers: Authorization: Bearer apb_live_xxx
2. Cloudflare Worker receives request
3. Extract API key from header
4. Hash key, query api_keys table (service role, bypass RLS)
5. Verify key exists, is active, has permissions
6. Check key belongs to requested playbook
7. Perform write operation
8. Update last_used_at
9. Return success
```

## Security Model

### Row Level Security (RLS)

All tables have RLS enabled. Key policies:

```sql
-- Playbooks: owner can do everything, public playbooks readable by all
CREATE POLICY "Users can manage own playbooks" ON playbooks
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public playbooks are readable" ON playbooks
    FOR SELECT USING (is_public = true);

-- Memories: owner only (API key access handled at API level)
CREATE POLICY "Owner access memories" ON memories
    FOR ALL USING (
        EXISTS (SELECT 1 FROM playbooks 
                WHERE playbooks.id = memories.playbook_id 
                AND playbooks.user_id = auth.uid())
    );
```

### API Key Security

- Keys are hashed with SHA-256 before storage
- Plain key shown only once at generation
- Keys can be revoked instantly
- Optional expiration dates
- Granular permissions (`memory:write`, `skills:write`, etc.)

## Deployment

```
GitHub Repository
       │
       ▼
GitHub Actions (CI/CD)
       │
       ├──► Build Next.js ──► Cloudflare Pages
       │
       └──► Build Workers ──► Cloudflare Workers
```

The entire application deploys to Cloudflare's edge network, providing:
- Global low-latency access
- Automatic scaling
- DDoS protection
- Free SSL certificates


