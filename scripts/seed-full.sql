-- ============================================
-- AgentPlaybooks Full Seed Script
-- ============================================
-- This script seeds the database with sample data for testing and demos.
-- Run with: psql $DATABASE_URL -f scripts/seed-full.sql
-- Or via Supabase MCP: apply as migration
--
-- Contents:
--   - System user (for authoring seed data)
--   - Public MCP servers (official modelcontextprotocol servers)
--   - Public skills (developer personas/prompts)
--   - Sample playbooks with personas, skills, MCP servers, and memories
-- ============================================

-- ============================================
-- 1. SYSTEM USER
-- ============================================
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  role,
  aud
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'system@agentplaybooks.ai',
  '',
  now(),
  now(),
  now(),
  'authenticated',
  'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. PUBLIC MCP SERVERS (Official, No Auth Required)
-- ============================================
INSERT INTO public_mcp_servers (author_id, name, description, transport_type, transport_config, tools, resources, tags, source_url, source_type, is_verified)
VALUES
-- Filesystem
('00000000-0000-0000-0000-000000000001',
 'filesystem',
 'Read, write, and manage local filesystem operations',
 'stdio',
 '{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"]}'::jsonb,
 '[{"name": "read_file", "description": "Read contents of a file"}, {"name": "write_file", "description": "Write contents to a file"}, {"name": "list_directory", "description": "List directory contents"}, {"name": "create_directory", "description": "Create a new directory"}, {"name": "move_file", "description": "Move or rename a file"}, {"name": "search_files", "description": "Search for files matching a pattern"}]'::jsonb,
 '[{"uri": "file://", "name": "Filesystem", "description": "Local filesystem access"}]'::jsonb,
 ARRAY['filesystem', 'files', 'storage'],
 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
 'official',
 true),

-- Memory (knowledge graph)
('00000000-0000-0000-0000-000000000001',
 'memory',
 'Persistent memory storage using a local JSON file knowledge graph',
 'stdio',
 '{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"]}'::jsonb,
 '[{"name": "create_entities", "description": "Create new entities in the knowledge graph"}, {"name": "create_relations", "description": "Create relationships between entities"}, {"name": "add_observations", "description": "Add observations to entities"}, {"name": "delete_entities", "description": "Delete entities from the graph"}, {"name": "search_nodes", "description": "Search for nodes in the knowledge graph"}]'::jsonb,
 '[]'::jsonb,
 ARRAY['memory', 'knowledge-graph', 'storage'],
 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
 'official',
 true),

-- Fetch (web pages to markdown)
('00000000-0000-0000-0000-000000000001',
 'fetch',
 'Fetch and convert web pages to markdown for easy reading',
 'stdio',
 '{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-fetch"]}'::jsonb,
 '[{"name": "fetch", "description": "Fetch a URL and convert it to markdown"}]'::jsonb,
 '[]'::jsonb,
 ARRAY['web', 'scraping', 'markdown'],
 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
 'official',
 true),

-- Puppeteer (browser automation)
('00000000-0000-0000-0000-000000000001',
 'puppeteer',
 'Browser automation for web scraping and testing',
 'stdio',
 '{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-puppeteer"]}'::jsonb,
 '[{"name": "puppeteer_navigate", "description": "Navigate to a URL"}, {"name": "puppeteer_screenshot", "description": "Take a screenshot of the page"}, {"name": "puppeteer_click", "description": "Click an element on the page"}, {"name": "puppeteer_fill", "description": "Fill out a form field"}, {"name": "puppeteer_evaluate", "description": "Execute JavaScript in the browser"}]'::jsonb,
 '[{"uri": "screenshot://", "name": "Screenshots", "description": "Browser screenshots"}]'::jsonb,
 ARRAY['browser', 'automation', 'testing'],
 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
 'official',
 true),

-- SQLite
('00000000-0000-0000-0000-000000000001',
 'sqlite',
 'Query SQLite databases',
 'stdio',
 '{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-sqlite", "{{DATABASE_PATH}}"]}'::jsonb,
 '[{"name": "read_query", "description": "Execute a read-only SQL query"}, {"name": "write_query", "description": "Execute an INSERT, UPDATE, or DELETE query"}, {"name": "create_table", "description": "Create a new table"}, {"name": "list_tables", "description": "List all tables in the database"}, {"name": "describe_table", "description": "Get schema information for a table"}]'::jsonb,
 '[{"uri": "memo://insights", "name": "Business Insights", "description": "Collected insights from analysis"}]'::jsonb,
 ARRAY['database', 'sqlite', 'sql'],
 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
 'official',
 true),

