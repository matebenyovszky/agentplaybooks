/**
 * Storage Module
 * 
 * Provides abstracted storage adapters for authenticated (Supabase) mode.
 */

export type { StorageAdapter, PersonaInput, SkillInput, MCPServerInput, PlaybookRunInput, CanvasInput, MemoryInput, EditorContext } from "./types";
export { createSupabaseAdapter } from "./supabase-adapter";
