/**
 * Import Script for Official Anthropic Skills
 * 
 * This script fetches skills from https://github.com/anthropics/skills
 * and imports them as a public playbook with skill_attachments.
 * 
 * Usage:
 *   npx ts-node scripts/import-anthropic-skills.ts
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
  // Anthropic Skills repo
  repo_owner: 'anthropics',
  repo_name: 'skills',
  repo_path: 'skills',
  
  // Publisher profile ID for Anthropic
  anthropic_publisher_id: 'a0000000-0000-0000-0000-000000000002', // Anthropic Skills
  
  // Playbook to create for all skills
  playbook_name: 'Official Anthropic Skills',
  playbook_description: 'Curated collection of official skills from Anthropic for AI assistants. Includes frontend design, document creation, MCP building, and more.',
  playbook_tags: ['official', 'anthropic', 'skills', 'curated'],
  
  // File types we support for attachments
  supported_extensions: ['.md', '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.sql', '.json', '.yaml', '.yml', '.txt', '.sh'],
  
  // Max attachment size (50KB)
  max_attachment_size: 51200,
  
  // Skip these files
  skip_files: ['LICENSE.txt', 'LICENSE', 'LICENSE.md'],
};

// ============================================
// Types
// ============================================

interface GitHubContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  download_url?: string;
  sha: string;
}

interface SkillData {
  name: string;
  slug: string;
  description: string;
  skillMd: string;
  sourceUrl: string;
  attachments: AttachmentData[];
}

interface AttachmentData {
  filename: string;
  file_type: string;
  content: string;
  description: string;
  size_bytes: number;
}

// ============================================
// GitHub API Helpers
// ============================================

async function fetchGitHubApi(path: string, token?: string): Promise<any> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'AgentPlaybooks-Import-Script',
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
    'User-Agent': 'AgentPlaybooks-Import-Script',
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

// ============================================
// File Type Detection
// ============================================

function getFileType(filename: string): string | null {
  const ext = filename.toLowerCase().split('.').pop() || '';
  const extMap: Record<string, string> = {
    'md': 'markdown',
    'mdx': 'markdown',
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'mjs': 'javascript',
    'py': 'python',
    'go': 'go',
    'rs': 'rust',
    'sql': 'sql',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'txt': 'text',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
  };
  return extMap[ext] || null;
}

function isSupportedFile(filename: string): boolean {
  if (CONFIG.skip_files.includes(filename)) return false;
  return CONFIG.supported_extensions.some(ext => filename.toLowerCase().endsWith(ext));
}

// ============================================
// Skill Parsing
// ============================================

async function fetchSkillDirectory(dirPath: string, token?: string): Promise<GitHubContent[]> {
  return fetchGitHubApi(`/repos/${CONFIG.repo_owner}/${CONFIG.repo_name}/contents/${dirPath}`, token);
}

async function parseSkill(skillDir: GitHubContent, token?: string): Promise<SkillData | null> {
  console.log(`  📂 Parsing skill: ${skillDir.name}`);
  
  try {
    // Get directory contents
    const contents = await fetchSkillDirectory(skillDir.path, token);
    
    // Find SKILL.md
    const skillMdFile = contents.find(f => f.name === 'SKILL.md');
    if (!skillMdFile || !skillMdFile.download_url) {
      console.warn(`    ⚠ No SKILL.md found in ${skillDir.name}`);
      return null;
    }
    
    // Fetch SKILL.md content
    const skillMd = await fetchGitHubRaw(skillMdFile.download_url, token);
    
    // Extract description from first paragraph
    const description = extractDescription(skillMd);
    
    // Human-readable name from directory name
    const name = skillDir.name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    // Collect attachments from subdirectories
    const attachments: AttachmentData[] = [];
    
    for (const item of contents) {
      if (item.type === 'dir') {
        // Recursively fetch files from subdirectories (reference, scripts, etc.)
        const subContents = await fetchSkillDirectory(item.path, token);
        
        for (const file of subContents) {
          if (file.type === 'file' && isSupportedFile(file.name) && file.download_url) {
            // Check file size
            if (file.size > CONFIG.max_attachment_size) {
              console.warn(`    ⚠ Skipping ${file.name} (${file.size} bytes > max)`);
              continue;
            }
            
            const fileType = getFileType(file.name);
            if (!fileType) continue;
            
            try {
              const content = await fetchGitHubRaw(file.download_url, token);
              
              // Replace / with _ to satisfy no_path_traversal constraint
              const safeFilename = `${item.name}_${file.name}`.replace(/[\/\\]/g, '_');
              
              attachments.push({
                filename: safeFilename,
                file_type: fileType,
                content: content,
                description: `Reference file from ${item.name}/`,
                size_bytes: Buffer.byteLength(content, 'utf8'),
              });
              
              console.log(`    📎 Attachment: ${item.name}/${file.name} (${fileType})`);
            } catch (err) {
              console.warn(`    ⚠ Failed to fetch ${file.name}: ${(err as Error).message}`);
            }
          }
        }
      } else if (item.type === 'file' && isSupportedFile(item.name) && item.name !== 'SKILL.md' && item.download_url) {
        // Top-level files (excluding SKILL.md and LICENSE)
        if (item.size > CONFIG.max_attachment_size) continue;
        
        const fileType = getFileType(item.name);
        if (!fileType) continue;
        
        try {
          const content = await fetchGitHubRaw(item.download_url, token);
          
          attachments.push({
            filename: item.name,
            file_type: fileType,
            content: content,
            description: 'Reference file',
            size_bytes: Buffer.byteLength(content, 'utf8'),
          });
          
          console.log(`    📎 Attachment: ${item.name} (${fileType})`);
        } catch (err) {
          console.warn(`    ⚠ Failed to fetch ${item.name}: ${(err as Error).message}`);
        }
      }
    }
    
    return {
      name,
      slug: skillDir.name,
      description,
      skillMd,
      sourceUrl: `https://github.com/${CONFIG.repo_owner}/${CONFIG.repo_name}/tree/main/${skillDir.path}`,
      attachments,
    };
  } catch (err) {
    console.error(`  ✗ Error parsing ${skillDir.name}:`, err);
    return null;
  }
}

function extractDescription(content: string): string {
  // Skip markdown headers and find first paragraph
  const lines = content.split('\n');
  let foundNonHeader = false;
  let description = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines at start
    if (!trimmed && !foundNonHeader) continue;
    
    // Skip headers
    if (trimmed.startsWith('#')) continue;
    
    // Skip code blocks
    if (trimmed.startsWith('```')) continue;
    
    // Found a content line
    if (trimmed) {
      foundNonHeader = true;
      description += (description ? ' ' : '') + trimmed;
      
      // Stop after ~200 chars
      if (description.length > 200) {
        description = description.slice(0, 200) + '...';
        break;
      }
    } else if (foundNonHeader) {
      // Empty line after content = end of first paragraph
      break;
    }
  }
  
  return description || 'Official Anthropic skill';
}

// ============================================
// Database Operations
// ============================================

async function ensureAnthropicPublisher(supabase: SupabaseClient): Promise<string> {
  console.log('📌 Ensuring Anthropic Skills publisher exists...');
  
  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: CONFIG.anthropic_publisher_id,
      auth_user_id: null,
      display_name: 'Anthropic Skills',
      avatar_svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#cc785c"/>
        <text x="50" y="60" text-anchor="middle" font-size="36" font-weight="bold" fill="white">A</text>
        <circle cx="75" cy="25" r="10" fill="#4ade80"/>
      </svg>`,
      website_url: 'https://github.com/anthropics/skills',
      description: 'Official skills collection from Anthropic',
      is_verified: true,
      is_virtual: true,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id',
    })
    .select()
    .single();
  
  if (error) {
    console.warn('  ⚠ Publisher upsert issue:', error.message);
  } else {
    console.log('  ✓ Publisher ready');
  }
  
  return CONFIG.anthropic_publisher_id;
}

async function createOrUpdatePlaybook(
  supabase: SupabaseClient,
  publisherId: string
): Promise<string> {
  console.log('📦 Creating/updating Anthropic Skills playbook...');
  
  const guid = 'anthropic-official-skills';
  
  // Check if playbook exists by guid (more reliable)
  const { data: existing, error: selectError } = await supabase
    .from('playbooks')
    .select('id')
    .eq('guid', guid)
    .maybeSingle();
  
  if (selectError) {
    console.log(`  ⚠ Query error: ${selectError.message}, trying insert anyway...`);
  }
  
  if (existing) {
    console.log(`  ✓ Playbook already exists: ${existing.id}`);
    return existing.id;
  }
  
  // Create new playbook
  // We need a user_id - use the system user
  const systemUserId = '00000000-0000-0000-0000-000000000001';
  
  const { data, error } = await supabase
    .from('playbooks')
    .upsert({
      user_id: systemUserId,
      guid: guid,
      name: CONFIG.playbook_name,
      description: CONFIG.playbook_description,
      is_public: true,
      star_count: 0,
      tags: CONFIG.playbook_tags,
      config: { source: 'anthropic-skills-repo' },
    }, {
      onConflict: 'guid',
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create/update playbook: ${error.message}`);
  }
  
  console.log(`  ✓ Created playbook: ${data.id}`);
  return data.id;
}

async function insertSkill(
  supabase: SupabaseClient,
  playbookId: string,
  skill: SkillData
): Promise<string | null> {
  // Check if skill already exists
  const { data: existing } = await supabase
    .from('skills')
    .select('id')
    .eq('playbook_id', playbookId)
    .eq('name', skill.slug)
    .single();
  
  if (existing) {
    console.log(`  - Skill exists: ${skill.name}`);
    return existing.id;
  }
  
  // Insert skill - store full markdown in content field
  const { data, error } = await supabase
    .from('skills')
    .insert({
      playbook_id: playbookId,
      name: skill.slug,
      description: skill.description.slice(0, 500), // Short description for listing
      content: skill.skillMd, // Full SKILL.md markdown content
      definition: {
        type: 'anthropic-skill',
        source_url: skill.sourceUrl,
      },
      examples: [],
    })
    .select()
    .single();
  
  if (error) {
    console.warn(`  ⚠ Failed to insert skill ${skill.name}: ${error.message}`);
    return null;
  }
  
  console.log(`  ✓ Inserted skill: ${skill.name}`);
  return data.id;
}

async function insertAttachments(
  supabase: SupabaseClient,
  skillId: string,
  attachments: AttachmentData[]
): Promise<void> {
  for (const attachment of attachments) {
    try {
      // Check if attachment exists
      const { data: existing } = await supabase
        .from('skill_attachments')
        .select('id')
        .eq('skill_id', skillId)
        .eq('filename', attachment.filename)
        .single();
      
      if (existing) {
        console.log(`      - Attachment exists: ${attachment.filename}`);
        continue;
      }
      
      const { error } = await supabase
        .from('skill_attachments')
        .insert({
          skill_id: skillId,
          filename: attachment.filename,
          file_type: attachment.file_type,
          language: attachment.file_type,
          description: attachment.description,
          content: attachment.content,
          size_bytes: attachment.size_bytes,
        });
      
      if (error) {
        console.warn(`      ⚠ Failed: ${attachment.filename} - ${error.message}`);
      } else {
        console.log(`      ✓ Attached: ${attachment.filename}`);
      }
    } catch (err) {
      console.warn(`      ⚠ Error with ${attachment.filename}:`, (err as Error).message);
    }
  }
}

// ============================================
// Main Entry Point
// ============================================

async function main() {
  console.log('🚀 Anthropic Skills Import Script\n');
  console.log('='.repeat(50));
  console.log(`Source: https://github.com/${CONFIG.repo_owner}/${CONFIG.repo_name}`);
  console.log('='.repeat(50) + '\n');
  
  // Get environment variables
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
    console.error('   SUPABASE_SERVICE_ROLE_KEY');
    console.error('\nSet these and try again.');
    process.exit(1);
  }
  
  if (!githubToken) {
    console.warn('⚠️  No GITHUB_TOKEN set. You may hit rate limits.\n');
  }
  
  // Create Supabase client with service role key (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'agentplaybooks-import-script/1.0',
      },
    },
    db: {
      schema: 'public',
    },
  });
  
  // Ensure publisher exists
  const publisherId = await ensureAnthropicPublisher(supabase);
  
  // Create or get playbook
  const playbookId = await createOrUpdatePlaybook(supabase, publisherId);
  
  console.log('\n📂 Phase 1: Fetching skills from GitHub...\n');
  
  // Get all skill directories
  const skillDirs = await fetchSkillDirectory(CONFIG.repo_path, githubToken);
  const skills: SkillData[] = [];
  
  for (const dir of skillDirs) {
    if (dir.type !== 'dir') continue;
    
    const skill = await parseSkill(dir, githubToken);
    if (skill) {
      skills.push(skill);
    }
    
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n📦 Found ${skills.length} skills with ${skills.reduce((sum, s) => sum + s.attachments.length, 0)} total attachments\n`);
  
  console.log('💾 Phase 2: Inserting into database...\n');
  
  let insertedSkills = 0;
  let insertedAttachments = 0;
  
  for (const skill of skills) {
    const skillId = await insertSkill(supabase, playbookId, skill);
    
    if (skillId) {
      insertedSkills++;
      
      if (skill.attachments.length > 0) {
        await insertAttachments(supabase, skillId, skill.attachments);
        insertedAttachments += skill.attachments.length;
      }
    }
    
    // Small delay
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Import completed!');
  console.log(`   - ${insertedSkills} skills imported`);
  console.log(`   - ${insertedAttachments} attachments imported`);
  console.log(`   - Playbook ID: ${playbookId}`);
  console.log('='.repeat(50));
}

// Run if executed directly
main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});

