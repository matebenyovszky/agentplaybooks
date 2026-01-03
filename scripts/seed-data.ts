/**
 * Seed Script for AgentPlaybooks
 * 
 * This script fetches sample skills from the awesome-cursorrules GitHub repo
 * and sample MCP servers from the official modelcontextprotocol/servers repo.
 * 
 * Usage:
 *   npx ts-node scripts/seed-data.ts
 *   
 * Environment variables:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (for bypassing RLS)
 *   GITHUB_TOKEN (optional) - GitHub token for higher rate limits
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================
// Configuration
// ============================================

const CONFIG = {
  // GitHub repos to fetch from
  cursorrules_repo: 'PatrickJS/awesome-cursorrules',
  mcp_servers_repo: 'modelcontextprotocol/servers',
  
  // Text replacements for generalizing skills
  text_replacements: [
    { from: /\bclaude\b/gi, to: 'agent' },
    { from: /\bClaude\b/g, to: 'Agent' },
    { from: /\bCLAUDE\b/g, to: 'AGENT' },
    { from: /\banthropic\b/gi, to: 'AI provider' },
    { from: /\bAnthropic\b/g, to: 'AI Provider' },
  ],
  
  // Skip patterns - files/dirs to ignore
  skip_patterns: [
    /node_modules/,
    /\.git/,
    /test/i,
    /example/i,
    /demo/i,
  ],
  
  // Max items per category to avoid overwhelming the DB
  max_skills_per_category: 5,
  max_mcp_servers: 20,
};

// ============================================
// Types
// ============================================

interface GitHubContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url?: string;
  sha: string;
}

interface ParsedSkill {
  name: string;
  description: string;
  system_prompt: string;
  category: string;
  source_url: string;
  tags: string[];
}

interface ParsedMcpServer {
  name: string;
  description: string;
  transport_type: 'stdio' | 'http' | 'sse';
  transport_config: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  };
  tools: Array<{
    name: string;
    description: string;
    inputSchema?: object;
  }>;
  resources: Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }>;
  source_url: string;
  tags: string[];
  requires_auth: boolean;
}

// ============================================
// GitHub API Helpers
// ============================================

async function fetchGitHubApi(path: string, token?: string): Promise<any> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'AgentPlaybooks-Seed-Script',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`https://api.github.com${path}`, { headers });
  
  if (!response.ok) {
    if (response.status === 403) {
      console.warn('⚠️  GitHub rate limit hit. Consider using GITHUB_TOKEN.');
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function fetchGitHubRaw(url: string, token?: string): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent': 'AgentPlaybooks-Seed-Script',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch raw content: ${response.status}`);
  }
  
  return response.text();
}

async function listGitHubDir(repo: string, path: string = '', token?: string): Promise<GitHubContent[]> {
  return fetchGitHubApi(`/repos/${repo}/contents/${path}`, token);
}

// ============================================
// Text Processing
// ============================================

function applyTextReplacements(text: string): string {
  let result = text;
  for (const { from, to } of CONFIG.text_replacements) {
    result = result.replace(from, to);
  }
  return result;
}

function extractCategoryFromPath(path: string): string {
  // Extract category from path like "rules/nextjs-app/..." -> "nextjs"
  const parts = path.split('/');
  if (parts.length >= 2) {
    const categoryPart = parts[1]; // First subdir
    // Clean up category name
    return categoryPart
      .replace(/-cursorrules.*$/i, '')
      .replace(/-prompt-file$/i, '')
      .replace(/-rules$/i, '')
      .replace(/-/g, ' ')
      .trim();
  }
  return 'general';
}

function extractTagsFromContent(content: string): string[] {
  const tags: string[] = [];
  const lowerContent = content.toLowerCase();
  
  // Language/framework detection
  const detections = [
    { keywords: ['typescript', 'tsx', '.ts'], tag: 'typescript' },
    { keywords: ['javascript', 'jsx', '.js'], tag: 'javascript' },
    { keywords: ['python', '.py', 'pip', 'poetry'], tag: 'python' },
    { keywords: ['react', 'jsx', 'usestate', 'useeffect'], tag: 'react' },
    { keywords: ['nextjs', 'next.js', 'app router'], tag: 'nextjs' },
    { keywords: ['vue', 'vuejs', 'vue.js'], tag: 'vue' },
    { keywords: ['angular', 'ng-'], tag: 'angular' },
    { keywords: ['svelte'], tag: 'svelte' },
    { keywords: ['tailwind', 'tailwindcss'], tag: 'tailwind' },
    { keywords: ['nodejs', 'node.js', 'express'], tag: 'nodejs' },
    { keywords: ['rust', 'cargo', '.rs'], tag: 'rust' },
    { keywords: ['golang', 'go ', '.go'], tag: 'go' },
    { keywords: ['docker', 'dockerfile', 'container'], tag: 'docker' },
    { keywords: ['kubernetes', 'k8s'], tag: 'kubernetes' },
    { keywords: ['api', 'rest', 'graphql'], tag: 'api' },
    { keywords: ['test', 'testing', 'jest', 'vitest'], tag: 'testing' },
    { keywords: ['database', 'sql', 'postgres', 'mysql'], tag: 'database' },
    { keywords: ['supabase'], tag: 'supabase' },
    { keywords: ['firebase'], tag: 'firebase' },
  ];
  
  for (const { keywords, tag } of detections) {
    if (keywords.some(kw => lowerContent.includes(kw))) {
      tags.push(tag);
    }
  }
  
  return [...new Set(tags)]; // Dedupe
}

function generateSkillName(category: string, index: number): string {
  return `${category.replace(/\s+/g, '_')}_skill_${index}`;
}

function extractDescription(content: string): string {
  // Try to extract first paragraph or first meaningful line
  const lines = content.split('\n').filter(l => l.trim());
  
  // Look for a description-like line
  for (const line of lines.slice(0, 10)) {
    const trimmed = line.trim();
    // Skip headers, code markers, etc.
    if (trimmed.startsWith('#') || trimmed.startsWith('```') || trimmed.startsWith('//')) {
      continue;
    }
    // Skip very short lines
    if (trimmed.length < 20) continue;
    // Skip lines that look like code
    if (trimmed.includes('{') || trimmed.includes('=') || trimmed.includes('function')) {
      continue;
    }
    
    // Found a good description line
    return trimmed.slice(0, 200) + (trimmed.length > 200 ? '...' : '');
  }
  
  // Fallback: first 100 chars
  return content.slice(0, 100).replace(/\n/g, ' ').trim() + '...';
}

// ============================================
// Skill Parsing (from awesome-cursorrules)
// ============================================

async function fetchCursorRulesSkills(token?: string): Promise<ParsedSkill[]> {
  console.log('📦 Fetching cursor rules from GitHub...');
  const skills: ParsedSkill[] = [];
  const categoryCount: Record<string, number> = {};
  
  try {
    // Get the rules directory
    const rulesDir = await listGitHubDir(CONFIG.cursorrules_repo, 'rules', token);
    
    for (const item of rulesDir) {
      if (item.type !== 'dir') continue;
      
      const category = extractCategoryFromPath(`rules/${item.name}`);
      categoryCount[category] = categoryCount[category] || 0;
      
      // Skip if we've hit max for this category
      if (categoryCount[category] >= CONFIG.max_skills_per_category) continue;
      
      // Look for .cursorrules file in this directory
      try {
        const subdir = await listGitHubDir(CONFIG.cursorrules_repo, item.path, token);
        
        for (const subitem of subdir) {
          if (subitem.type === 'dir') {
            // Go one level deeper
            const deepdir = await listGitHubDir(CONFIG.cursorrules_repo, subitem.path, token);
            for (const deepitem of deepdir) {
              if (deepitem.name === '.cursorrules' && deepitem.download_url) {
                const content = await fetchGitHubRaw(deepitem.download_url, token);
                const processedContent = applyTextReplacements(content);
                
                skills.push({
                  name: generateSkillName(category, categoryCount[category]),
                  description: extractDescription(processedContent),
                  system_prompt: processedContent,
                  category,
                  source_url: `https://github.com/${CONFIG.cursorrules_repo}/blob/main/${deepitem.path}`,
                  tags: extractTagsFromContent(processedContent),
                });
                
                categoryCount[category]++;
                console.log(`  ✓ Loaded: ${category} (${categoryCount[category]})`);
                
                if (categoryCount[category] >= CONFIG.max_skills_per_category) break;
              }
            }
          } else if (subitem.name === '.cursorrules' && subitem.download_url) {
            const content = await fetchGitHubRaw(subitem.download_url, token);
            const processedContent = applyTextReplacements(content);
            
            skills.push({
              name: generateSkillName(category, categoryCount[category]),
              description: extractDescription(processedContent),
              system_prompt: processedContent,
              category,
              source_url: `https://github.com/${CONFIG.cursorrules_repo}/blob/main/${subitem.path}`,
              tags: extractTagsFromContent(processedContent),
            });
            
            categoryCount[category]++;
            console.log(`  ✓ Loaded: ${category} (${categoryCount[category]})`);
          }
          
          if (categoryCount[category] >= CONFIG.max_skills_per_category) break;
        }
      } catch (err) {
        console.warn(`  ⚠ Skipped ${item.name}: ${(err as Error).message}`);
      }
      
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 100));
    }
  } catch (err) {
    console.error('Failed to fetch cursor rules:', err);
  }
  
  console.log(`📦 Loaded ${skills.length} skills from ${Object.keys(categoryCount).length} categories`);
  return skills;
}

// ============================================
// MCP Server Parsing (from official repo + known public servers)
// ============================================

// Known public MCP servers that don't require authentication
const KNOWN_PUBLIC_MCP_SERVERS: ParsedMcpServer[] = [
  {
    name: 'filesystem',
    description: 'Read, write, and manage local filesystem operations',
    transport_type: 'stdio',
    transport_config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/workspace'],
    },
    tools: [
      { name: 'read_file', description: 'Read contents of a file' },
      { name: 'write_file', description: 'Write contents to a file' },
      { name: 'list_directory', description: 'List directory contents' },
      { name: 'create_directory', description: 'Create a new directory' },
      { name: 'move_file', description: 'Move or rename a file' },
      { name: 'search_files', description: 'Search for files matching a pattern' },
      { name: 'get_file_info', description: 'Get file metadata' },
    ],
    resources: [
      { uri: 'file://', name: 'Filesystem', description: 'Local filesystem access', mimeType: 'application/octet-stream' },
    ],
    source_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    tags: ['filesystem', 'files', 'storage'],
    requires_auth: false,
  },
  {
    name: 'memory',
    description: 'Persistent memory storage using a local JSON file knowledge graph',
    transport_type: 'stdio',
    transport_config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
    tools: [
      { name: 'create_entities', description: 'Create new entities in the knowledge graph' },
      { name: 'create_relations', description: 'Create relationships between entities' },
      { name: 'add_observations', description: 'Add observations to entities' },
      { name: 'delete_entities', description: 'Delete entities from the graph' },
      { name: 'delete_observations', description: 'Delete observations from entities' },
      { name: 'delete_relations', description: 'Delete relationships' },
      { name: 'search_nodes', description: 'Search for nodes in the knowledge graph' },
      { name: 'open_nodes', description: 'Open specific nodes by name' },
    ],
    resources: [],
    source_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    tags: ['memory', 'knowledge-graph', 'storage'],
    requires_auth: false,
  },
  {
    name: 'brave-search',
    description: 'Web search capabilities via Brave Search API',
    transport_type: 'stdio',
    transport_config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: { 'BRAVE_API_KEY': '{{BRAVE_API_KEY}}' },
    },
    tools: [
      { name: 'brave_web_search', description: 'Search the web using Brave Search' },
      { name: 'brave_local_search', description: 'Search for local businesses and places' },
    ],
    resources: [],
    source_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    tags: ['search', 'web', 'brave'],
    requires_auth: true,
  },
  {
    name: 'fetch',
    description: 'Fetch and convert web pages to markdown for easy reading',
    transport_type: 'stdio',
    transport_config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
    },
    tools: [
      { name: 'fetch', description: 'Fetch a URL and convert it to markdown' },
    ],
    resources: [],
    source_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    tags: ['web', 'scraping', 'markdown'],
    requires_auth: false,
  },
  {
    name: 'puppeteer',
    description: 'Browser automation for web scraping and testing',
    transport_type: 'stdio',
    transport_config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    },
    tools: [
      { name: 'puppeteer_navigate', description: 'Navigate to a URL' },
      { name: 'puppeteer_screenshot', description: 'Take a screenshot of the page' },
      { name: 'puppeteer_click', description: 'Click an element on the page' },
      { name: 'puppeteer_fill', description: 'Fill out a form field' },
      { name: 'puppeteer_select', description: 'Select an option from a dropdown' },
      { name: 'puppeteer_hover', description: 'Hover over an element' },
      { name: 'puppeteer_evaluate', description: 'Execute JavaScript in the browser' },
    ],
    resources: [
      { uri: 'screenshot://', name: 'Screenshots', description: 'Browser screenshots', mimeType: 'image/png' },
    ],
    source_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
    tags: ['browser', 'automation', 'testing'],
    requires_auth: false,
  },
  {
    name: 'postgres',
    description: 'Query PostgreSQL databases with read-only access',
    transport_type: 'stdio',
    transport_config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', '{{POSTGRES_URL}}'],
    },
    tools: [
      { name: 'query', description: 'Execute a read-only SQL query' },
    ],
    resources: [
      { uri: 'postgres://schema', name: 'Schema', description: 'Database schema information', mimeType: 'application/json' },
    ],
    source_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    tags: ['database', 'postgres', 'sql'],
    requires_auth: true,
  },
  {
    name: 'sqlite',
    description: 'Query SQLite databases',
    transport_type: 'stdio',
    transport_config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '{{DATABASE_PATH}}'],
    },
    tools: [
      { name: 'read_query', description: 'Execute a read-only SQL query' },
      { name: 'write_query', description: 'Execute an INSERT, UPDATE, or DELETE query' },
      { name: 'create_table', description: 'Create a new table' },
      { name: 'list_tables', description: 'List all tables in the database' },
      { name: 'describe_table', description: 'Get schema information for a table' },
      { name: 'append_insight', description: 'Add a business insight to the memo' },
    ],
    resources: [
      { uri: 'memo://insights', name: 'Business Insights', description: 'Collected insights from analysis', mimeType: 'text/plain' },
    ],
    source_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
    tags: ['database', 'sqlite', 'sql'],
    requires_auth: false,
  },
  {
    name: 'time',
    description: 'Get current time in various timezones',
    transport_type: 'stdio',
    transport_config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-time'],
    },
    tools: [
      { name: 'get_current_time', description: 'Get current time in a specified timezone' },
    ],
    resources: [],
    source_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/time',
    tags: ['time', 'timezone', 'utility'],
    requires_auth: false,
  },
  {
    name: 'sequential-thinking',
    description: 'Dynamic problem-solving through structured thought sequences',
    transport_type: 'stdio',
    transport_config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
    tools: [
      { name: 'create_thinking_session', description: 'Start a new thinking session' },
      { name: 'add_thought', description: 'Add a thought to the current session' },
      { name: 'revise_thought', description: 'Revise an existing thought' },
      { name: 'branch_thought', description: 'Create a branch from a thought' },
      { name: 'get_session_summary', description: 'Get a summary of the thinking session' },
    ],
    resources: [],
    source_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    tags: ['thinking', 'reasoning', 'problem-solving'],
    requires_auth: false,
  },
  {
    name: 'everything',
    description: 'Search for files using Everything search engine (Windows)',
    transport_type: 'stdio',
    transport_config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
    },
    tools: [
      { name: 'search', description: 'Search for files and folders' },
    ],
    resources: [],
    source_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/everything',
    tags: ['search', 'files', 'windows'],
    requires_auth: false,
  },
];

async function fetchMcpServers(token?: string): Promise<ParsedMcpServer[]> {
  console.log('🔌 Loading MCP server definitions...');
  
  // For now, use our curated list
  // In the future, we could also parse the modelcontextprotocol/servers README
  const servers = KNOWN_PUBLIC_MCP_SERVERS.filter(s => !s.requires_auth);
  
  console.log(`🔌 Loaded ${servers.length} public MCP servers (no auth required)`);
  console.log(`   (${KNOWN_PUBLIC_MCP_SERVERS.length - servers.length} servers require authentication)`);
  
  return servers;
}

// ============================================
// Database Operations
// ============================================

async function insertSkills(supabase: SupabaseClient, skills: ParsedSkill[], systemUserId: string): Promise<void> {
  console.log('💾 Inserting skills into database...');
  
  for (const skill of skills) {
    try {
      // Create as public_skill
      const { error } = await supabase.from('public_skills').insert({
        author_id: systemUserId,
        name: skill.name,
        description: skill.description,
        definition: {
          type: 'persona', // This is a persona/system prompt style skill
          system_prompt: skill.system_prompt,
          category: skill.category,
        },
        examples: [],
        tags: skill.tags,
        source_url: skill.source_url,
        source_type: 'github',
        is_verified: false,
      });
      
      if (error) {
        // Might be duplicate
        if (error.code === '23505') {
          console.log(`  - Skipped (exists): ${skill.name}`);
        } else {
          console.warn(`  ⚠ Failed: ${skill.name} - ${error.message}`);
        }
      } else {
        console.log(`  ✓ Inserted: ${skill.name}`);
      }
    } catch (err) {
      console.error(`  ✗ Error inserting ${skill.name}:`, err);
    }
  }
}

async function insertMcpServers(supabase: SupabaseClient, servers: ParsedMcpServer[], systemUserId: string): Promise<void> {
  console.log('💾 Inserting MCP servers into database...');
  
  for (const server of servers) {
    try {
      const { error } = await supabase.from('public_mcp_servers').insert({
        author_id: systemUserId,
        name: server.name,
        description: server.description,
        transport_type: server.transport_type,
        transport_config: server.transport_config,
        tools: server.tools,
        resources: server.resources,
        tags: server.tags,
        source_url: server.source_url,
        source_type: 'official',
        is_verified: true, // Official MCP servers are verified
      });
      
      if (error) {
        if (error.code === '23505') {
          console.log(`  - Skipped (exists): ${server.name}`);
        } else {
          console.warn(`  ⚠ Failed: ${server.name} - ${error.message}`);
        }
      } else {
        console.log(`  ✓ Inserted: ${server.name}`);
      }
    } catch (err) {
      console.error(`  ✗ Error inserting ${server.name}:`, err);
    }
  }
}

async function getOrCreateSystemUser(supabase: SupabaseClient): Promise<string> {
  // In a real scenario, you'd have a dedicated system user
  // For seeding, we'll use a fixed UUID that represents "system"
  const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
  
  // Note: This user should be created in auth.users first
  // For local dev, you might need to manually insert this user
  console.log(`📌 Using system user ID: ${SYSTEM_USER_ID}`);
  
  return SYSTEM_USER_ID;
}

// ============================================
// Main Entry Point
// ============================================

async function main() {
  console.log('🚀 AgentPlaybooks Seed Script\n');
  console.log('='.repeat(50));
  
  // Get environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   SUPABASE_URL');
    console.error('   SUPABASE_SERVICE_ROLE_KEY');
    console.error('\nSet these and try again.');
    process.exit(1);
  }
  
  // Create Supabase client with service role key (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  // Get system user ID
  const systemUserId = await getOrCreateSystemUser(supabase);
  
  console.log('\n📦 Phase 1: Fetching Skills from awesome-cursorrules...\n');
  const skills = await fetchCursorRulesSkills(githubToken);
  
  console.log('\n🔌 Phase 2: Loading MCP Server definitions...\n');
  const mcpServers = await fetchMcpServers(githubToken);
  
  console.log('\n💾 Phase 3: Inserting into database...\n');
  await insertSkills(supabase, skills, systemUserId);
  await insertMcpServers(supabase, mcpServers, systemUserId);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Seed completed!');
  console.log(`   - ${skills.length} skills loaded`);
  console.log(`   - ${mcpServers.length} MCP servers loaded`);
  console.log('='.repeat(50));
}

// Run if executed directly
main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});


