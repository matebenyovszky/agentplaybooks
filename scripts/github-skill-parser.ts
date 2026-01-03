/**
 * GitHub Skill Parser
 * 
 * Utility functions for parsing cursor rules / skills from GitHub repositories.
 * Can be used standalone or imported by other scripts.
 * 
 * Usage as CLI:
 *   npx tsx scripts/github-skill-parser.ts <github-url>
 *   npx tsx scripts/github-skill-parser.ts https://github.com/PatrickJS/awesome-cursorrules/blob/main/rules/nextjs/.cursorrules
 */

// ============================================
// Types
// ============================================

export interface GitHubFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url?: string;
  sha: string;
  size: number;
}

export interface ParsedCursorRule {
  name: string;
  description: string;
  content: string;  // Raw content (system prompt)
  category: string;
  source_url: string;
  tags: string[];
  detected_tech: string[];
}

export interface ParserOptions {
  /** GitHub personal access token for higher rate limits */
  githubToken?: string;
  /** Apply text replacements to generalize skills */
  applyReplacements?: boolean;
  /** Custom replacements (default: claude -> agent) */
  replacements?: Array<{ from: RegExp; to: string }>;
  /** Maximum file size to process (default: 100KB) */
  maxFileSize?: number;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_REPLACEMENTS = [
  { from: /\bclaude\b/gi, to: 'agent' },
  { from: /\bClaude\b/g, to: 'Agent' },
  { from: /\bCLAUDE\b/g, to: 'AGENT' },
  { from: /\banthropic\b/gi, to: 'AI provider' },
  { from: /\bAnthropic\b/g, to: 'AI Provider' },
  { from: /\b@claude\b/gi, to: '@agent' },
];

const TECH_DETECTION = [
  { patterns: [/typescript/i, /\.tsx?/i, /\bts\b/], tag: 'typescript' },
  { patterns: [/javascript/i, /\.jsx?/i, /\bjs\b/], tag: 'javascript' },
  { patterns: [/python/i, /\.py\b/, /pip/, /poetry/], tag: 'python' },
  { patterns: [/react/i, /jsx/i, /usestate/i, /useeffect/i], tag: 'react' },
  { patterns: [/next\.?js/i, /app\s+router/i, /page\.tsx/], tag: 'nextjs' },
  { patterns: [/vue\.?js/i, /\bvue\b/i, /\.vue\b/], tag: 'vue' },
  { patterns: [/angular/i, /\bng-/], tag: 'angular' },
  { patterns: [/svelte/i, /\.svelte/], tag: 'svelte' },
  { patterns: [/tailwind/i, /tailwindcss/], tag: 'tailwind' },
  { patterns: [/node\.?js/i, /express/i, /\bnpm\b/], tag: 'nodejs' },
  { patterns: [/rust/i, /cargo/, /\.rs\b/], tag: 'rust' },
  { patterns: [/\bgolang\b/i, /\bgo\s+\w+/, /\.go\b/], tag: 'go' },
  { patterns: [/docker/i, /dockerfile/i, /container/i], tag: 'docker' },
  { patterns: [/kubernetes/i, /\bk8s\b/i], tag: 'kubernetes' },
  { patterns: [/graphql/i, /\bgql\b/i], tag: 'graphql' },
  { patterns: [/rest\s*api/i, /openapi/i, /swagger/i], tag: 'rest-api' },
  { patterns: [/supabase/i], tag: 'supabase' },
  { patterns: [/firebase/i], tag: 'firebase' },
  { patterns: [/prisma/i], tag: 'prisma' },
  { patterns: [/drizzle/i], tag: 'drizzle' },
  { patterns: [/shadcn/i, /radix/i], tag: 'shadcn' },
  { patterns: [/trpc/i], tag: 'trpc' },
  { patterns: [/zod/i], tag: 'zod' },
];

const DEFAULT_MAX_FILE_SIZE = 100 * 1024; // 100KB

// ============================================
// GitHub API Functions
// ============================================

async function fetchGitHub(url: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'AgentPlaybooks-Skill-Parser',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, { headers });
  
  if (response.status === 403) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      const reset = response.headers.get('x-ratelimit-reset');
      const resetDate = reset ? new Date(parseInt(reset) * 1000) : new Date();
      throw new Error(`GitHub rate limit exceeded. Resets at ${resetDate.toISOString()}`);
    }
  }
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  return response;
}

/**
 * Parse a GitHub URL into components
 */