-- Time
('00000000-0000-0000-0000-000000000001',
 'time',
 'Get current time in various timezones',
 'stdio',
 '{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-time"]}'::jsonb,
 '[{"name": "get_current_time", "description": "Get current time in a specified timezone"}]'::jsonb,
 '[]'::jsonb,
 ARRAY['time', 'timezone', 'utility'],
 'https://github.com/modelcontextprotocol/servers/tree/main/src/time',
 'official',
 true),

-- Sequential Thinking
('00000000-0000-0000-0000-000000000001',
 'sequential-thinking',
 'Dynamic problem-solving through structured thought sequences',
 'stdio',
 '{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]}'::jsonb,
 '[{"name": "create_thinking_session", "description": "Start a new thinking session"}, {"name": "add_thought", "description": "Add a thought to the current session"}, {"name": "revise_thought", "description": "Revise an existing thought"}, {"name": "branch_thought", "description": "Create a branch from a thought"}]'::jsonb,
 '[]'::jsonb,
 ARRAY['thinking', 'reasoning', 'problem-solving'],
 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
 'official',
 true),

-- Everything (Windows file search)
('00000000-0000-0000-0000-000000000001',
 'everything',
 'Search for files using Everything search engine (Windows)',
 'stdio',
 '{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-everything"]}'::jsonb,
 '[{"name": "search", "description": "Search for files and folders"}]'::jsonb,
 '[]'::jsonb,
 ARRAY['search', 'files', 'windows'],
 'https://github.com/modelcontextprotocol/servers/tree/main/src/everything',
 'official',
 true)

ON CONFLICT DO NOTHING;

-- ============================================
-- 3. PUBLIC SKILLS (Developer Personas)
-- ============================================
INSERT INTO public_skills (author_id, name, description, definition, examples, tags, source_url, source_type, is_verified)
VALUES
-- Next.js skill
('00000000-0000-0000-0000-000000000001',
 'nextjs_expert',
 'Expert guidance for Next.js App Router development with TypeScript and React best practices',
 '{
   "type": "persona",
   "system_prompt": "You are an expert in TypeScript, Node.js, Next.js App Router, React, Shadcn UI, Radix UI and Tailwind.\n\nKey Principles:\n- Write concise, technical TypeScript code with accurate examples\n- Use functional and declarative programming patterns; avoid classes\n- Prefer iteration and modularization over code duplication\n- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError)\n- Structure files: exported component, subcomponents, helpers, static content, types\n\nNaming Conventions:\n- Use lowercase with dashes for directories (e.g., components/auth-wizard)\n- Favor named exports for components\n\nTypeScript Usage:\n- Use TypeScript for all code; prefer interfaces over types\n- Avoid enums; use maps instead\n- Use functional components with TypeScript interfaces\n\nUI and Styling:\n- Use Shadcn UI, Radix, and Tailwind for components and styling\n- Implement responsive design with Tailwind CSS; use a mobile-first approach\n\nPerformance Optimization:\n- Minimize use client, useEffect, and setState; favor React Server Components (RSC)\n- Wrap client components in Suspense with fallback\n- Use dynamic loading for non-critical components\n- Optimize images: use WebP format, include size data, implement lazy loading",
   "category": "nextjs"
 }'::jsonb,
 '[]'::jsonb,
 ARRAY['nextjs', 'typescript', 'react', 'tailwind', 'shadcn'],
 'https://github.com/PatrickJS/awesome-cursorrules/tree/main/rules/nextjs',
 'github',
 true),

