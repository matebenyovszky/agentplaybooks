/**
 * Demo Storage Adapter
 * 
 * Implements StorageAdapter for demo mode using localStorage.
 * Wraps the existing demo-storage.ts functions.
 */

import type { Persona, Skill, MCPServer, Memory, Playbook } from "@/lib/supabase/types";
import type { StorageAdapter, PersonaInput, SkillInput, MCPServerInput, MemoryInput } from "./types";
import {
  loadDemoData,
  saveDemoData,
  updateDemoPlaybook,
  addDemoPersona,
  updateDemoPersona,
  deleteDemoPersona,
  addDemoSkill,
  updateDemoSkill,
  deleteDemoSkill,
  addDemoMcpServer,
  updateDemoMcpServer,
  deleteDemoMcpServer,
  addDemoMemory,
  updateDemoMemory,
  deleteDemoMemory,
} from "@/lib/demo-storage";

export function createDemoAdapter(): StorageAdapter {
  return {
    isDemo: true,
    
    // Playbook
    async getPlaybook(): Promise<Playbook | null> {
      const data = loadDemoData();
      return data.playbook;
    },
    
    async updatePlaybook(updates: Partial<Playbook>): Promise<Playbook | null> {
      return updateDemoPlaybook(updates);
    },
    
    // Personas
    async getPersonas(): Promise<Persona[]> {
      const data = loadDemoData();
      return data.personas;
    },
    
    async addPersona(input: PersonaInput): Promise<Persona | null> {
      return addDemoPersona(input);
    },
    
    async updatePersona(id: string, updates: Partial<PersonaInput>): Promise<Persona | null> {
      return updateDemoPersona(id, updates);
    },
    
    async deletePersona(id: string): Promise<boolean> {
      return deleteDemoPersona(id);
    },
    
    // Skills
    async getSkills(): Promise<Skill[]> {
      const data = loadDemoData();
      return data.skills;
    },
    
    async addSkill(input: SkillInput): Promise<Skill | null> {
      return addDemoSkill(input);
    },
    
    async updateSkill(id: string, updates: Partial<SkillInput>): Promise<Skill | null> {
      return updateDemoSkill(id, updates);
    },
    
    async deleteSkill(id: string): Promise<boolean> {
      return deleteDemoSkill(id);
    },
    
    // MCP Servers
    async getMcpServers(): Promise<MCPServer[]> {
      const data = loadDemoData();
      return data.mcpServers;
    },
    
    async addMcpServer(input: MCPServerInput): Promise<MCPServer | null> {
      return addDemoMcpServer(input);
    },
    
    async updateMcpServer(id: string, updates: Partial<MCPServerInput>): Promise<MCPServer | null> {
      return updateDemoMcpServer(id, updates);
    },
    
    async deleteMcpServer(id: string): Promise<boolean> {
      return deleteDemoMcpServer(id);
    },
    
    // Memory
    async getMemories(): Promise<Memory[]> {
      const data = loadDemoData();
      return data.memories;
    },
    
    async addMemory(input: MemoryInput): Promise<Memory | null> {
      return addDemoMemory(input);
    },
    
    async updateMemory(id: string, updates: Partial<MemoryInput>): Promise<Memory | null> {
      return updateDemoMemory(id, updates);
    },
    
    async deleteMemory(id: string): Promise<boolean> {
      return deleteDemoMemory(id);
    },
  };
}

// Re-export useful functions for the demo page
export { resetDemoData, loadDemoData } from "@/lib/demo-storage";