export function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  type: 'blob' | 'tree' | 'raw';
} | null {
  // Patterns to match
  const patterns = [
    // https://github.com/owner/repo/blob/branch/path
    /github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/,
    // https://github.com/owner/repo/tree/branch/path
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/,
    // https://raw.githubusercontent.com/owner/repo/branch/path
    /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)/,
    // https://github.com/owner/repo (just repo)
    /github\.com\/([^/]+)\/([^/]+)\/?$/,
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const match = url.match(patterns[i]);
    if (match) {
      const [, owner, repo, branch = 'main', path = ''] = match;
      return {
        owner,
        repo: repo.replace(/\.git$/, ''),
        branch,
        path,
        type: i === 0 ? 'blob' : i === 1 ? 'tree' : 'raw',
      };
    }
  }
  
  return null;
}

/**
 * Fetch a file's content from GitHub
 */
export async function fetchGitHubFile(
  owner: string,
  repo: string,
  path: string,
  branch: string = 'main',
  token?: string
): Promise<string> {
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const response = await fetchGitHub(rawUrl, token);
  return response.text();
}

/**
 * List files in a GitHub directory
 */
export async function listGitHubDir(
  owner: string,
  repo: string,
  path: string = '',
  token?: string
): Promise<GitHubFile[]> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const response = await fetchGitHub(apiUrl, token);
  return response.json();
}

// ============================================
// Parsing Functions
// ============================================

/**
 * Apply text replacements to generalize content
 */
export function applyReplacements(
  content: string,
  replacements: Array<{ from: RegExp; to: string }> = DEFAULT_REPLACEMENTS
): string {
  let result = content;
  for (const { from, to } of replacements) {
    result = result.replace(from, to);
  }
  return result;
}

/**
 * Detect technologies mentioned in content
 */
export function detectTechnologies(content: string): string[] {
  const detected: string[] = [];
  const lowerContent = content.toLowerCase();
  
  for (const { patterns, tag } of TECH_DETECTION) {
    if (patterns.some(p => p.test(lowerContent))) {
      detected.push(tag);
    }
  }
  
  return [...new Set(detected)];
}

/**
 * Extract category from file path
 */
export function extractCategory(path: string): string {
  const parts = path.split('/').filter(Boolean);
  
  // Look for meaningful directory name
  for (const part of parts) {
    // Skip generic names
    if (['rules', 'src', 'lib', '.cursorrules', 'prompt-file'].includes(part.toLowerCase())) {
      continue;
    }
    // Clean up the name
    return part
      .replace(/-cursorrules.*$/i, '')
      .replace(/-prompt-file$/i, '')
      .replace(/-rules$/i, '')
      .replace(/-/g, ' ')
      .trim();
  }
  
  return 'general';
}

/**
 * Extract a description from cursor rule content
 */
export function extractDescription(content: string, maxLength: number = 200): string {
  const lines = content.split('\n');
  
  // Look for description-like content
  for (const line of lines.slice(0, 15)) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) continue;
    
    // Skip markdown headers, code blocks, comments
    if (/^#|^```|^\/\/|^\/\*|^\*|^-{3,}|^={3,}/.test(trimmed)) continue;
    
    // Skip very short lines
    if (trimmed.length < 20) continue;
    
    // Skip lines that look like code
    if (/^(import|export|const|let|var|function|class|interface|type)\b/.test(trimmed)) continue;
    if (/[{}\[\]()<>]/.test(trimmed) && trimmed.split(/[{}\[\]()<>]/).length > 3) continue;
    
    // Found a good description
    const desc = trimmed.slice(0, maxLength);
    return desc + (trimmed.length > maxLength ? '...' : '');
  }
  
  // Fallback: first 100 chars
  const fallback = content.slice(0, 100).replace(/\n+/g, ' ').trim();
  return fallback + '...';
}

/**
 * Generate a name from category and optional index
 */
export function generateName(category: string, index?: number): string {
  const baseName = category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  
  return index !== undefined ? `${baseName}_${index}` : baseName;
}

// ============================================
// Main Parsing Function
// ============================================

/**
 * Parse a single cursor rule file
 */
export async function parseCursorRuleFile(
  url: string,
  options: ParserOptions = {}
): Promise<ParsedCursorRule | null> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }
  
  const { owner, repo, branch, path } = parsed;
  const { githubToken, applyReplacements: shouldApply = true, maxFileSize = DEFAULT_MAX_FILE_SIZE } = options;
  
  // Fetch the file
  let content = await fetchGitHubFile(owner, repo, path, branch, githubToken);
  
  // Check size
  if (content.length > maxFileSize) {
    console.warn(`File too large (${content.length} bytes), truncating...`);
    content = content.slice(0, maxFileSize);
  }
  
  // Apply replacements if enabled
  if (shouldApply) {
    content = applyReplacements(content, options.replacements);
  }
  
  const category = extractCategory(path);
  const detected_tech = detectTechnologies(content);
  
  return {
    name: generateName(category),
    description: extractDescription(content),
    content,
    category,
    source_url: `https://github.com/${owner}/${repo}/blob/${branch}/${path}`,
    tags: detected_tech,
    detected_tech,
  };
}

