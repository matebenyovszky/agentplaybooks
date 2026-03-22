/**
 * API-backed Storage Adapter
 * 
 * Implements StorageAdapter using server-side API routes for all operations.
 */

import { authFetch } from "@/lib/auth-fetch";
import type { Persona, Skill, MCPServer, Memory, Playbook, SecretMetadata, SecretCategory } from "@/lib/supabase/types";
import type { StorageAdapter, PersonaInput, SkillInput, MCPServerInput, MemoryInput, SecretInput } from "./types";

type PersonaSource = Pick<
  Playbook,
  "id" | "created_at" | "persona_name" | "persona_system_prompt" | "persona_metadata"
>;

export function createSupabaseAdapter(playbookId: string, playbookGuid?: string): StorageAdapter {
  const requestJson = async <T>(url: string, init: RequestInit = {}): Promise<T | null> => {
    const headers: HeadersInit = {
      ...(init.headers || {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    };

    try {
      const res = await authFetch(url, {
        ...init,
        headers,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error");
        console.error(`API error (${res.status}) for ${url}:`, errorText);
        return null;
      }

      return (await res.json().catch(() => null)) as T | null;
    } catch (error) {
      console.error(`Request failed for ${url}:`, error);
      return null;
    }
  };

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
      return await requestJson<Playbook>(`/api/manage/playbooks/${playbookId}`);
    },

    async updatePlaybook(updates: Partial<Playbook>): Promise<Playbook | null> {
      return await requestJson<Playbook>(`/api/manage/playbooks/${playbookId}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
    },

    // Personas
    async getPersonas(): Promise<Persona[]> {
      const playbook = await requestJson<PersonaSource>(`/api/manage/playbooks/${playbookId}`);
      if (!playbook) {
        return [];
      }

      return [playbookToPersona(playbook)];
    },

    async addPersona(input: PersonaInput): Promise<Persona | null> {
      // 1 playbook = 1 persona: "add" is effectively "set/overwrite"
      return await requestJson<Persona>(`/api/manage/playbooks/${playbookId}/personas`, {
        method: "POST",
        body: JSON.stringify({
          name: input.name || "Assistant",
          system_prompt: input.system_prompt || "You are a helpful AI assistant.",
          metadata: input.metadata || {},
        }),
      });
    },

    async updatePersona(id: string, updates: Partial<PersonaInput>): Promise<Persona | null> {
      // We use playbookId as persona id (singleton persona per playbook)
      if (id !== playbookId) {
        console.error("Error updating persona: persona id mismatch", { id, playbookId });
        return null;
      }

      return await requestJson<Persona>(`/api/manage/playbooks/${playbookId}/personas/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
    },

    async deletePersona(id: string): Promise<boolean> {
      // Reset to default persona (still 1 persona per playbook)
      if (id !== playbookId) {
        console.error("Error deleting persona: persona id mismatch", { id, playbookId });
        return false;
      }

      const data = await requestJson<{ success: boolean }>(`/api/manage/playbooks/${playbookId}/personas/${id}`, {
        method: "DELETE",
      });

      return data?.success === true;
    },

    // Skills
    async getSkills(): Promise<Skill[]> {
      const data = await requestJson<{ skills: Skill[] }>(`/api/manage/playbooks/${playbookId}`);
      return (data?.skills as Skill[]) || [];
    },

    async addSkill(input: SkillInput): Promise<Skill | null> {
      return await requestJson<Skill>(`/api/manage/playbooks/${playbookId}/skills`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    async updateSkill(id: string, updates: Partial<SkillInput>): Promise<Skill | null> {
      return await requestJson<Skill>(`/api/manage/playbooks/${playbookId}/skills/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
    },

    async deleteSkill(id: string): Promise<boolean> {
      const data = await requestJson<{ success: boolean }>(`/api/manage/playbooks/${playbookId}/skills/${id}`, {
        method: "DELETE",
      });
      return data?.success === true;
    },

    // MCP Servers
    async getMcpServers(): Promise<MCPServer[]> {
      const data = await requestJson<MCPServer[]>(`/api/manage/playbooks/${playbookId}/mcp-servers`);
      return (data || []) as MCPServer[];
    },

    async addMcpServer(input: MCPServerInput): Promise<MCPServer | null> {
      return await requestJson<MCPServer>(`/api/manage/playbooks/${playbookId}/mcp-servers`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    async updateMcpServer(id: string, updates: Partial<MCPServerInput>): Promise<MCPServer | null> {
      return await requestJson<MCPServer>(`/api/manage/playbooks/${playbookId}/mcp-servers/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
    },

    async deleteMcpServer(id: string): Promise<boolean> {
      const data = await requestJson<{ success: boolean }>(`/api/manage/playbooks/${playbookId}/mcp-servers/${id}`, {
        method: "DELETE",
      });
      return data?.success === true;
    },

    // Memory
    async getMemories(): Promise<Memory[]> {
      const memories = await requestJson<Memory[]>(`/api/manage/playbooks/${playbookId}/memory`);
      return memories || [];
    },

    async addMemory(input: MemoryInput): Promise<Memory | null> {
      if (!input.key) {
        console.error("Error adding memory: key is required");
        return null;
      }

      return await requestJson<Memory>(`/api/manage/playbooks/${playbookId}/memory/${encodeURIComponent(input.key)}`, {
        method: "PUT",
        body: JSON.stringify({
          value: input.value,
          tags: input.tags,
          description: input.description,
          tier: input.tier,
          parent_key: input.parent_key,
          priority: input.priority,
          summary: input.summary,
          memory_type: input.memory_type,
          status: input.status,
          metadata: input.metadata,
        }),
      });
    },

    async updateMemory(id: string, updates: Partial<MemoryInput>): Promise<Memory | null> {
      const memories = await requestJson<Memory[]>(`/api/manage/playbooks/${playbookId}/memory`);
      if (!Array.isArray(memories)) {
        return null;
      }

      const target = memories.find((memory) => memory.id === id);
      if (!target) {
        console.error("Error updating memory: memory not found", { id });
        return null;
      }

      return await requestJson<Memory>(`/api/manage/playbooks/${playbookId}/memory/${encodeURIComponent(target.key)}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
    },

    async deleteMemory(id: string): Promise<boolean> {
      const memories = await requestJson<Memory[]>(`/api/manage/playbooks/${playbookId}/memory`);
      if (!Array.isArray(memories)) {
        return false;
      }
      const target = memories.find((memory) => memory.id === id);
      if (!target) {
        console.error("Error deleting memory: memory not found", { id });
        return false;
      }

      const data = await requestJson<{ success: boolean }>(`/api/manage/playbooks/${playbookId}/memory/${encodeURIComponent(target.key)}`, {
        method: "DELETE",
      });
      return data?.success === true;
    },

    // Secrets - these go through the API route (crypto is server-side)
    async getSecrets(category?: SecretCategory): Promise<SecretMetadata[]> {
      const guid = playbookGuid || playbookId;
      const url = `/api/playbooks/${guid}/secrets` + (category ? `?category=${category}` : "");
      try {
        const res = await authFetch(url);
        if (!res.ok) {
          console.error("Error fetching secrets:", await res.text());
          return [];
        }
        return await res.json();
      } catch (err) {
        console.error("Error fetching secrets:", err);
        return [];
      }
    },

    async addSecret(input: SecretInput): Promise<SecretMetadata | null> {
      const guid = playbookGuid || playbookId;
      try {
        const res = await authFetch(`/api/playbooks/${guid}/secrets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const errorText = await res.text();
          let errorMessage = `Failed to create secret (${res.status})`;
          try {
            const parsed = JSON.parse(errorText) as { error?: unknown };
            if (typeof parsed.error === "string" && parsed.error.length > 0) {
              errorMessage = parsed.error;
            }
          } catch {
            if (errorText.length > 0) {
              errorMessage = errorText;
            }
          }
          console.error("Error adding secret:", errorMessage);
          throw new Error(errorMessage);
        }
        return await res.json();
      } catch (err) {
        console.error("Error adding secret:", err);
        if (err instanceof Error) {
          throw err;
        }
        throw new Error("Unknown error while adding secret");
      }
    },

    async updateSecret(name: string, data: Partial<SecretInput>): Promise<SecretMetadata | null> {
      const guid = playbookGuid || playbookId;
      try {
        const res = await authFetch(`/api/playbooks/${guid}/secrets/${encodeURIComponent(name)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json();
          console.error("Error updating secret:", err);
          return null;
        }
        return await res.json();
      } catch (err) {
        console.error("Error updating secret:", err);
        return null;
      }
    },

    async deleteSecret(name: string): Promise<boolean> {
      const guid = playbookGuid || playbookId;
      try {
        const res = await authFetch(`/api/playbooks/${guid}/secrets/${encodeURIComponent(name)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          console.error("Error deleting secret:", await res.text());
          return false;
        }
        return true;
      } catch (err) {
        console.error("Error deleting secret:", err);
        return false;
      }
    },

    async revealSecret(name: string): Promise<string | null> {
      const guid = playbookGuid || playbookId;
      try {
        const res = await authFetch(`/api/playbooks/${guid}/secrets/reveal/${encodeURIComponent(name)}`);
        if (!res.ok) {
          console.error("Error revealing secret:", await res.text());
          return null;
        }
        const data = await res.json();
        return data.value;
      } catch (err) {
        console.error("Error revealing secret:", err);
        return null;
      }
    },
  };
}

