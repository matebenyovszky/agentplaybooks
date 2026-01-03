/**
 * Supabase Storage Adapter
 * 
 * Implements StorageAdapter for authenticated users using Supabase.
 */

import { createBrowserClient } from "@/lib/supabase/client";
import type { Persona, Skill, MCPServer, Memory, Playbook } from "@/lib/supabase/types";
import type { StorageAdapter, PersonaInput, SkillInput, MCPServerInput, MemoryInput } from "./types";

export function createSupabaseAdapter(playbookId: string): StorageAdapter {
  const supabase = createBrowserClient();
  
  return {
    isDemo: false,
    
    // Playbook
    async getPlaybook(): Promise<Playbook | null> {
      const { data, error } = await supabase
        .from("playbooks")
        .select("*")
        .eq("id", playbookId)
        .single();
      
      if (error) {
        console.error("Error fetching playbook:", error);
        return null;
      }
      return data as Playbook;
    },
    
    async updatePlaybook(updates: Partial<Playbook>): Promise<Playbook | null> {
      const { data, error } = await supabase
        .from("playbooks")
        .update(updates)
        .eq("id", playbookId)
        .select()
        .single();
      
      if (error) {
        console.error("Error updating playbook:", error);
        return null;
      }
      return data as Playbook;
    },
    
    // Personas
    async getPersonas(): Promise<Persona[]> {
      const { data, error } = await supabase
        .from("personas")
        .select("*")
        .eq("playbook_id", playbookId)
        .order("created_at");
      
      if (error) {
        console.error("Error fetching personas:", error);
        return [];
      }
      return (data as Persona[]) || [];
    },
    
    async addPersona(input: PersonaInput): Promise<Persona | null> {
      const { data, error } = await supabase
        .from("personas")
        .insert({
          playbook_id: playbookId,
          ...input,
        })
        .select()
        .single();
      
      if (error) {
        console.error("Error adding persona:", error);
        return null;
      }
      return data as Persona;
    },
    
    async updatePersona(id: string, updates: Partial<PersonaInput>): Promise<Persona | null> {
      const { data, error } = await supabase
        .from("personas")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      
      if (error) {
        console.error("Error updating persona:", error);
        return null;
      }
      return data as Persona;
    },
    
    async deletePersona(id: string): Promise<boolean> {
      const { error } = await supabase
        .from("personas")
        .delete()
        .eq("id", id);
      
      if (error) {
        console.error("Error deleting persona:", error);
        return false;
      }
      return true;
    },
    
    // Skills
    async getSkills(): Promise<Skill[]> {
      const { data, error } = await supabase
        .from("skills")
        .select("*")
        .eq("playbook_id", playbookId)
        .order("created_at");
      
      if (error) {
        console.error("Error fetching skills:", error);
        return [];
      }
      return (data as Skill[]) || [];
    },
    
    async addSkill(input: SkillInput): Promise<Skill | null> {
      const { data, error } = await supabase
        .from("skills")
        .insert({
          playbook_id: playbookId,
          ...input,
        })
        .select()
        .single();
      
      if (error) {
        console.error("Error adding skill:", error);
        return null;
      }
      return data as Skill;
    },
    
    async updateSkill(id: string, updates: Partial<SkillInput>): Promise<Skill | null> {
      const { data, error } = await supabase
        .from("skills")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      
      if (error) {
        console.error("Error updating skill:", error);
        return null;
      }
      return data as Skill;
    },
    
    async deleteSkill(id: string): Promise<boolean> {
      const { error } = await supabase
        .from("skills")
        .delete()
        .eq("id", id);
      
      if (error) {
        console.error("Error deleting skill:", error);
        return false;
      }
      return true;
    },
    
    // MCP Servers
    async getMcpServers(): Promise<MCPServer[]> {
      const { data, error } = await supabase
        .from("mcp_servers")
        .select("*")
        .eq("playbook_id", playbookId)
        .order("created_at");
      
      if (error) {
        console.error("Error fetching MCP servers:", error);
        return [];
      }
      return (data as MCPServer[]) || [];
    },
    
    async addMcpServer(input: MCPServerInput): Promise<MCPServer | null> {
      const { data, error } = await supabase
        .from("mcp_servers")
        .insert({
          playbook_id: playbookId,
          ...input,
        })
        .select()
        .single();
      
      if (error) {
        console.error("Error adding MCP server:", error);
        return null;
      }
      return data as MCPServer;
    },
    
    async updateMcpServer(id: string, updates: Partial<MCPServerInput>): Promise<MCPServer | null> {
      const { data, error } = await supabase
        .from("mcp_servers")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      
      if (error) {
        console.error("Error updating MCP server:", error);
        return null;
      }
      return data as MCPServer;
    },
    
    async deleteMcpServer(id: string): Promise<boolean> {
      const { error } = await supabase
        .from("mcp_servers")
        .delete()
        .eq("id", id);
      
      if (error) {
        console.error("Error deleting MCP server:", error);
        return false;
      }
      return true;
    },
    
    // Memory
    async getMemories(): Promise<Memory[]> {
      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .eq("playbook_id", playbookId)
        .order("updated_at", { ascending: false });
      
      if (error) {
        console.error("Error fetching memories:", error);
        return [];
      }
      return (data as Memory[]) || [];
    },
    
    async addMemory(input: MemoryInput): Promise<Memory | null> {
      const { data, error } = await supabase
        .from("memories")
        .insert({
          playbook_id: playbookId,
          ...input,
        })
        .select()
        .single();
      
      if (error) {
        console.error("Error adding memory:", error);
        return null;
      }
      return data as Memory;
    },
    
    async updateMemory(id: string, updates: Partial<MemoryInput>): Promise<Memory | null> {
      const { data, error } = await supabase
        .from("memories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      
      if (error) {
        console.error("Error updating memory:", error);
        return null;
      }
      return data as Memory;
    },
    
    async deleteMemory(id: string): Promise<boolean> {
      const { error } = await supabase
        .from("memories")
        .delete()
        .eq("id", id);
      
      if (error) {
        console.error("Error deleting memory:", error);
        return false;
      }
      return true;
    },
  };
}

