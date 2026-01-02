"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { 
  Database,
  Trash2,
  Copy,
  Check,
  Plus,
  Edit3,
  Search,
  Clock,
  X
} from "lucide-react";
import type { Memory } from "@/lib/supabase/types";

interface DemoMemoryEditorProps {
  memories: Memory[];
  onUpdate: (memories: Memory[]) => void;
  onAdd: (memory: Omit<Memory, "id" | "updated_at" | "playbook_id">) => void;
  onEdit: (id: string, updates: Partial<Memory>) => void;
  onDelete: (id: string) => void;
}

export function DemoMemoryEditor({ 
  memories, 
  onUpdate, 
  onAdd, 
  onEdit, 
  onDelete 
}: DemoMemoryEditorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editValue, setEditValue] = useState("");
  const [valueError, setValueError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("{}");
  const [newValueError, setNewValueError] = useState("");

  const filteredMemories = memories.filter(m => 
    m.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
    JSON.stringify(m.value).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatValue = (value: unknown): string => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const handleStartEdit = (memory: Memory) => {
    setEditingMemory(memory);
    setEditKey(memory.key);
    setEditValue(formatValue(memory.value));
    setValueError("");
  };

  const handleSaveEdit = () => {
    if (!editingMemory) return;
    
    try {
      const parsedValue = JSON.parse(editValue);
      onEdit(editingMemory.id, { key: editKey, value: parsedValue });
      setEditingMemory(null);
    } catch {
      setValueError("Invalid JSON");
    }
  };

  const handleCopy = (memory: Memory) => {
    navigator.clipboard.writeText(formatValue(memory.value));
    setCopied(memory.id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDelete = (memory: Memory) => {
    if (confirm(`Delete memory "${memory.key}"?`)) {
      onDelete(memory.id);
    }
  };

  const handleAddMemory = () => {
    if (!newKey.trim()) return;
    
    try {
      const parsedValue = JSON.parse(newValue);
      onAdd({ key: newKey, value: parsedValue });
      setShowAddModal(false);
      setNewKey("");
      setNewValue("{}");
      setNewValueError("");
    } catch {
      setNewValueError("Invalid JSON");
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Database className="h-5 w-5 text-teal-400" />
          Memory
        </h2>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className={cn(
                "pl-9 pr-4 py-2 rounded-lg w-64",
                "bg-slate-900/70 border border-slate-700/50",
                "text-sm text-slate-200 placeholder:text-slate-600",
                "focus:outline-none focus:border-teal-500/50"
              )}
            />
          </div>
          
          <button
            onClick={() => setShowAddModal(true)}
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
      </div>

      {/* Memory List */}
      {filteredMemories.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-12 text-center bg-slate-900/50 rounded-xl border border-dashed border-slate-700"
        >
          <Database className="h-12 w-12 mx-auto mb-4 text-teal-700" />
          <h3 className="text-lg font-medium text-slate-400 mb-2">
            {searchQuery ? "No matching memories" : "No memories yet"}
          </h3>
          <p className="text-sm text-slate-500">
            {searchQuery 
              ? "Try a different search term"
              : "Memories store key-value data for your AI agents."}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filteredMemories.map((memory) => (
            <motion.div
              key={memory.id}
              layout
              className={cn(
                "p-4 rounded-xl",
                "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
                "border border-teal-900/30 hover:border-teal-700/50",
                "transition-colors"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <code className="text-sm font-mono text-teal-400 font-semibold">
                      {memory.key}
                    </code>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(memory.updated_at).toLocaleString()}
                    </span>
                  </div>
                  <pre className={cn(
                    "text-xs font-mono p-3 rounded-lg overflow-x-auto",
                    "bg-slate-900/70 text-slate-400 border border-slate-700/30"
                  )}>
                    {formatValue(memory.value)}
                  </pre>
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopy(memory)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                    title="Copy value"
                  >
                    {copied === memory.id 
                      ? <Check className="h-4 w-4 text-green-400" /> 
                      : <Copy className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleStartEdit(memory)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(memory)}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
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
                "w-full max-w-lg rounded-2xl",
                "bg-gradient-to-br from-slate-900 to-slate-800",
                "border border-slate-700 shadow-2xl"
              )}
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Edit3 className="h-5 w-5 text-teal-400" />
                  Edit Memory
                </h3>
                <button
                  onClick={() => setEditingMemory(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Key
                  </label>
                  <input
                    type="text"
                    value={editKey}
                    onChange={(e) => setEditKey(e.target.value)}
                    className={cn(
                      "w-full p-3 rounded-lg font-mono",
                      "bg-slate-900/70 border border-slate-700/50",
                      "text-slate-200 focus:outline-none focus:border-teal-500/50"
                    )}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Value (JSON)
                  </label>
                  <textarea
                    value={editValue}
                    onChange={(e) => {
                      setEditValue(e.target.value);
                      try {
                        JSON.parse(e.target.value);
                        setValueError("");
                      } catch {
                        setValueError("Invalid JSON");
                      }
                    }}
                    className={cn(
                      "w-full p-3 rounded-lg font-mono text-sm",
                      "bg-slate-900/70 border",
                      valueError ? "border-red-500/50" : "border-slate-700/50",
                      "text-slate-200 focus:outline-none focus:border-teal-500/50",
                      "resize-y min-h-[150px]"
                    )}
                  />
                  {valueError && (
                    <p className="text-red-400 text-sm mt-1">{valueError}</p>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end gap-3 p-4 border-t border-slate-700/50">
                <button
                  onClick={() => setEditingMemory(null)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!!valueError}
                  className={cn(
                    "px-4 py-2 rounded-lg font-medium",
                    "bg-teal-600 text-white hover:bg-teal-500",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "w-full max-w-lg rounded-2xl",
                "bg-gradient-to-br from-slate-900 to-slate-800",
                "border border-slate-700 shadow-2xl"
              )}
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Plus className="h-5 w-5 text-teal-400" />
                  Add Memory
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Key
                  </label>
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="memory_key"
                    className={cn(
                      "w-full p-3 rounded-lg font-mono",
                      "bg-slate-900/70 border border-slate-700/50",
                      "text-slate-200 placeholder:text-slate-600",
                      "focus:outline-none focus:border-teal-500/50"
                    )}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Value (JSON)
                  </label>
                  <textarea
                    value={newValue}
                    onChange={(e) => {
                      setNewValue(e.target.value);
                      try {
                        JSON.parse(e.target.value);
                        setNewValueError("");
                      } catch {
                        setNewValueError("Invalid JSON");
                      }
                    }}
                    className={cn(
                      "w-full p-3 rounded-lg font-mono text-sm",
                      "bg-slate-900/70 border",
                      newValueError ? "border-red-500/50" : "border-slate-700/50",
                      "text-slate-200 placeholder:text-slate-600",
                      "focus:outline-none focus:border-teal-500/50",
                      "resize-y min-h-[150px]"
                    )}
                    placeholder="{}"
                  />
                  {newValueError && (
                    <p className="text-red-400 text-sm mt-1">{newValueError}</p>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end gap-3 p-4 border-t border-slate-700/50">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMemory}
                  disabled={!newKey.trim() || !!newValueError}
                  className={cn(
                    "px-4 py-2 rounded-lg font-medium",
                    "bg-teal-600 text-white hover:bg-teal-500",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  Add Memory
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

