"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Database,
  Trash2,
  Copy,
  Check,
  Plus,
  Edit3,
  AlertCircle,
  Clock,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Flame,
  FileText,
  Archive,
  GitBranch,
  Filter,
  Circle,
  CheckCircle2,
  XCircle,
  Loader2,
  Ban,
} from "lucide-react";
import type { Memory, MemoryTier, MemoryType, MemoryStatus } from "@/lib/supabase/types";
import type { StorageAdapter } from "@/lib/storage";

interface MemoryEditorProps {
  storage: StorageAdapter;
  memories: Memory[];
  onUpdate: (memories: Memory[]) => void;
  readOnly?: boolean;
}

// Tier config
const TIER_CONFIG: Record<MemoryTier, { icon: typeof Flame; label: string; color: string; bg: string }> = {
  working: { icon: Flame, label: "Working", color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30" },
  contextual: { icon: FileText, label: "Contextual", color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30" },
  longterm: { icon: Archive, label: "Long-term", color: "text-slate-400", bg: "bg-slate-500/15 border-slate-500/30" },
};

// Status config
const STATUS_CONFIG: Record<MemoryStatus, { icon: typeof Circle; label: string; color: string }> = {
  pending: { icon: Circle, label: "Pending", color: "text-slate-400" },
  running: { icon: Loader2, label: "Running", color: "text-blue-400" },
  completed: { icon: CheckCircle2, label: "Completed", color: "text-green-400" },
  failed: { icon: XCircle, label: "Failed", color: "text-red-400" },
  blocked: { icon: Ban, label: "Blocked", color: "text-yellow-400" },
};

// Build a tree from flat memories
function buildMemoryTree(memories: Memory[]): { roots: Memory[]; childrenMap: Map<string, Memory[]> } {
  const childrenMap = new Map<string, Memory[]>();
  const roots: Memory[] = [];

  for (const m of memories) {
    if (m.parent_key) {
      const existing = childrenMap.get(m.parent_key) || [];
      existing.push(m);
      childrenMap.set(m.parent_key, existing);
    } else {
      roots.push(m);
    }
  }

  return { roots, childrenMap };
}

// Tier badge component
function TierBadge({ tier }: { tier: MemoryTier }) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.contextual;
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", config.bg, config.color)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// Status badge component
function StatusBadge({ status }: { status: MemoryStatus }) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", config.color)}>
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {config.label}
    </span>
  );
}