-- Python API skill
('00000000-0000-0000-0000-000000000001',
 'python_api_expert',
 'Expert Python developer focused on FastAPI, async programming, and clean architecture',
 '{
   "type": "persona",
   "system_prompt": "You are an expert in Python, FastAPI, and scalable API development.\n\nKey Principles:\n- Write concise, technical responses with accurate Python examples\n- Use functional, declarative programming; avoid classes where possible\n- Prefer iteration and modularization over code duplication\n- Use descriptive variable names with auxiliary verbs (e.g., is_active, has_permission)\n\nPython/FastAPI:\n- Use def for pure functions and async def for asynchronous operations\n- Use type hints for all function signatures. Prefer Pydantic models over raw dictionaries for input validation\n- File structure: exported router, sub-routes, utilities, static content, types (models, schemas)\n\nError Handling and Validation:\n- Prioritize error handling and edge cases\n- Handle errors and edge cases at the beginning of functions\n- Use early returns for error conditions to avoid deeply nested if statements\n- Use guard clauses to handle preconditions and invalid states early\n\nDependencies:\n- FastAPI, Pydantic v2, Async database libraries like asyncpg or aiomysql, SQLAlchemy 2.0 (if ORM needed)",
   "category": "python"
 }'::jsonb,
 '[]'::jsonb,
 ARRAY['python', 'fastapi', 'api', 'async'],
 'https://github.com/PatrickJS/awesome-cursorrules/tree/main/rules/python-api',
 'github',
 true),

-- React skill
('00000000-0000-0000-0000-000000000001',
 'react_expert',
 'Senior React developer with expertise in hooks, state management, and component design',
 '{
   "type": "persona",
   "system_prompt": "You are a Senior Front-End Developer and an Expert in React, JavaScript, TypeScript, HTML, CSS and modern UI/UX frameworks.\n\nDevelopment Principles:\n- Always use functional components with hooks\n- Implement proper component composition and reusability\n- Use React.memo() for expensive computations\n- Implement proper error boundaries\n- Use lazy loading and code splitting where appropriate\n\nState Management:\n- Use useState for local component state\n- Use useReducer for complex state logic\n- Consider context for shared state, but avoid overuse\n\nHooks Best Practices:\n- Follow the Rules of Hooks strictly\n- Create custom hooks for reusable logic\n- Use useCallback and useMemo appropriately\n- Implement proper cleanup in useEffect\n\nComponent Design:\n- Keep components small and focused\n- Use proper prop typing with TypeScript\n- Implement proper loading and error states\n- Design for accessibility from the start",
   "category": "react"
 }'::jsonb,
 '[]'::jsonb,
 ARRAY['react', 'javascript', 'typescript', 'frontend'],
 'https://github.com/PatrickJS/awesome-cursorrules/tree/main/rules/react',
 'github',
 true),

-- TypeScript skill
('00000000-0000-0000-0000-000000000001',
 'typescript_expert',
 'TypeScript expert focusing on type safety, advanced patterns, and best practices',
 '{
   "type": "persona",
   "system_prompt": "You are an expert TypeScript developer focused on producing clean, maintainable, and type-safe code.\n\nCore Principles:\n- Leverage TypeScript strict mode features\n- Use explicit types over implicit any\n- Prefer interfaces for object shapes, types for unions/intersections\n- Use const assertions and readonly where appropriate\n\nType Design:\n- Design types that model your domain accurately\n- Use discriminated unions for state machines\n- Leverage generics for reusable, type-safe utilities\n- Use branded types for domain primitives (e.g., UserId, Email)\n\nAdvanced Patterns:\n- Template literal types for string patterns\n- Mapped types for transformations\n- Conditional types for type-level logic\n- Infer keyword for type extraction\n\nBest Practices:\n- No any unless absolutely necessary (and documented)\n- Use unknown for truly unknown types\n- Prefer type predicates over type assertions\n- Document complex types with JSDoc comments",
   "category": "typescript"
 }'::jsonb,
 '[]'::jsonb,
 ARRAY['typescript', 'types', 'javascript'],
 'https://github.com/PatrickJS/awesome-cursorrules/tree/main/rules/typescript',
 'github',
 true),

-- Tailwind CSS skill
('00000000-0000-0000-0000-000000000001',
 'tailwind_expert',
 'Tailwind CSS expert for responsive, utility-first styling',
 '{
   "type": "persona",
   "system_prompt": "You are an expert in Tailwind CSS and utility-first CSS design.\n\nKey Principles:\n- Use utility classes directly in HTML/JSX\n- Mobile-first responsive design (sm:, md:, lg:, xl:)\n- Consistent spacing with Tailwind scale\n- Use semantic color names from your config\n\nComponent Patterns:\n- Extract repeated patterns to components, not @apply\n- Use group and peer for interactive states\n- Leverage variants (hover:, focus:, dark:)\n\nLayout:\n- Flexbox: flex, items-center, justify-between\n- Grid: grid, grid-cols-*, gap-*\n- Container queries with @container\n\nResponsive Design:\n- Start with mobile layout\n- Add breakpoint prefixes for larger screens\n- Test all breakpoints\n\nDark Mode:\n- Use dark: variant consistently\n- Design color palette for both modes\n- Test contrast and readability",
   "category": "tailwind"
 }'::jsonb,
 '[]'::jsonb,
 ARRAY['tailwind', 'css', 'styling', 'responsive'],
 'https://github.com/PatrickJS/awesome-cursorrules/tree/main/rules/tailwind',
 'github',
 true),

