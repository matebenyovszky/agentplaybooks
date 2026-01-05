// Auto-generated types will be here
// For now, define manually based on our schema

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpResource = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
};

export type SkillDefinition = {
  parameters?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string; enum?: string[]; [key: string]: unknown }>;
    required?: string[];
  };
  [key: string]: unknown;
};

export type PlaybooksRow = {
  id: string;
  user_id: string;
  guid: string;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
  is_public: boolean;
  star_count: number;
  tags: string[];
  // 1 Playbook = 1 Persona (embedded into playbooks table)
  persona_name: string | null;
  persona_system_prompt: string | null;
  persona_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PlaybooksInsert = Partial<PlaybooksRow>;
export type PlaybooksUpdate = Partial<PlaybooksRow>;

export type PlaybookStarsRow = {
  id: string;
  playbook_id: string;
  user_id: string;
  created_at: string;
};

export type PlaybookStarsInsert = Partial<PlaybookStarsRow>;
export type PlaybookStarsUpdate = Partial<PlaybookStarsRow>;

/**
 * Persona type (logical model)
 *
 * Note: Personas are no longer stored in a `personas` table.
 * We keep this type for UI/API compatibility, but the data is stored
 * in `playbooks.persona_*` columns (1 playbook = 1 persona).
 */
export type Persona = {
  // We use the playbook ID as the persona ID (singleton persona per playbook).
  id: string;
  playbook_id: string;
  name: string;
  system_prompt: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SkillsRow = {
  id: string;
  playbook_id: string;
  name: string;
  description: string | null;
  content: string | null; // Full markdown content (SKILL.md body)
  definition: SkillDefinition;
  examples: Record<string, unknown>[];
  created_at: string;
  priority: number | null;
};

export type SkillsInsert = Partial<SkillsRow>;
export type SkillsUpdate = Partial<SkillsRow>;

export type MCPServersRow = {
  id: string;
  playbook_id: string;
  name: string;
  description: string | null;
  tools: McpTool[];
  resources: McpResource[];
  transport_type?: "stdio" | "http" | "sse" | null;
  transport_config?: Record<string, unknown>;
  created_at: string;
};

export type MCPServersInsert = Partial<MCPServersRow>;
export type MCPServersUpdate = Partial<MCPServersRow>;

export type CanvasRow = {
  id: string;
  playbook_id: string;
  name: string;
  slug: string;
  content: string;
  metadata: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CanvasInsert = Partial<CanvasRow>;
export type CanvasUpdate = Partial<CanvasRow>;

export type MemoriesRow = {
  id: string;
  playbook_id: string;
  key: string;
  value: Record<string, unknown>;
  tags: string[];
  description: string | null;
  updated_at: string;
};

export type MemoriesInsert = Partial<MemoriesRow>;
export type MemoriesUpdate = Partial<MemoriesRow>;

export type ApiKeysRow = {
  id: string;
  playbook_id: string;
  key_hash: string;
  key_prefix: string;
  name: string | null;
  permissions: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type ApiKeysInsert = Partial<ApiKeysRow>;
export type ApiKeysUpdate = Partial<ApiKeysRow>;

// User-level API Keys (work across all user's playbooks)
export type UserApiKeysRow = {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name: string | null;
  permissions: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type UserApiKeysInsert = Partial<UserApiKeysRow>;
export type UserApiKeysUpdate = Partial<UserApiKeysRow>;

// Public types removed - all items now belong to playbooks
// Skills and MCP servers from public playbooks form the marketplace

// ===================
// SKILL ATTACHMENTS (Secure file storage)
// ===================

export const ALLOWED_FILE_TYPES = [
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'sql',
  'markdown',
  'json',
  'yaml',
  'text',
  'cursorrules',
  'shell'
] as const;

export type AttachmentFileType = typeof ALLOWED_FILE_TYPES[number];

// File extension to type mapping
export const FILE_EXTENSION_MAP: Record<string, AttachmentFileType> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.sql': 'sql',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.txt': 'text',
  '.cursorrules': 'cursorrules',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
};

export type SkillAttachmentsRow = {
  id: string;
  skill_id: string;
  filename: string;
  file_type: AttachmentFileType;
  language: string | null;
  description: string | null;
  content: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
};

export type SkillAttachmentsInsert = Omit<SkillAttachmentsRow, 'id' | 'created_at' | 'updated_at'>;
export type SkillAttachmentsUpdate = Partial<Omit<SkillAttachmentsRow, 'id' | 'skill_id' | 'created_at'>>;

// Security limits
export const ATTACHMENT_LIMITS = {
  MAX_FILE_SIZE: 51200, // 50KB
  MAX_FILES_PER_SKILL: 10,
  MAX_FILENAME_LENGTH: 100,
} as const;

// ===================
// PROFILES (User display info & publishers)
// ===================

export type ProfilesRow = {
  id: string;
  auth_user_id: string | null;
  display_name: string;
  avatar_svg: string | null;
  website_url: string | null;
  description: string | null;
  is_verified: boolean;
  is_virtual: boolean;
  created_at: string;
  updated_at: string;
};

export type ProfilesInsert = Omit<ProfilesRow, 'created_at'>;
export type ProfilesUpdate = Partial<Omit<ProfilesRow, 'id' | 'auth_user_id' | 'created_at'>>;

// Known publisher IDs
export const PUBLISHER_IDS = {
  AGENT_PLAYBOOKS: '00000000-0000-0000-0000-000000000001',
  ANTHROPIC: 'a0000000-0000-0000-0000-000000000001',
} as const;

export interface Database {
  public: {
    Tables: {
      playbooks: {
        Row: PlaybooksRow;
        Insert: PlaybooksInsert;
        Update: PlaybooksUpdate;
        Relationships: [];
      };
      playbook_stars: {
        Row: PlaybookStarsRow;
        Insert: PlaybookStarsInsert;
        Update: PlaybookStarsUpdate;
        Relationships: [];
      };
      skills: {
        Row: SkillsRow;
        Insert: SkillsInsert;
        Update: SkillsUpdate;
        Relationships: [];
      };
      mcp_servers: {
        Row: MCPServersRow;
        Insert: MCPServersInsert;
        Update: MCPServersUpdate;
        Relationships: [];
      };
      canvas: {
        Row: CanvasRow;
        Insert: CanvasInsert;
        Update: CanvasUpdate;
        Relationships: [];
      };
      memories: {
        Row: MemoriesRow;
        Insert: MemoriesInsert;
        Update: MemoriesUpdate;
        Relationships: [];
      };
      api_keys: {
        Row: ApiKeysRow;
        Insert: ApiKeysInsert;
        Update: ApiKeysUpdate;
        Relationships: [];
      };
      user_api_keys: {
        Row: UserApiKeysRow;
        Insert: UserApiKeysInsert;
        Update: UserApiKeysUpdate;
        Relationships: [];
      };
      skill_attachments: {
        Row: SkillAttachmentsRow;
        Insert: SkillAttachmentsInsert;
        Update: SkillAttachmentsUpdate;
        Relationships: [];
      };
      profiles: {
        Row: ProfilesRow;
        Insert: ProfilesInsert;
        Update: ProfilesUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: Record<string, { Args: Record<string, unknown> | never; Returns: unknown }>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience types
export type Playbook = Database["public"]["Tables"]["playbooks"]["Row"];
export type PlaybookStar = Database["public"]["Tables"]["playbook_stars"]["Row"];
export type Skill = Database["public"]["Tables"]["skills"]["Row"];
export type MCPServer = Database["public"]["Tables"]["mcp_servers"]["Row"];
export type Canvas = Database["public"]["Tables"]["canvas"]["Row"];
export type Memory = Database["public"]["Tables"]["memories"]["Row"];
export type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"];
export type UserApiKey = Database["public"]["Tables"]["user_api_keys"]["Row"];
export type SkillAttachment = Database["public"]["Tables"]["skill_attachments"]["Row"];

// Legacy: PublicSkill and PublicMCPServer types removed
// Use Skill and MCPServer types - public items come from public playbooks

// Extended types for Explore page
export interface PublicPlaybook extends Playbook {
  personas_count: number;
  skills_count: number;
  mcp_servers_count: number;
  author_email?: string;
  is_starred?: boolean;
  user_id: string; // Owner/creator ID for permission checks
}
