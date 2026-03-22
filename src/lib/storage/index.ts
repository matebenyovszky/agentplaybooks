/**
 * Storage Module
 * 
 * Provides abstracted storage adapters for authenticated (Supabase) mode.
 */

export type { StorageAdapter, PersonaInput, SkillInput, MCPServerInput, MemoryInput, SecretInput, EditorContext } from "./types";
export { createSupabaseAdapter } from "./supabase-adapter";
