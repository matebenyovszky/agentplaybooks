/**
 * Storage Adapter Types
 * 
 * This abstraction allows editor components to work with
 * the Supabase storage backend.
 */

import type { Persona, Skill, MCPServer, Canvas, PlaybookRun, Memory, Playbook } from "@/lib/supabase/types";

// Partial types for creating new items (without id, timestamps)
export type PersonaInput = Omit<Persona, "id" | "playbook_id" | "created_at" | "updated_at">;
export type SkillInput = Omit<Skill, "id" | "playbook_id" | "created_at" | "updated_at">;
export type MCPServerInput = Omit<MCPServer, "id" | "playbook_id" | "created_at" | "updated_at">;
export type CanvasInput = Omit<Canvas, "id" | "playbook_id" | "created_at" | "updated_at" | "version">;
export type PlaybookRunInput = Omit<PlaybookRun, "id" | "playbook_id" | "created_by" | "created_at" | "updated_at">;
// Memory input - tags and description are optional (have defaults in DB)
export type MemoryInput = {
  key: string;
  value: Record<string, unknown>;
  tags?: string[];
  description?: string | null;
};

export interface StorageAdapter {
  
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

  // Workflow runs
  getRuns(): Promise<PlaybookRun[]>;
  addRun(data: PlaybookRunInput): Promise<PlaybookRun | null>;
  updateRun(id: string, data: Partial<PlaybookRunInput>): Promise<PlaybookRun | null>;
  deleteRun(id: string): Promise<boolean>;

  // Canvas documents
  getCanvases(runId?: string): Promise<Canvas[]>;
  addCanvas(data: CanvasInput): Promise<Canvas | null>;
  updateCanvas(id: string, data: Partial<CanvasInput>, expectedVersion: number): Promise<Canvas | null>;
  deleteCanvas(id: string): Promise<boolean>;
  
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
