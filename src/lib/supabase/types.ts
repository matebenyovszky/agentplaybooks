// Auto-generated types will be here
// For now, define manually based on our schema

export interface Database {
  public: {
    Tables: {
      playbooks: {
        Row: {
          id: string;
          user_id: string;
          guid: string;
          name: string;
          description: string | null;
          config: Record<string, unknown>;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["playbooks"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["playbooks"]["Insert"]>;
      };
      personas: {
        Row: {
          id: string;
          playbook_id: string;
          name: string;
          system_prompt: string;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["personas"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["personas"]["Insert"]>;
      };
      skills: {
        Row: {
          id: string;
          playbook_id: string;
          name: string;
          description: string | null;
          definition: Record<string, unknown>;
          examples: Record<string, unknown>[];
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["skills"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["skills"]["Insert"]>;
      };
      mcp_servers: {
        Row: {
          id: string;
          playbook_id: string;
          name: string;
          description: string | null;
          tools: Record<string, unknown>[];
          resources: Record<string, unknown>[];
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["mcp_servers"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["mcp_servers"]["Insert"]>;
      };
      memories: {
        Row: {
          id: string;
          playbook_id: string;
          key: string;
          value: Record<string, unknown>;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["memories"]["Row"], "id" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["memories"]["Insert"]>;
      };
      api_keys: {
        Row: {
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
        Insert: Omit<Database["public"]["Tables"]["api_keys"]["Row"], "id" | "created_at" | "last_used_at">;
        Update: Partial<Database["public"]["Tables"]["api_keys"]["Insert"]>;
      };
      public_skills: {
        Row: {
          id: string;
          original_skill_id: string | null;
          author_id: string;
          name: string;
          description: string | null;
          definition: Record<string, unknown>;
          examples: Record<string, unknown>[];
          tags: string[];
          usage_count: number;
          is_verified: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["public_skills"]["Row"], "id" | "created_at" | "usage_count">;
        Update: Partial<Database["public"]["Tables"]["public_skills"]["Insert"]>;
      };
      public_mcp_servers: {
        Row: {
          id: string;
          original_mcp_id: string | null;
          author_id: string;
          name: string;
          description: string | null;
          tools: Record<string, unknown>[];
          resources: Record<string, unknown>[];
          transport_type: string;
          tags: string[];
          usage_count: number;
          is_verified: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["public_mcp_servers"]["Row"], "id" | "created_at" | "usage_count">;
        Update: Partial<Database["public"]["Tables"]["public_mcp_servers"]["Insert"]>;
      };
      playbook_public_items: {
        Row: {
          id: string;
          playbook_id: string;
          item_type: "skill" | "mcp";
          item_id: string;
          added_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["playbook_public_items"]["Row"], "id" | "added_at">;
        Update: Partial<Database["public"]["Tables"]["playbook_public_items"]["Insert"]>;
      };
    };
  };
}

// Convenience types
export type Playbook = Database["public"]["Tables"]["playbooks"]["Row"];
export type Persona = Database["public"]["Tables"]["personas"]["Row"];
export type Skill = Database["public"]["Tables"]["skills"]["Row"];
export type MCPServer = Database["public"]["Tables"]["mcp_servers"]["Row"];
export type Memory = Database["public"]["Tables"]["memories"]["Row"];
export type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"];
export type PublicSkill = Database["public"]["Tables"]["public_skills"]["Row"];
export type PublicMCPServer = Database["public"]["Tables"]["public_mcp_servers"]["Row"];

