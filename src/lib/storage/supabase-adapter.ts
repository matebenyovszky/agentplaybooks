/**
 * Supabase Storage Adapter
 * 
 * Implements StorageAdapter for authenticated users using Supabase.
 */

import { createBrowserClient } from "@/lib/supabase/client";
import type { Persona, Skill, MCPServer, Memory, Playbook } from "@/lib/supabase/types";
import type { StorageAdapter, PersonaInput, SkillInput, MCPServerInput, MemoryInput } from "./types";

type PersonaSource = Pick<
  Playbook,
  "id" | "created_at" | "persona_name" | "persona_system_prompt" | "persona_metadata"
>;

export function createSupabaseAdapter(playbookId: string): StorageAdapter {
  const supabase = createBrowserClient();

  function playbookToPersona(playbook: PersonaSource): Persona {
    return {
      id: playbook.id,
      playbook_id: playbook.id,
      name: playbook.persona_name || "Assistant",
      system_prompt: playbook.persona_system_prompt || "You are a helpful AI assistant.",
      metadata: (playbook.persona_metadata as Record<string, unknown>) || {},
      created_at: playbook.created_at,
    };
  }

  return {
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
      const { data: playbook, error } = await supabase
        .from("playbooks")
        .select("id, created_at, persona_name, persona_system_prompt, persona_metadata")
        .eq("id", playbookId)
        .single();

      const playbookData = playbook as PersonaSource | null;
      if (error || !playbookData) {
        console.error("Error fetching playbook persona:", error);
        return [];
      }

      return [playbookToPersona(playbookData)];
    },

    async addPersona(input: PersonaInput): Promise<Persona | null> {
      // 1 playbook = 1 persona: "add" is effectively "set/overwrite"
      const { data: playbook, error } = await supabase
        .from("playbooks")
        .update({
          persona_name: input.name ?? "Assistant",
          persona_system_prompt: input.system_prompt ?? "You are a helpful AI assistant.",
          persona_metadata: input.metadata ?? {},
        })
        .eq("id", playbookId)
        .select("id, created_at, persona_name, persona_system_prompt, persona_metadata")
        .single();

      const playbookData = playbook as PersonaSource | null;
      if (error || !playbookData) {
        console.error("Error setting persona:", error);
        return null;
      }

      return playbookToPersona(playbookData);
    },

    async updatePersona(id: string, updates: Partial<PersonaInput>): Promise<Persona | null> {
      // We use playbookId as persona id (singleton persona per playbook)
      if (id !== playbookId) {
        console.error("Error updating persona: persona id mismatch", { id, playbookId });
        return null;
      }

      const updateData: Record<string, unknown> = {};
      if (updates.name !== undefined) updateData.persona_name = updates.name;
      if (updates.system_prompt !== undefined) updateData.persona_system_prompt = updates.system_prompt;
      if (updates.metadata !== undefined) updateData.persona_metadata = updates.metadata;

      const { data: playbook, error } = await supabase
        .from("playbooks")
        .update(updateData)
        .eq("id", playbookId)
        .select("id, created_at, persona_name, persona_system_prompt, persona_metadata")
        .single();

      const playbookData = playbook as PersonaSource | null;
      if (error || !playbookData) {
        console.error("Error updating persona:", error);
        return null;
      }

      return playbookToPersona(playbookData);
    },

    async deletePersona(id: string): Promise<boolean> {
      // Reset to default persona (still 1 persona per playbook)
      if (id !== playbookId) {
        console.error("Error deleting persona: persona id mismatch", { id, playbookId });
        return false;
      }

      const { error } = await supabase
        .from("playbooks")
        .update({
          persona_name: "Assistant",
          persona_system_prompt: "You are a helpful AI assistant.",
          persona_metadata: {},
        })
        .eq("id", playbookId);

      if (error) {
        console.error("Error resetting persona:", error);
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
      const insertData: Record<string, unknown> = {
        playbook_id: playbookId,
        key: input.key,
        value: input.value,
      };
      if (input.tags !== undefined) insertData.tags = input.tags;
      if (input.description !== undefined) insertData.description = input.description;
      if (input.tier !== undefined) insertData.tier = input.tier;
      if (input.priority !== undefined) insertData.priority = input.priority;
      if (input.parent_key !== undefined) insertData.parent_key = input.parent_key;
      if (input.summary !== undefined) insertData.summary = input.summary;
      if (input.memory_type !== undefined) insertData.memory_type = input.memory_type;
      if (input.status !== undefined) insertData.status = input.status;
      if (input.metadata !== undefined) insertData.metadata = input.metadata;

      const { data, error } = await supabase
        .from("memories")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error("Error adding memory:", error, error.message, error.details, error.hint);
        return null;
      }
      return data as Memory;
    },

    async updateMemory(id: string, updates: Partial<MemoryInput>): Promise<Memory | null> {
      const updateData: Record<string, unknown> = {};
      if (updates.key !== undefined) updateData.key = updates.key;
      if (updates.value !== undefined) updateData.value = updates.value;
      if (updates.tags !== undefined) updateData.tags = updates.tags;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.tier !== undefined) updateData.tier = updates.tier;
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.parent_key !== undefined) updateData.parent_key = updates.parent_key;
      if (updates.summary !== undefined) updateData.summary = updates.summary;
      if (updates.memory_type !== undefined) updateData.memory_type = updates.memory_type;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

      const { data, error } = await supabase
        .from("memories")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error updating memory:", error, error.message, error.details, error.hint);
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
        console.error("Error deleting memory:", error, error.message, error.details, error.hint);
        return false;
      }
      return true;
    },
  };
}