/**
 * Parse all cursor rules from a repository
 */
export async function parseCursorRulesRepo(
  repoUrl: string,
  options: ParserOptions = {}
): Promise<ParsedCursorRule[]> {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    throw new Error(`Invalid GitHub URL: ${repoUrl}`);
  }
  
  const { owner, repo } = parsed;
  const { githubToken, maxFileSize = DEFAULT_MAX_FILE_SIZE } = options;
  const rules: ParsedCursorRule[] = [];
  const categoryCount: Record<string, number> = {};
  
  // Recursively scan directory
  async function scanDir(path: string, depth: number = 0): Promise<void> {
    if (depth > 5) return; // Limit recursion
    
    const items = await listGitHubDir(owner, repo, path, githubToken);
    
    for (const item of items) {
      if (item.type === 'dir') {
        await scanDir(item.path, depth + 1);
        await new Promise(r => setTimeout(r, 50)); // Rate limit
      } else if (item.name === '.cursorrules' || item.name.endsWith('.cursorrules')) {
        if (item.size && item.size > maxFileSize) {
          console.warn(`  Skipping large file: ${item.path} (${item.size} bytes)`);
          continue;
        }
        
        try {
          const fileUrl = `https://github.com/${owner}/${repo}/blob/main/${item.path}`;
          const rule = await parseCursorRuleFile(fileUrl, options);
          
          if (rule) {
            // Add index to name if duplicate category
            const cat = rule.category;
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
            if (categoryCount[cat] > 1) {
              rule.name = generateName(cat, categoryCount[cat]);
            }
            
            rules.push(rule);
            console.log(`  ✓ Parsed: ${rule.name} (${rule.tags.join(', ')})`);
          }
        } catch (err) {
          console.warn(`  ⚠ Failed to parse ${item.path}:`, (err as Error).message);
        }
      }
    }
  }
  
  console.log(`Scanning ${owner}/${repo}...`);
  await scanDir(parsed.path || 'rules');
  
  return rules;
}

// ============================================
// CLI Entry Point
// ============================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
GitHub Skill Parser
===================

Usage:
  npx tsx scripts/github-skill-parser.ts <github-url>

Examples:
  # Parse a single .cursorrules file:
  npx tsx scripts/github-skill-parser.ts https://github.com/PatrickJS/awesome-cursorrules/blob/main/rules/nextjs/.cursorrules

  # Scan an entire repository:
  npx tsx scripts/github-skill-parser.ts https://github.com/PatrickJS/awesome-cursorrules

Environment:
  GITHUB_TOKEN - Optional: GitHub personal access token for higher rate limits
`);
    process.exit(0);
  }
  
  const url = args[0];
  const token = process.env.GITHUB_TOKEN;
  
  try {
    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      console.error('Invalid GitHub URL');
      process.exit(1);
    }
    
    // Check if it's a file or repo/directory
    if (parsed.type === 'blob' && parsed.path.endsWith('.cursorrules')) {
      // Single file
      const rule = await parseCursorRuleFile(url, { githubToken: token });
      console.log('\n📄 Parsed Rule:\n');
      console.log(JSON.stringify(rule, null, 2));
    } else {
      // Repository or directory
      const rules = await parseCursorRulesRepo(url, { githubToken: token });
      console.log(`\n📦 Parsed ${rules.length} rules\n`);
      
      // Summary
      const categories = new Map<string, number>();
      const allTags = new Set<string>();
      
      for (const rule of rules) {
        categories.set(rule.category, (categories.get(rule.category) || 0) + 1);
        rule.tags.forEach(t => allTags.add(t));
      }
      
      console.log('Categories:');
      for (const [cat, count] of categories) {
        console.log(`  ${cat}: ${count}`);
      }
      
      console.log('\nDetected Technologies:');
      console.log(`  ${[...allTags].sort().join(', ')}`);
      
      // Output JSON to stdout (can be piped)
      if (args.includes('--json')) {
        console.log('\nJSON Output:');
        console.log(JSON.stringify(rules, null, 2));
      }
    }
  } catch (err) {
    console.error('❌ Error:', (err as Error).message);
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1]?.includes('github-skill-parser')) {
  main();
}


