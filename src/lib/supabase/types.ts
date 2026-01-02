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

export type PersonasRow = {
  id: string;
  playbook_id: string;
  name: string;
  system_prompt: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type PersonasInsert = Partial<PersonasRow>;
export type PersonasUpdate = Partial<PersonasRow>;

export type SkillsRow = {
  id: string;
  playbook_id: string;
  name: string;
  description: string | null;
  definition: SkillDefinition;
  examples: Record<string, unknown>[];
  created_at: string;
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

export type PublicSkillsRow = {
  id: string;
  original_skill_id: string | null;
  author_id: string;
  name: string;
  description: string | null;
  definition: SkillDefinition;
  examples: Record<string, unknown>[];
  tags: string[];
  usage_count: number;
  is_verified: boolean;
  created_at: string;
};

export type PublicSkillsInsert = Partial<PublicSkillsRow>;
export type PublicSkillsUpdate = Partial<PublicSkillsRow>;

export type PublicMCPServersRow = {
  id: string;
  original_mcp_id: string | null;
  author_id: string;
  name: string;
  description: string | null;
  tools: McpTool[];
  resources: McpResource[];
  transport_type: string;
  tags: string[];
  usage_count: number;
  is_verified: boolean;
  created_at: string;
};

export type PublicMCPServersInsert = Partial<PublicMCPServersRow>;
export type PublicMCPServersUpdate = Partial<PublicMCPServersRow>;

export type PlaybookPublicItemsRow = {
  id: string;
  playbook_id: string;
  item_type: "skill" | "mcp";
  item_id: string;
  added_at: string;
};

export type PlaybookPublicItemsInsert = Partial<PlaybookPublicItemsRow>;
export type PlaybookPublicItemsUpdate = Partial<PlaybookPublicItemsRow>;

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
      personas: {
        Row: PersonasRow;
        Insert: PersonasInsert;
        Update: PersonasUpdate;
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
      public_skills: {
        Row: PublicSkillsRow;
        Insert: PublicSkillsInsert;
        Update: PublicSkillsUpdate;
        Relationships: [];
      };
      public_mcp_servers: {
        Row: PublicMCPServersRow;
        Insert: PublicMCPServersInsert;
        Update: PublicMCPServersUpdate;
        Relationships: [];
      };
      playbook_public_items: {
        Row: PlaybookPublicItemsRow;
        Insert: PlaybookPublicItemsInsert;
        Update: PlaybookPublicItemsUpdate;
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
export type Persona = Database["public"]["Tables"]["personas"]["Row"];
export type Skill = Database["public"]["Tables"]["skills"]["Row"];
export type MCPServer = Database["public"]["Tables"]["mcp_servers"]["Row"];
export type Canvas = Database["public"]["Tables"]["canvas"]["Row"];
export type Memory = Database["public"]["Tables"]["memories"]["Row"];
export type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"];
export type PublicSkill = Database["public"]["Tables"]["public_skills"]["Row"];
export type PublicMCPServer = Database["public"]["Tables"]["public_mcp_servers"]["Row"];

// Extended types for Explore page
export interface PublicPlaybook extends Playbook {
  personas_count: number;
  skills_count: number;
  mcp_servers_count: number;
  author_email?: string;
  is_starred?: boolean;
}
