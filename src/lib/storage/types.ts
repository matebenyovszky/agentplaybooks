/**
 * Storage Adapter Types
 * 
 * This abstraction allows the same editor components to work with
 * different storage backends (Supabase for authenticated users, 
 * localStorage for demo mode).
 */

import type { Persona, Skill, MCPServer, Memory, Playbook } from "@/lib/supabase/types";

// Partial types for creating new items (without id, timestamps)
export type PersonaInput = Omit<Persona, "id" | "playbook_id" | "created_at" | "updated_at">;
export type SkillInput = Omit<Skill, "id" | "playbook_id" | "created_at" | "updated_at">;
export type MCPServerInput = Omit<MCPServer, "id" | "playbook_id" | "created_at" | "updated_at">;
export type MemoryInput = Omit<Memory, "id" | "playbook_id" | "created_at" | "updated_at">;

export interface StorageAdapter {
  // Mode indicator
  isDemo: boolean;
  
  // Playbook
  getPlaybook(): Promise<Playbook | null>;
  updatePlaybook(data: Partial<Playbook>): Promise<Playbook | null>;
  
  // Personas
  getPersonas(): Promise<Persona[]>;
  addPersona(data: PersonaInput): Promise<Persona | null>;
  updatePersona(id: string, data: Partial<PersonaInput>): Promise<Persona | null>;
  deletePersona(id: string): Promise<boolean>;
  
  // Skills
  getSkills(): Promise<Skill[]>;
  addSkill(data: SkillInput): Promise<Skill | null>;
  updateSkill(id: string, data: Partial<SkillInput>): Promise<Skill | null>;
  deleteSkill(id: string): Promise<boolean>;
  
  // MCP Servers
  getMcpServers(): Promise<MCPServer[]>;
  addMcpServer(data: MCPServerInput): Promise<MCPServer | null>;
  updateMcpServer(id: string, data: Partial<MCPServerInput>): Promise<MCPServer | null>;
  deleteMcpServer(id: string): Promise<boolean>;
  
  // Memory
  getMemories(): Promise<Memory[]>;
  addMemory(data: MemoryInput): Promise<Memory | null>;
  updateMemory(id: string, data: Partial<MemoryInput>): Promise<Memory | null>;
  deleteMemory(id: string): Promise<boolean>;
}

// Context type for editor components
export interface EditorContext {
  storage: StorageAdapter;
  playbookId: string;
  playbookGuid: string;
}

