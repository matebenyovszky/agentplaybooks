"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { 
  Database,
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Plus,
  Edit3,
  AlertCircle,
  Clock,
  Search,
  RefreshCw
} from "lucide-react";
import type { Memory } from "@/lib/supabase/types";

interface MemoryEditorProps {
  playbook_id: string;
  memories: Memory[];
  onUpdate: (memories: Memory[]) => void;
}

export function MemoryEditor({ playbook_id, memories, onUpdate }: MemoryEditorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editValue, setEditValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Filter memories by search
  const filteredMemories = memories.filter(m => 
    m.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
    JSON.stringify(m.value).toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Validate JSON when editing
  useEffect(() => {
    if (!editingMemory) return;
    try {
      JSON.parse(editValue);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON");
    }
  }, [editValue, editingMemory]);

  const handleRefresh = async () => {
    setLoading(true);
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("memories")
      .select("*")
      .eq("playbook_id", playbook_id);
    
    if (data) {
      onUpdate(data as Memory[]);
    }
    setLoading(false);
  };

  const handleAddMemory = async () => {
    const key = prompt("Memory key (e.g., user_preferences):");
    if (!key) return;

    setSaving(true);
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("memories")
      .insert({
        playbook_id,
        key,
        value: {}
      })
      .select()
      .single();

    if (!error && data) {
      onUpdate([...memories, data as Memory]);
      // Open for editing immediately
      setEditingMemory(data as Memory);
      setEditKey(key);
      setEditValue("{}");
    }
    setSaving(false);
  };

  const handleSaveMemory = async () => {
    if (!editingMemory || jsonError) return;

    setSaving(true);
    try {
      const parsedValue = JSON.parse(editValue);
      const supabase = createBrowserClient();
      
      const { error } = await supabase
        .from("memories")
        .update({ 
          key: editKey,
          value: parsedValue 
        })
        .eq("id", editingMemory.id);

      if (!error) {
        onUpdate(memories.map(m => 
          m.id === editingMemory.id 
            ? { ...m, key: editKey, value: parsedValue }
            : m
        ));
        setEditingMemory(null);
      }
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMemory = async (memory: Memory) => {
    if (!confirm(`Delete memory "${memory.key}"?`)) return;

    const supabase = createBrowserClient();
    const { error } = await supabase
      .from("memories")
      .delete()
      .eq("id", memory.id);

    if (!error) {
      onUpdate(memories.filter(m => m.id !== memory.id));
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const startEditing = (memory: Memory) => {
    setEditingMemory(memory);
    setEditKey(memory.key);
    setEditValue(JSON.stringify(memory.value, null, 2));
    setJsonError(null);
  };

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories..."
            className={cn(
              "w-full pl-10 pr-4 py-2 rounded-lg",
              "bg-slate-900/70 border border-slate-700/50",
              "text-slate-200 placeholder:text-slate-600",
              "focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20"
            )}
          />
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className={cn(
            "p-2 rounded-lg text-slate-400 hover:text-white",
            "hover:bg-slate-700/50 transition-colors",
            loading && "animate-spin"
          )}
          title="Refresh memories"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
        <button
          onClick={handleAddMemory}
          disabled={saving}
          className={cn(
            "px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium",
            "bg-teal-600/20 text-teal-400 border border-teal-500/30",
            "hover:bg-teal-600/30 transition-colors"
          )}
        >
          <Plus className="h-4 w-4" />
          Add Memory
        </button>
      </div>

      {/* Empty State */}
      {memories.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-8 text-center bg-slate-900/50 rounded-xl border border-dashed border-slate-700"
        >
          <Database className="h-12 w-12 text-slate-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-400 mb-2">No memories yet</h3>
          <p className="text-sm text-slate-500 mb-4">
            AI agents can write memories via the API, or you can add them manually.
          </p>
          <button
            onClick={handleAddMemory}
            className={cn(
              "px-4 py-2 rounded-lg inline-flex items-center gap-2 text-sm font-medium",
              "bg-teal-600/20 text-teal-400 border border-teal-500/30",
              "hover:bg-teal-600/30 transition-colors"
            )}
          >
            <Plus className="h-4 w-4" />
            Add First Memory
          </button>
        </motion.div>
      )}

      {/* Memory List */}
      {filteredMemories.length > 0 && (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredMemories.map((memory) => (
              <motion.div
                key={memory.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={cn(
                  "rounded-xl border transition-all duration-200",
                  "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
                  "border-teal-900/30 hover:border-teal-700/50"
                )}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "p-1.5 rounded-lg",
                        "bg-gradient-to-br from-teal-600/20 to-cyan-600/20",
                        "border border-teal-500/20"
                      )}>
                        <Database className="h-4 w-4 text-teal-400" />
                      </div>
                      <code className="text-teal-300 font-semibold">{memory.key}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        {new Date(memory.updated_at).toLocaleString()}
                      </span>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(memory.value, null, 2), memory.id)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                        title="Copy value"
                      >
                        {copiedKey === memory.id ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => startEditing(memory)}
                        className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-teal-500/10 rounded-lg transition-colors"
                        title="Edit memory"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteMemory(memory)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete memory"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  <pre className={cn(
                    "p-3 rounded-lg overflow-x-auto",
                    "bg-slate-900/70 border border-slate-700/50",
                    "text-sm text-slate-300 font-mono"
                  )}>
                    {JSON.stringify(memory.value, null, 2)}
                  </pre>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* No Results */}
      {memories.length > 0 && filteredMemories.length === 0 && (
        <div className="p-6 text-center text-slate-500">
          No memories matching "{searchQuery}"
        </div>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {editingMemory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setEditingMemory(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "w-full max-w-2xl rounded-2xl",
                "bg-gradient-to-br from-slate-900 to-slate-800",
                "border border-slate-700 shadow-2xl"
              )}
            >
              <div className="p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Edit Memory</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      Key
                    </label>
                    <input
                      type="text"
                      value={editKey}
                      onChange={(e) => setEditKey(e.target.value)}
                      className={cn(
                        "w-full p-3 rounded-lg",
                        "bg-slate-900/70 border border-slate-700/50",
                        "text-slate-200 font-mono",
                        "focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20"
                      )}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      Value (JSON)
                    </label>
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className={cn(
                        "w-full h-64 p-3 rounded-lg",
                        "bg-slate-900/70 border",
                        jsonError ? "border-red-500/50" : "border-slate-700/50",
                        "text-slate-200 font-mono text-sm",
                        "focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20",
                        "resize-y"
                      )}
                    />
                    {jsonError && (
                      <div className="flex items-center gap-2 mt-2 text-red-400 text-sm">
                        <AlertCircle className="h-4 w-4" />
                        {jsonError}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setEditingMemory(null)}
                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveMemory}
                    disabled={saving || !!jsonError}
                    className={cn(
                      "px-4 py-2 rounded-lg font-medium",
                      "bg-teal-600 text-white",
                      "hover:bg-teal-500 transition-colors",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MemoryEditor;