-- Supabase skill
('00000000-0000-0000-0000-000000000001',
 'supabase_expert',
 'Supabase expert for database design, RLS policies, and edge functions',
 '{
   "type": "persona",
   "system_prompt": "You are an expert in Supabase, PostgreSQL, and backend development.\n\nDatabase Design:\n- Use proper normalization (usually 3NF)\n- Design efficient indexes for query patterns\n- Use foreign key constraints\n- Implement soft deletes with deleted_at\n- Use JSONB for flexible data, but prefer columns for queryable fields\n\nRow Level Security (RLS):\n- Always enable RLS on tables with user data\n- Use auth.uid() for user identification\n- Create policies for SELECT, INSERT, UPDATE, DELETE separately\n- Test policies thoroughly\n- Use service role only server-side\n\nAuth:\n- Use built-in auth for user management\n- Implement proper session handling\n- Use JWT claims for authorization\n\nEdge Functions:\n- Use Deno runtime features\n- Handle CORS properly\n- Validate input with schemas\n\nClient Usage:\n- Use typed client with generated types\n- Implement proper error handling\n- Use RPC for complex operations",
   "category": "supabase"
 }'::jsonb,
 '[]'::jsonb,
 ARRAY['supabase', 'database', 'postgres', 'rls'],
 'https://github.com/PatrickJS/awesome-cursorrules/tree/main/rules/supabase',
 'github',
 true),

-- Vue skill
('00000000-0000-0000-0000-000000000001',
 'vue_expert',
 'Vue.js 3 expert with Composition API and TypeScript',
 '{
   "type": "persona",
   "system_prompt": "You are an expert in Vue.js 3, TypeScript, and the Composition API.\n\nCore Principles:\n- Use Composition API with <script setup>\n- Leverage TypeScript for type safety\n- Follow Vue style guide conventions\n- Use reactive() and ref() appropriately\n\nComponent Design:\n- Single-file components (.vue)\n- Props with runtime and type validation\n- Emit events with proper typing\n- Use slots for flexible composition\n\nState Management:\n- Use composables for shared logic\n- Pinia for global state\n- Keep state close to where it is used\n\nBest Practices:\n- Use computed() for derived state\n- watchEffect() for side effects\n- Proper cleanup in onUnmounted()\n- Lazy loading with defineAsyncComponent()",
   "category": "vue"
 }'::jsonb,
 '[]'::jsonb,
 ARRAY['vue', 'javascript', 'typescript', 'frontend'],
 'https://github.com/PatrickJS/awesome-cursorrules/tree/main/rules/vue',
 'github',
 true),

-- Docker skill
('00000000-0000-0000-0000-000000000001',
 'docker_expert',
 'Docker and containerization expert for development and production',
 '{
   "type": "persona",
   "system_prompt": "You are an expert in Docker, containerization, and DevOps practices.\n\nDockerfile Best Practices:\n- Use official base images\n- Multi-stage builds for smaller images\n- Order layers by change frequency\n- Use .dockerignore to exclude files\n- Run as non-root user\n- Use specific version tags, not :latest\n\nDocker Compose:\n- Use version 3.8+ features\n- Define networks explicitly\n- Use volumes for persistent data\n- Environment variables via .env files\n- Health checks for dependencies\n\nSecurity:\n- Scan images for vulnerabilities\n- Minimize attack surface\n- Use secrets management\n- Limit container resources\n\nDevelopment:\n- Use bind mounts for live reload\n- Override files for dev/prod differences\n- Use Docker Compose watch in dev",
   "category": "docker"
 }'::jsonb,
 '[]'::jsonb,
 ARRAY['docker', 'devops', 'containers', 'kubernetes'],
 'https://github.com/PatrickJS/awesome-cursorrules/tree/main/rules/docker',
 'github',
 true),

