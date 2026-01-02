// Demo Storage - localStorage wrapper for demo mode
// Simulates Supabase operations for unauthenticated users

import type { Playbook, Persona, Skill, MCPServer, Memory, ApiKey } from "@/lib/supabase/types";

const STORAGE_KEY = "agentplaybooks_demo";

interface DemoData {
  playbook: Playbook;
  personas: Persona[];
  skills: Skill[];
  mcpServers: MCPServer[];
  memories: Memory[];
  apiKeys: ApiKey[];
}

// Generate a unique ID
function generateId(): string {
  return crypto.randomUUID();
}

// Generate demo GUID
function generateGuid(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

// Default demo data
function getDefaultDemoData(): DemoData {
  const playbookId = generateId();
  const personaId = generateId();
  const skillId = generateId();
  
  return {
    playbook: {
      id: playbookId,
      user_id: "demo-user",
      guid: "demo" + generateGuid().slice(4),
      name: "My AI Assistant",
      description: "A helpful AI assistant configured with personas, skills, and memory. Try editing this playbook to see how it works!",
      config: {},
      is_public: true,
      star_count: 0,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    personas: [
      {
        id: personaId,
        playbook_id: playbookId,
        name: "Helpful Coder",
        system_prompt: `You are a helpful coding assistant with the following characteristics:

- Expert in TypeScript, React, and Node.js
- Always explain your reasoning before providing code
- Suggest best practices and potential improvements
- Be concise but thorough
- Use modern syntax and patterns

When reviewing code:
1. Check for bugs and edge cases
2. Suggest performance optimizations
3. Ensure proper error handling
4. Recommend testing approaches`,
        metadata: { language: "en", expertise: ["typescript", "react", "node"] },
        created_at: new Date().toISOString(),
      },
    ],
    skills: [
      {
        id: skillId,
        playbook_id: playbookId,
        name: "code_review",
        description: "Review code for bugs, performance issues, and best practices",
        definition: {
          parameters: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "The code to review"
              },
              language: {
                type: "string",
                description: "Programming language of the code"
              },
              focus: {
                type: "string",
                description: "What to focus on: bugs, performance, style, or all",
                enum: ["bugs", "performance", "style", "all"]
              }
            },
            required: ["code"]
          }
        },
        examples: [
          {
            input: { code: "const x = arr.map(i => i*2)", language: "javascript" },
            output: "The code is simple and correct. Consider adding type annotations for better maintainability."
          }
        ],
        created_at: new Date().toISOString(),
      },
    ],
    mcpServers: [],
    memories: [
      {
        id: generateId(),
        playbook_id: playbookId,
        key: "user_preferences",
        value: {
          theme: "dark",
          language: "en",
          codeStyle: "functional"
        },
        updated_at: new Date().toISOString(),
      },
    ],
    apiKeys: [],
  };
}

// Load demo data from localStorage
export function loadDemoData(): DemoData {
  if (typeof window === "undefined") {
    return getDefaultDemoData();
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load demo data:", e);
  }
  
  const defaultData = getDefaultDemoData();
  saveDemoData(defaultData);
  return defaultData;
}

// Save demo data to localStorage
export function saveDemoData(data: DemoData): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save demo data:", e);
  }
}

// Reset demo data to default
export function resetDemoData(): DemoData {
  const defaultData = getDefaultDemoData();
  saveDemoData(defaultData);
  return defaultData;
}

// Check if demo data exists
export function hasDemoData(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) !== null;
}

// Update playbook
export function updateDemoPlaybook(updates: Partial<Playbook>): Playbook {
  const data = loadDemoData();
  data.playbook = { ...data.playbook, ...updates, updated_at: new Date().toISOString() };
  saveDemoData(data);
  return data.playbook;
}