// Memory tree node component
function MemoryTreeNode({
  memory,
  childrenMap,
  depth,
  expandedKeys,
  onToggle,
  onEdit,
  onDelete,
  onCopy,
  copiedKey,
  readOnly,
}: {
  memory: Memory;
  childrenMap: Map<string, Memory[]>;
  depth: number;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  onEdit: (memory: Memory) => void;
  onDelete: (memory: Memory) => void;
  onCopy: (text: string, key: string) => void;
  copiedKey: string | null;
  readOnly: boolean;
}) {
  const children = childrenMap.get(memory.key) || [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedKeys.has(memory.key);
  const isHierarchical = memory.memory_type === "hierarchical";

  return (
    <div style={{ marginLeft: depth > 0 ? depth * 20 : 0 }}>
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={cn(
          "rounded-xl border transition-all duration-200",
          "bg-white dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-800/80",
          "border-neutral-200 dark:border-teal-900/30 hover:border-teal-500 dark:hover:border-teal-700/50",
          depth > 0 && "border-l-2 border-l-teal-500/30"
        )}
      >
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Expand/collapse for hierarchical */}
              {hasChildren ? (
                <button onClick={() => onToggle(memory.key)} className="p-0.5 text-slate-400 hover:text-white">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <div className="w-5" />
              )}

              <div className={cn("p-1.5 rounded-lg", "bg-gradient-to-br from-teal-600/20 to-cyan-600/20", "border border-teal-500/20")}>
                {isHierarchical ? <GitBranch className="h-4 w-4 text-teal-400" /> : <Database className="h-4 w-4 text-teal-400" />}
              </div>
              <code className="text-teal-300 font-semibold text-sm">{memory.key}</code>

              {/* Tier badge */}
              <TierBadge tier={memory.tier} />

              {/* Type badge */}
              {isHierarchical && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/15 border border-purple-500/30 text-purple-400">
                  <GitBranch className="h-3 w-3" />
                  Graph
                </span>
              )}

              {/* Status badge */}
              {memory.status && <StatusBadge status={memory.status} />}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {memory.priority !== 50 && (
                <span className="text-xs text-slate-500 mr-1" title="Priority">
                  P{memory.priority}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-slate-500 mr-1">
                <Clock className="h-3 w-3" />
                {new Date(memory.updated_at).toLocaleString()}
              </span>
              <button
                onClick={() => onCopy(JSON.stringify(memory.value, null, 2), memory.id)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                title="Copy value"
              >
                {copiedKey === memory.id ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </button>
              <button
                onClick={() => onEdit(memory)}
                disabled={readOnly}
                className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-teal-500/10 rounded-lg transition-colors"
                title="Edit memory"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => onDelete(memory)}
                disabled={readOnly}
                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Delete memory"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Summary or description */}
          {(memory.summary || memory.description) && (
            <p className="text-sm text-slate-400 mb-2 ml-7">{memory.summary || memory.description}</p>
          )}

          {/* Value preview */}
          <pre className={cn("p-3 rounded-lg overflow-x-auto ml-7", "bg-slate-900/70 border border-slate-700/50", "text-sm text-slate-300 font-mono max-h-40 overflow-y-auto")}>
            {JSON.stringify(memory.value, null, 2)}
          </pre>

          {/* Tags */}
          {memory.tags && memory.tags.length > 0 && (
            <div className="flex gap-1.5 mt-2 ml-7 flex-wrap">
              {memory.tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-slate-200 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600/30">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-2 space-y-2">
          {children.map((child) => (
            <MemoryTreeNode
              key={child.id}
              memory={child}
              childrenMap={childrenMap}
              depth={depth + 1}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onCopy={onCopy}
              copiedKey={copiedKey}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MemoryEditor({ storage, memories, onUpdate, readOnly = false }: MemoryEditorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editTier, setEditTier] = useState<MemoryTier>("contextual");
  const [editPriority, setEditPriority] = useState(50);
  const [editSummary, setEditSummary] = useState("");
  const [editParentKey, setEditParentKey] = useState("");
  const [editMemoryType, setEditMemoryType] = useState<MemoryType>("flat");
  const [editStatus, setEditStatus] = useState<MemoryStatus | "">("");
  const [editTags, setEditTags] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [tierFilter, setTierFilter] = useState<MemoryTier | "all">("all");
  const [typeFilter, setTypeFilter] = useState<MemoryType | "all">("all");

  // Filter memories
  const filteredMemories = useMemo(() => {
    return memories.filter((m) => {
      const matchesSearch =
        !searchQuery ||
        m.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        JSON.stringify(m.value).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.summary || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.description || "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesTier = tierFilter === "all" || m.tier === tierFilter;
      const matchesType = typeFilter === "all" || m.memory_type === typeFilter;

      return matchesSearch && matchesTier && matchesType;
    });
  }, [memories, searchQuery, tierFilter, typeFilter]);

  // Build tree structure
  const { roots, childrenMap } = useMemo(() => buildMemoryTree(filteredMemories), [filteredMemories]);

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
    const data = await storage.getMemories();
    onUpdate(data);
    setLoading(false);
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAddMemory = async () => {
    if (readOnly) return;
    let keyNum = memories.length + 1;
    let key = `memory_key_${keyNum}`;
    while (memories.some((m) => m.key === key)) {
      keyNum++;
      key = `memory_key_${keyNum}`;
    }

    setSaving(true);
    try {
      const data = await storage.addMemory({ key, value: {} });
      if (data) {
        onUpdate([...memories, data]);
        startEditing(data);
      }
    } catch (e) {
      console.error("Add memory error:", e);
      alert("Failed to add memory: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMemory = async () => {
    if (readOnly || !editingMemory || jsonError) return;

    setSaving(true);
    try {
      const parsedValue = JSON.parse(editValue);
      const updated = await storage.updateMemory(editingMemory.id, {
        key: editKey,
        value: parsedValue,
        tier: editTier,
        priority: editPriority,
        summary: editSummary || null,
        parent_key: editParentKey || null,
        memory_type: editMemoryType,
        status: editStatus || null,
        tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
      });

      if (updated) {
        onUpdate(memories.map((m) => (m.id === editingMemory.id ? updated : m)));
        setEditingMemory(null);
      } else {
        alert("Failed to save memory. Please check your connection or permissions.");
      }
    } catch (e) {
      console.error("Save error:", e);
      alert("Save error: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMemory = async (memory: Memory) => {
    if (readOnly) return;
    if (!confirm(`Delete memory "${memory.key}"?`)) return;

    const success = await storage.deleteMemory(memory.id);
    if (success) {
      onUpdate(memories.filter((m) => m.id !== memory.id));
    } else {
      alert("Failed to delete memory. It might be already deleted or you don't have permission.");
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const startEditing = (memory: Memory) => {
    if (readOnly) return;
    setEditingMemory(memory);
    setEditKey(memory.key);
    setEditValue(JSON.stringify(memory.value, null, 2));
    setEditTier(memory.tier || "contextual");
    setEditPriority(memory.priority || 50);
    setEditSummary(memory.summary || "");
    setEditParentKey(memory.parent_key || "");
    setEditMemoryType(memory.memory_type || "flat");
    setEditStatus(memory.status || "");
    setEditTags((memory.tags || []).join(", "));
    setJsonError(null);
  };

  // Count stats
  const stats = useMemo(() => {
    const working = memories.filter((m) => m.tier === "working").length;
    const contextual = memories.filter((m) => m.tier === "contextual").length;
    const longterm = memories.filter((m) => m.tier === "longterm").length;
    const hierarchical = memories.filter((m) => m.memory_type === "hierarchical").length;
    return { working, contextual, longterm, hierarchical, total: memories.length };
  }, [memories]);

  const allParentKeys = useMemo(() => Array.from(new Set(memories.map((m) => m.key))), [memories]);
  const allTags = useMemo(() => Array.from(new Set(memories.flatMap((m) => m.tags || []))), [memories]);

  return (
    <div className="space-y-4">
      <datalist id="parent-keys">
        {allParentKeys.map((k) => <option key={k} value={k} />)}
      </datalist>
      <datalist id="all-tags">
        {allTags.map((t) => <option key={t} value={t} />)}
      </datalist>

      {/* Stats Bar */}
      {memories.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{stats.total} memories</span>
          <span className="text-slate-700">•</span>
          <span className="text-orange-400">{stats.working} working</span>
          <span className="text-blue-400">{stats.contextual} contextual</span>
          <span className="text-slate-400">{stats.longterm} archived</span>
          {stats.hierarchical > 0 && (
            <>
              <span className="text-slate-700">•</span>
              <span className="text-purple-400">{stats.hierarchical} graphs</span>
            </>
          )}
        </div>
      )}

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
              "bg-neutral-50 dark:bg-slate-900/70 border border-neutral-200 dark:border-slate-700/50",
              "text-neutral-900 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-600",
              "focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20"
            )}
          />
        </div>

        {/* Tier filter */}
        <div className="relative">
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as MemoryTier | "all")}
            className={cn(
              "appearance-none pl-7 pr-8 py-2 rounded-lg text-sm",
              "bg-neutral-50 dark:bg-slate-900/70 border border-neutral-200 dark:border-slate-700/50",
              "text-neutral-700 dark:text-slate-300",
              "focus:outline-none focus:border-teal-500/50"
            )}
          >
            <option value="all">All Tiers</option>
            <option value="working">🔥 Working</option>
            <option value="contextual">📋 Contextual</option>
            <option value="longterm">📚 Long-term</option>
          </select>
          <Filter className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
        </div>

        {/* Type filter */}
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as MemoryType | "all")}
            className={cn(
              "appearance-none pl-7 pr-8 py-2 rounded-lg text-sm",
              "bg-neutral-50 dark:bg-slate-900/70 border border-neutral-200 dark:border-slate-700/50",
              "text-neutral-700 dark:text-slate-300",
              "focus:outline-none focus:border-teal-500/50"
            )}
          >
            <option value="all">All Types</option>
            <option value="flat">Flat</option>
            <option value="hierarchical">Hierarchical</option>
          </select>
          <GitBranch className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
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
          disabled={saving || readOnly}
          className={cn(
            "px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium",
            "bg-teal-600/20 text-teal-400 border border-teal-500/30",
            "hover:bg-teal-600/30 transition-colors",
            readOnly && "opacity-50 cursor-not-allowed"
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
          className="p-8 text-center bg-neutral-100 dark:bg-slate-900/50 rounded-xl border border-dashed border-neutral-300 dark:border-slate-700"
        >
          <Database className="h-12 w-12 text-neutral-400 dark:text-slate-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-600 dark:text-slate-400 mb-2">No memories yet</h3>
          <p className="text-sm text-neutral-500 dark:text-slate-500 mb-4">
            AI agents can write memories via the API, or you can add them manually.
            <br />
            <span className="text-teal-500/60">Supports flat key-value and hierarchical task graphs.</span>
          </p>
          <button
            onClick={handleAddMemory}
            disabled={readOnly}
            className={cn(
              "px-4 py-2 rounded-lg inline-flex items-center gap-2 text-sm font-medium",
              "bg-teal-600/20 text-teal-400 border border-teal-500/30",
              "hover:bg-teal-600/30 transition-colors",
              readOnly && "opacity-50 cursor-not-allowed"
            )}
          >
            <Plus className="h-4 w-4" />
            Add First Memory
          </button>
        </motion.div>
      )}

      {/* Memory Tree */}
      {roots.length > 0 && (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {roots.map((memory) => (
              <MemoryTreeNode
                key={memory.id}
                memory={memory}
                childrenMap={childrenMap}
                depth={0}
                expandedKeys={expandedKeys}
                onToggle={toggleExpand}
                onEdit={startEditing}
                onDelete={handleDeleteMemory}
                onCopy={copyToClipboard}
                copiedKey={copiedKey}
                readOnly={readOnly}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* No Results */}
      {memories.length > 0 && filteredMemories.length === 0 && (
        <div className="p-6 text-center text-slate-500">
          No memories matching your filters
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
                "w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto",
                "bg-gradient-to-br from-slate-900 to-slate-800",
                "border border-slate-700 shadow-2xl"
              )}
            >
              <div className="p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Edit Memory</h3>

                <div className="space-y-4">
                  {/* Key */}
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Key</label>
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

                  {/* Tier + Type + Priority row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Tier</label>
                      <select
                        value={editTier}
                        onChange={(e) => setEditTier(e.target.value as MemoryTier)}
                        className={cn(
                          "w-full p-3 rounded-lg",
                          "bg-slate-900/70 border border-slate-700/50",
                          "text-slate-200",
                          "focus:outline-none focus:border-teal-500/50"
                        )}
                      >
                        <option value="working">🔥 Working</option>
                        <option value="contextual">📋 Contextual</option>
                        <option value="longterm">📚 Long-term</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Type</label>
                      <select
                        value={editMemoryType}
                        onChange={(e) => setEditMemoryType(e.target.value as MemoryType)}
                        className={cn(
                          "w-full p-3 rounded-lg",
                          "bg-slate-900/70 border border-slate-700/50",
                          "text-slate-200",
                          "focus:outline-none focus:border-teal-500/50"
                        )}
                      >
                        <option value="flat">Flat</option>
                        <option value="hierarchical">Hierarchical</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Priority ({editPriority})</label>
                      <input
                        type="range"
                        min={1}
                        max={100}
                        value={editPriority}
                        onChange={(e) => setEditPriority(Number(e.target.value))}
                        className="w-full mt-2 accent-teal-500"
                      />
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Tags (comma-separated)</label>
                    <input
                      type="text"
                      list="all-tags"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="e.g. priority, user_preference"
                      className={cn(
                        "w-full p-3 rounded-lg",
                        "bg-slate-900/70 border border-slate-700/50",
                        "text-slate-200 text-sm",
                        "focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20"
                      )}
                    />
                  </div>

                  {/* Status + Parent Key row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as MemoryStatus | "")}
                        className={cn(
                          "w-full p-3 rounded-lg",
                          "bg-slate-900/70 border border-slate-700/50",
                          "text-slate-200",
                          "focus:outline-none focus:border-teal-500/50"
                        )}
                      >
                        <option value="">None</option>
                        <option value="pending">⏳ Pending</option>
                        <option value="running">🔄 Running</option>
                        <option value="completed">✅ Completed</option>
                        <option value="failed">❌ Failed</option>
                        <option value="blocked">🚫 Blocked</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Parent Key</label>
                      <input
                        type="text"
                        list="parent-keys"
                        value={editParentKey}
                        onChange={(e) => setEditParentKey(e.target.value)}
                        placeholder="(no parent)"
                        className={cn(
                          "w-full p-3 rounded-lg",
                          "bg-slate-900/70 border border-slate-700/50",
                          "text-slate-200 font-mono text-sm",
                          "focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20"
                        )}
                      />
                    </div>
                  </div>

                  {/* Summary */}
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Summary</label>
                    <input
                      type="text"
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      placeholder="Brief summary for context views..."
                      className={cn(
                        "w-full p-3 rounded-lg",
                        "bg-slate-900/70 border border-slate-700/50",
                        "text-slate-200",
                        "focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20"
                      )}
                    />
                  </div>

                  {/* Value (JSON) */}
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Value (JSON)</label>
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className={cn(
                        "w-full h-48 p-3 rounded-lg",
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
                  <button onClick={() => setEditingMemory(null)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">
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