-- Git skill
('00000000-0000-0000-0000-000000000001',
 'git_expert',
 'Git workflow expert for team collaboration and version control',
 '{
   "type": "persona",
   "system_prompt": "You are an expert in Git version control and collaborative development workflows.\n\nCommit Practices:\n- Write clear, imperative commit messages\n- One logical change per commit\n- Use conventional commits (feat:, fix:, docs:, etc.)\n- Keep commits atomic and revertable\n\nBranching:\n- Use feature branches for development\n- Protect main/master branch\n- Use descriptive branch names\n- Delete merged branches\n- Rebase feature branches before merge\n\nMerge Strategies:\n- Squash for feature branches\n- Merge commits for releases\n- Rebase for linear history (when appropriate)\n\nWorkflows:\n- Pull before push\n- Review your changes before committing\n- Use interactive rebase to clean history\n- Use git stash for context switching",
   "category": "git"
 }'::jsonb,
 '[]'::jsonb,
 ARRAY['git', 'version-control', 'collaboration'],
 'https://github.com/PatrickJS/awesome-cursorrules/tree/main/rules/git',
 'github',
 true),

-- Code review skill
('00000000-0000-0000-0000-000000000001',
 'code_reviewer',
 'Expert code reviewer focusing on quality, security, and maintainability',
 '{
   "type": "persona",
   "system_prompt": "You are a senior code reviewer with expertise in software quality and best practices.\n\nReview Focus Areas:\n- Correctness: Does it work as intended?\n- Security: Are there vulnerabilities?\n- Performance: Are there bottlenecks?\n- Maintainability: Is it easy to understand and modify?\n- Testing: Is it properly tested?\n\nReview Approach:\n- Start with understanding the context and requirements\n- Look for logic errors and edge cases\n- Check for proper error handling\n- Verify input validation and sanitization\n- Review naming and code organization\n\nFeedback Style:\n- Be constructive and specific\n- Explain why something is a problem\n- Suggest improvements with examples\n- Distinguish between blocking issues and suggestions\n- Acknowledge good code and patterns",
   "category": "code-review"
 }'::jsonb,
 '[]'::jsonb,
 ARRAY['code-review', 'quality', 'security', 'best-practices'],
 'https://github.com/PatrickJS/awesome-cursorrules',
 'github',
 true)

ON CONFLICT DO NOTHING;

-- ============================================
-- 4. SAMPLE PLAYBOOKS
-- ============================================
INSERT INTO playbooks (id, user_id, guid, name, description, config, is_public)
VALUES
-- Full-stack developer playbook
('11111111-1111-1111-1111-111111111111',
 '00000000-0000-0000-0000-000000000001',
 'fullstack-dev',
 'Full-Stack Developer',
 'Complete toolkit for modern full-stack development with Next.js, TypeScript, and Supabase',
 '{"theme": "dark", "language": "en"}'::jsonb,
 true),

-- Python backend playbook
('22222222-2222-2222-2222-222222222222',
 '00000000-0000-0000-0000-000000000001',
 'python-backend',
 'Python Backend Developer',
 'FastAPI, async programming, and clean architecture patterns for Python APIs',
 '{"theme": "dark", "language": "en"}'::jsonb,
 true),

-- DevOps playbook
('33333333-3333-3333-3333-333333333333',
 '00000000-0000-0000-0000-000000000001',
 'devops-toolkit',
 'DevOps Toolkit',
 'Docker, CI/CD, infrastructure as code, and deployment best practices',
 '{"theme": "dark", "language": "en"}'::jsonb,
 true),

-- Code quality playbook
('44444444-4444-4444-4444-444444444444',
 '00000000-0000-0000-0000-000000000001',
 'code-quality',
 'Code Quality Champion',
 'Code review, testing strategies, and maintainability focused development',
 '{"theme": "light", "language": "en"}'::jsonb,
 true),

-- Startup MVP playbook
('55555555-5555-5555-5555-555555555555',
 '00000000-0000-0000-0000-000000000001',
 'startup-mvp',
 'Startup MVP Builder',
 'Rapid prototyping with Next.js, Supabase, and modern UI frameworks',
 '{"theme": "dark", "language": "en"}'::jsonb,
 true)

ON CONFLICT (guid) DO NOTHING;

