/**
 * Storage Module
 * 
 * Provides abstracted storage adapters for both authenticated (Supabase)
 * and demo (localStorage) modes.
 */

export type { StorageAdapter, PersonaInput, SkillInput, MCPServerInput, MemoryInput, EditorContext } from "./types";
export { createSupabaseAdapter } from "./supabase-adapter";
export { createDemoAdapter, resetDemoData, loadDemoData } from "./demo-adapter";