// Persona operations
export function addDemoPersona(persona: Omit<Persona, "id" | "created_at" | "playbook_id">): Persona {
  const data = loadDemoData();
  const newPersona: Persona = {
    ...persona,
    id: generateId(),
    playbook_id: data.playbook.id,
    created_at: new Date().toISOString(),
  };
  data.personas.push(newPersona);
  saveDemoData(data);
  return newPersona;
}

export function updateDemoPersona(id: string, updates: Partial<Persona>): Persona | null {
  const data = loadDemoData();
  const index = data.personas.findIndex(p => p.id === id);
  if (index === -1) return null;
  data.personas[index] = { ...data.personas[index], ...updates };
  saveDemoData(data);
  return data.personas[index];
}

export function deleteDemoPersona(id: string): boolean {
  const data = loadDemoData();
  const index = data.personas.findIndex(p => p.id === id);
  if (index === -1) return false;
  data.personas.splice(index, 1);
  saveDemoData(data);
  return true;
}

// Skill operations
export function addDemoSkill(skill: Omit<Skill, "id" | "created_at" | "playbook_id">): Skill {
  const data = loadDemoData();
  const newSkill: Skill = {
    ...skill,
    id: generateId(),
    playbook_id: data.playbook.id,
    created_at: new Date().toISOString(),
  };
  data.skills.push(newSkill);
  saveDemoData(data);
  return newSkill;
}

export function updateDemoSkill(id: string, updates: Partial<Skill>): Skill | null {
  const data = loadDemoData();
  const index = data.skills.findIndex(s => s.id === id);
  if (index === -1) return null;
  data.skills[index] = { ...data.skills[index], ...updates };
  saveDemoData(data);
  return data.skills[index];
}

export function deleteDemoSkill(id: string): boolean {
  const data = loadDemoData();
  const index = data.skills.findIndex(s => s.id === id);
  if (index === -1) return false;
  data.skills.splice(index, 1);
  saveDemoData(data);
  return true;
}

// MCP Server operations
export function addDemoMcpServer(mcp: Omit<MCPServer, "id" | "created_at" | "playbook_id">): MCPServer {
  const data = loadDemoData();
  const newMcp: MCPServer = {
    ...mcp,
    id: generateId(),
    playbook_id: data.playbook.id,
    created_at: new Date().toISOString(),
  };
  data.mcpServers.push(newMcp);
  saveDemoData(data);
  return newMcp;
}

export function updateDemoMcpServer(id: string, updates: Partial<MCPServer>): MCPServer | null {
  const data = loadDemoData();
  const index = data.mcpServers.findIndex(m => m.id === id);
  if (index === -1) return null;
  data.mcpServers[index] = { ...data.mcpServers[index], ...updates };
  saveDemoData(data);
  return data.mcpServers[index];
}

export function deleteDemoMcpServer(id: string): boolean {
  const data = loadDemoData();
  const index = data.mcpServers.findIndex(m => m.id === id);
  if (index === -1) return false;
  data.mcpServers.splice(index, 1);
  saveDemoData(data);
  return true;
}

// Memory operations
export function addDemoMemory(memory: Omit<Memory, "id" | "updated_at" | "playbook_id">): Memory {
  const data = loadDemoData();
  const newMemory: Memory = {
    ...memory,
    id: generateId(),
    playbook_id: data.playbook.id,
    updated_at: new Date().toISOString(),
  };
  data.memories.push(newMemory);
  saveDemoData(data);
  return newMemory;
}

export function updateDemoMemory(id: string, updates: Partial<Memory>): Memory | null {
  const data = loadDemoData();
  const index = data.memories.findIndex(m => m.id === id);
  if (index === -1) return null;
  data.memories[index] = { ...data.memories[index], ...updates, updated_at: new Date().toISOString() };
  saveDemoData(data);
  return data.memories[index];
}

export function deleteDemoMemory(id: string): boolean {
  const data = loadDemoData();
  const index = data.memories.findIndex(m => m.id === id);
  if (index === -1) return false;
  data.memories.splice(index, 1);
  saveDemoData(data);
  return true;
}