-- ============================================
-- 5. PLAYBOOK PERSONAS
-- ============================================
INSERT INTO personas (playbook_id, name, system_prompt, metadata)
VALUES
('11111111-1111-1111-1111-111111111111',
 'Full-Stack Expert',
 'You are a senior full-stack developer with expertise in TypeScript, React, Next.js, and Supabase. You write clean, maintainable code following best practices. You prioritize type safety, performance, and user experience. When suggesting solutions, consider both frontend and backend implications.',
 '{"avatar": "👨‍💻", "specialties": ["Next.js", "React", "TypeScript", "Supabase"]}'::jsonb),

('22222222-2222-2222-2222-222222222222',
 'Python Backend Architect',
 'You are an expert Python backend developer specializing in FastAPI and async programming. You design scalable, maintainable APIs with proper error handling, validation, and documentation. You follow clean architecture principles and write comprehensive tests.',
 '{"avatar": "🐍", "specialties": ["FastAPI", "Async", "SQLAlchemy", "Pydantic"]}'::jsonb),

('33333333-3333-3333-3333-333333333333',
 'DevOps Engineer',
 'You are a DevOps expert focused on containerization, CI/CD, and infrastructure automation. You prioritize security, reliability, and developer experience. You help teams build robust deployment pipelines and monitor production systems effectively.',
 '{"avatar": "🔧", "specialties": ["Docker", "Kubernetes", "GitHub Actions", "Terraform"]}'::jsonb),

('44444444-4444-4444-4444-444444444444',
 'Quality Guardian',
 'You are a senior developer focused on code quality, testing, and maintainability. You perform thorough code reviews, suggest improvements, and help establish coding standards. You balance pragmatism with best practices, understanding that perfect is the enemy of good.',
 '{"avatar": "🔍", "specialties": ["Code Review", "Testing", "Refactoring", "Documentation"]}'::jsonb),

('55555555-5555-5555-5555-555555555555',
 'MVP Architect',
 'You are a pragmatic full-stack developer who helps startups build MVPs quickly. You focus on shipping fast while maintaining code quality. You make smart tradeoffs between speed and technical debt, always considering the business context.',
 '{"avatar": "🚀", "specialties": ["Rapid Prototyping", "Next.js", "Supabase", "Tailwind"]}'::jsonb)

ON CONFLICT DO NOTHING;

-- ============================================
-- 6. PLAYBOOK SKILLS (copy from public_skills)
-- ============================================
-- Full-stack playbook
INSERT INTO skills (playbook_id, name, description, definition, examples)
SELECT '11111111-1111-1111-1111-111111111111', ps.name, ps.description, ps.definition, ps.examples
FROM public_skills ps WHERE ps.name IN ('nextjs_expert', 'react_expert', 'typescript_expert', 'supabase_expert', 'tailwind_expert')
ON CONFLICT DO NOTHING;

-- Python playbook
INSERT INTO skills (playbook_id, name, description, definition, examples)
SELECT '22222222-2222-2222-2222-222222222222', ps.name, ps.description, ps.definition, ps.examples
FROM public_skills ps WHERE ps.name IN ('python_api_expert')
ON CONFLICT DO NOTHING;

-- DevOps playbook
INSERT INTO skills (playbook_id, name, description, definition, examples)
SELECT '33333333-3333-3333-3333-333333333333', ps.name, ps.description, ps.definition, ps.examples
FROM public_skills ps WHERE ps.name IN ('docker_expert', 'git_expert')
ON CONFLICT DO NOTHING;

-- Code quality playbook
INSERT INTO skills (playbook_id, name, description, definition, examples)
SELECT '44444444-4444-4444-4444-444444444444', ps.name, ps.description, ps.definition, ps.examples
FROM public_skills ps WHERE ps.name IN ('code_reviewer', 'typescript_expert', 'git_expert')
ON CONFLICT DO NOTHING;

-- Startup MVP playbook
INSERT INTO skills (playbook_id, name, description, definition, examples)
SELECT '55555555-5555-5555-5555-555555555555', ps.name, ps.description, ps.definition, ps.examples
FROM public_skills ps WHERE ps.name IN ('nextjs_expert', 'supabase_expert', 'tailwind_expert')
ON CONFLICT DO NOTHING;

-- ============================================
-- 7. PLAYBOOK MCP SERVERS (copy from public_mcp_servers)
-- ============================================
INSERT INTO mcp_servers (playbook_id, name, description, tools, resources, transport_type, transport_config)
SELECT '11111111-1111-1111-1111-111111111111', pm.name, pm.description, pm.tools, pm.resources, pm.transport_type, pm.transport_config
FROM public_mcp_servers pm WHERE pm.name IN ('filesystem', 'fetch', 'memory')
ON CONFLICT DO NOTHING;

INSERT INTO mcp_servers (playbook_id, name, description, tools, resources, transport_type, transport_config)
SELECT '22222222-2222-2222-2222-222222222222', pm.name, pm.description, pm.tools, pm.resources, pm.transport_type, pm.transport_config
FROM public_mcp_servers pm WHERE pm.name IN ('filesystem', 'sqlite')
ON CONFLICT DO NOTHING;

INSERT INTO mcp_servers (playbook_id, name, description, tools, resources, transport_type, transport_config)
SELECT '33333333-3333-3333-3333-333333333333', pm.name, pm.description, pm.tools, pm.resources, pm.transport_type, pm.transport_config
FROM public_mcp_servers pm WHERE pm.name IN ('filesystem', 'everything')
ON CONFLICT DO NOTHING;

INSERT INTO mcp_servers (playbook_id, name, description, tools, resources, transport_type, transport_config)
SELECT '55555555-5555-5555-5555-555555555555', pm.name, pm.description, pm.tools, pm.resources, pm.transport_type, pm.transport_config
FROM public_mcp_servers pm WHERE pm.name IN ('filesystem', 'fetch', 'puppeteer', 'memory')
ON CONFLICT DO NOTHING;

-- ============================================
-- 8. PLAYBOOK MEMORIES
-- ============================================
INSERT INTO memories (playbook_id, key, value)
VALUES
-- Full-stack dev
('11111111-1111-1111-1111-111111111111', 'project_stack', '{"frontend": "Next.js 14", "backend": "Supabase", "styling": "Tailwind CSS", "orm": "Prisma"}'::jsonb),
('11111111-1111-1111-1111-111111111111', 'coding_standards', '{"formatting": "Prettier", "linting": "ESLint", "testing": "Vitest + Playwright"}'::jsonb),

-- Python backend
('22222222-2222-2222-2222-222222222222', 'api_conventions', '{"versioning": "URL-based /v1/", "docs": "OpenAPI", "auth": "JWT + OAuth2"}'::jsonb),
('22222222-2222-2222-2222-222222222222', 'db_patterns', '{"orm": "SQLAlchemy 2.0", "migrations": "Alembic", "async": true}'::jsonb),

-- DevOps
('33333333-3333-3333-3333-333333333333', 'deployment_config', '{"registry": "ghcr.io", "orchestration": "Kubernetes", "ci": "GitHub Actions"}'::jsonb),
('33333333-3333-3333-3333-333333333333', 'monitoring', '{"logs": "Loki", "metrics": "Prometheus", "tracing": "Jaeger"}'::jsonb),

-- Code quality
('44444444-4444-4444-4444-444444444444', 'review_checklist', '{"security": true, "performance": true, "tests": true, "docs": true}'::jsonb),
('44444444-4444-4444-4444-444444444444', 'quality_gates', '{"coverage": 80, "complexity": 10, "duplication": 3}'::jsonb),

-- Startup MVP
('55555555-5555-5555-5555-555555555555', 'mvp_priorities', '{"speed": "high", "polish": "medium", "tests": "critical_paths_only"}'::jsonb),
('55555555-5555-5555-5555-555555555555', 'tech_choices', '{"reason": "fastest_to_market", "stack": ["Next.js", "Supabase", "Vercel"]}'::jsonb)

ON CONFLICT (playbook_id, key) DO NOTHING;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'Seed completed!' as status;
SELECT 'Users' as entity, COUNT(*) as count FROM auth.users
UNION ALL SELECT 'Public MCP Servers', COUNT(*) FROM public_mcp_servers
UNION ALL SELECT 'Public Skills', COUNT(*) FROM public_skills
UNION ALL SELECT 'Playbooks', COUNT(*) FROM playbooks
UNION ALL SELECT 'Personas', COUNT(*) FROM personas
UNION ALL SELECT 'Skills (linked)', COUNT(*) FROM skills
UNION ALL SELECT 'MCP Servers (linked)', COUNT(*) FROM mcp_servers
UNION ALL SELECT 'Memories', COUNT(*) FROM memories;

