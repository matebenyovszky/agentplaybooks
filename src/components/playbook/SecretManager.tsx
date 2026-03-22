"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Shield,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  Clock,
  AlertTriangle,
  X,
  KeyRound,
  Lock,
  Loader2,
  Search,
} from "lucide-react";
import type { SecretMetadata, SecretCategory } from "@/lib/supabase/types";
import { SECRET_CATEGORIES } from "@/lib/supabase/types";
import type { StorageAdapter } from "@/lib/storage";

interface SecretManagerProps {
  storage: StorageAdapter;
  readOnly?: boolean;
}

const CATEGORY_LABELS: Record<SecretCategory, string> = {
  api_key: "API Key",
  password: "Password",
  token: "Token",
  certificate: "Certificate",
  connection_string: "Connection String",
  general: "General",
};

const CATEGORY_COLORS: Record<SecretCategory, string> = {
  api_key: "text-amber-400 bg-amber-500/20 border-amber-500/30",
  password: "text-red-400 bg-red-500/20 border-red-500/30",
  token: "text-blue-400 bg-blue-500/20 border-blue-500/30",
  certificate: "text-green-400 bg-green-500/20 border-green-500/30",
  connection_string: "text-purple-400 bg-purple-500/20 border-purple-500/30",
  general: "text-slate-400 bg-slate-500/20 border-slate-500/30",
};

export function SecretManager({ storage, readOnly = false }: SecretManagerProps) {
  const [secrets, setSecrets] = useState<SecretMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRotateModal, setShowRotateModal] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [revealingSecret, setRevealingSecret] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<SecretCategory | "all">("all");

  // Create form state
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<SecretCategory>("api_key");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [actionError, setActionError] = useState("");

  // Rotate form state
  const [rotateValue, setRotateValue] = useState("");
  const [rotating, setRotating] = useState(false);

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    const data = await storage.getSecrets();
    setSecrets(data);
    setLoading(false);
  }, [storage]);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      setCreateError("Name is required");
      return;
    }
    if (!newValue.trim()) {
      setCreateError("Value is required");
      return;
    }

    setCreating(true);
    setCreateError("");
    setActionError("");

    try {
      const result = await storage.addSecret({
        name: newName.trim(),
        value: newValue,
        description: newDescription || undefined,
        category: newCategory,
        expires_at: newExpiresAt || undefined,
      });

      if (result) {
        setSecrets([...secrets, result]);
        setShowCreateModal(false);
        resetCreateForm();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to create secret. Please check the server response in logs.";
      setCreateError(
        errorMessage.includes("already exists")
          ? `${errorMessage} Use rotate to update the existing secret instead.`
          : errorMessage
      );
    }
    setCreating(false);
  };

  const resetCreateForm = () => {
    setNewName("");
    setNewValue("");
    setNewDescription("");
    setNewCategory("api_key");
    setNewExpiresAt("");
    setCreateError("");
  };

  const handleReveal = async (name: string) => {
    setActionError("");
    if (revealedSecrets[name]) {
      // Toggle off
      setRevealedSecrets((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      return;
    }

    setRevealingSecret(name);
    try {
      const value = await storage.revealSecret(name);
      if (value !== null) {
        setRevealedSecrets((prev) => ({ ...prev, [name]: value }));
        // Auto-hide after 30 seconds
        setTimeout(() => {
          setRevealedSecrets((prev) => {
            const next = { ...prev };
            delete next[name];
            return next;
          });
        }, 30000);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reveal secret";
      setActionError(`Reveal failed: ${message}`);
    }
    setRevealingSecret(null);
  };

  const handleRotate = async (name: string) => {
    if (!rotateValue.trim()) return;

    setActionError("");
    setRotating(true);
    try {
      const result = await storage.updateSecret(name, { value: rotateValue });
      if (result) {
        setSecrets(secrets.map((s) => (s.name === name ? result : s)));
        setShowRotateModal(null);
        setRotateValue("");
        // Clear revealed value if it was showing
        setRevealedSecrets((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to rotate secret";
      setActionError(`Rotate failed: ${message}`);
    }
    setRotating(false);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Are you sure you want to delete the secret "${name}"? This cannot be undone.`)) return;

    setActionError("");
    try {
      const success = await storage.deleteSecret(name);
      if (success) {
        setSecrets(secrets.filter((s) => s.name !== name));
        setRevealedSecrets((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete secret";
      setActionError(`Delete failed: ${message}`);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isExpired = (secret: SecretMetadata) => {
    return secret.expires_at && new Date(secret.expires_at) < new Date();
  };

  const isExpiringSoon = (secret: SecretMetadata) => {
    if (!secret.expires_at) return false;
    const expiresAt = new Date(secret.expires_at);
    const now = new Date();
    const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry > 0 && daysUntilExpiry <= 7;
  };

  const filteredSecrets = secrets.filter((s) => {
    const matchesSearch =
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || s.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5 text-emerald-400" />
            Secrets
          </h2>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1">
            Encrypted credentials for tools and integrations. Values are AES-256-GCM encrypted at rest.
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowCreateModal(true)}
            className={cn(
              "px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium",
              "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30",
              "hover:bg-emerald-600/30 transition-colors"
            )}
          >
            <Plus className="h-4 w-4" />
            Add Secret
          </button>
        )}
      </div>
      {actionError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {actionError}
        </div>
      )}

      {/* Search and Filter */}
      {secrets.length > 0 && (
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search secrets..."
              className={cn(
                "w-full pl-10 pr-4 py-2 rounded-lg",
                "bg-neutral-50 dark:bg-slate-900/70 border border-neutral-200 dark:border-slate-700/50",
                "text-neutral-900 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-600",
                "focus:outline-none focus:border-emerald-500/50"
              )}
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as SecretCategory | "all")}
            className={cn(
              "px-3 py-2 rounded-lg",
              "bg-neutral-50 dark:bg-slate-900/70 border border-neutral-200 dark:border-slate-700/50",
              "text-neutral-900 dark:text-slate-200",
              "focus:outline-none focus:border-emerald-500/50"
            )}
          >
            <option value="all">All Categories</option>
            {SECRET_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Secrets List */}
      {filteredSecrets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-12 text-center bg-neutral-100 dark:bg-slate-900/50 rounded-xl border border-dashed border-neutral-300 dark:border-slate-700"
        >
          <Shield className="h-12 w-12 mx-auto mb-4 text-emerald-700" />
          <h3 className="text-lg font-medium text-neutral-600 dark:text-slate-400 mb-2">
            {secrets.length === 0 ? "No secrets yet" : "No matching secrets"}
          </h3>
          <p className="text-sm text-neutral-500 dark:text-slate-500">
            {secrets.length === 0
              ? "Store API keys, tokens, and passwords that your agents can use securely."
              : "Try adjusting your search or filter."}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filteredSecrets.map((secret) => (
            <motion.div
              key={secret.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "p-4 rounded-xl border transition-all",
                "bg-white dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-800/80",
                isExpired(secret)
                  ? "border-red-300 dark:border-red-900/50"
                  : isExpiringSoon(secret)
                    ? "border-amber-300 dark:border-amber-900/50"
                    : "border-neutral-200 dark:border-slate-700/50"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <KeyRound className="h-4 w-4 text-emerald-400 shrink-0" />
                    <code className="font-mono font-medium text-neutral-900 dark:text-slate-200">{secret.name}</code>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium border",
                        CATEGORY_COLORS[secret.category]
                      )}
                    >
                      {CATEGORY_LABELS[secret.category]}
                    </span>
                    {isExpired(secret) && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Expired
                      </span>
                    )}
                    {isExpiringSoon(secret) && !isExpired(secret) && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Expiring soon
                      </span>
                    )}
                  </div>

                  {secret.description && (
                    <p className="text-sm text-neutral-500 dark:text-slate-400 ml-7 mb-2">{secret.description}</p>
                  )}

                  {/* Revealed value */}
                  {revealedSecrets[secret.name] && (
                    <div className="ml-7 mt-2 p-2 bg-neutral-100 dark:bg-slate-900/70 rounded-lg border border-neutral-200 dark:border-slate-700/50 flex items-center gap-2">
                      <code className="flex-1 text-sm text-neutral-900 dark:text-emerald-300 font-mono break-all">
                        {revealedSecrets[secret.name]}
                      </code>
                      <button
                        onClick={() => copyToClipboard(revealedSecrets[secret.name], secret.name)}
                        className="p-1.5 text-neutral-500 dark:text-slate-400 hover:text-neutral-900 dark:hover:text-white transition-colors shrink-0"
                      >
                        {copiedKey === secret.name ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Metadata row */}
                  <div className="flex items-center gap-4 ml-7 mt-2 text-xs text-neutral-400 dark:text-slate-500">
                    {secret.use_count > 0 && <span>Used {secret.use_count}x</span>}
                    {secret.last_used_at && (
                      <span>Last used {new Date(secret.last_used_at).toLocaleDateString()}</span>
                    )}
                    {secret.rotated_at && (
                      <span className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        Rotated {new Date(secret.rotated_at).toLocaleDateString()}
                      </span>
                    )}
                    {secret.expires_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Expires {new Date(secret.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <button
                    onClick={() => handleReveal(secret.name)}
                    disabled={revealingSecret === secret.name}
                    className="p-2 text-neutral-500 dark:text-slate-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
                    title={revealedSecrets[secret.name] ? "Hide value" : "Reveal value"}
                  >
                    {revealingSecret === secret.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : revealedSecrets[secret.name] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>

                  {!readOnly && (
                    <>
                      <button
                        onClick={() => {
                          setShowRotateModal(secret.name);
                          setRotateValue("");
                        }}
                        className="p-2 text-neutral-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-neutral-100 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
                        title="Rotate secret"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(secret.name)}
                        className="p-2 text-neutral-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
                        title="Delete secret"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Secret Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => {
              setShowCreateModal(false);
              resetCreateForm();
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/30 rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-slate-700/50">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-neutral-900 dark:text-white">
                  <Lock className="h-5 w-5 text-emerald-400" />
                  Add New Secret
                </h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  className="p-2 text-neutral-400 dark:text-slate-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {createError && (
                  <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg text-red-700 dark:text-red-400 text-sm">
                    {createError}
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-neutral-600 dark:text-slate-400 mb-1">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                    placeholder="e.g. OPENAI_API_KEY"
                    className={cn(
                      "w-full px-3 py-2 rounded-lg font-mono",
                      "bg-neutral-50 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700",
                      "text-neutral-900 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-600",
                      "focus:outline-none focus:border-emerald-500/50"
                    )}
                  />
                  <p className="text-xs text-neutral-400 dark:text-slate-500 mt-1">
                    Only letters, numbers, hyphens, and underscores allowed
                  </p>
                </div>

                {/* Value */}
                <div>
                  <label className="block text-sm font-medium text-neutral-600 dark:text-slate-400 mb-1">
                    Secret Value <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="sk-..."
                    className={cn(
                      "w-full px-3 py-2 rounded-lg font-mono",
                      "bg-neutral-50 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700",
                      "text-neutral-900 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-600",
                      "focus:outline-none focus:border-emerald-500/50"
                    )}
                  />
                  <p className="text-xs text-neutral-400 dark:text-slate-500 mt-1">
                    Will be encrypted with AES-256-GCM before storage
                  </p>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-neutral-600 dark:text-slate-400 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as SecretCategory)}
                    className={cn(
                      "w-full px-3 py-2 rounded-lg",
                      "bg-neutral-50 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700",
                      "text-neutral-900 dark:text-slate-200",
                      "focus:outline-none focus:border-emerald-500/50"
                    )}
                  >
                    {SECRET_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-neutral-600 dark:text-slate-400 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="What is this secret used for?"
                    className={cn(
                      "w-full px-3 py-2 rounded-lg",
                      "bg-neutral-50 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700",
                      "text-neutral-900 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-600",
                      "focus:outline-none focus:border-emerald-500/50"
                    )}
                  />
                </div>

                {/* Expires At */}
                <div>
                  <label className="block text-sm font-medium text-neutral-600 dark:text-slate-400 mb-1">
                    Expires At (optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={newExpiresAt}
                    onChange={(e) => setNewExpiresAt(e.target.value)}
                    className={cn(
                      "w-full px-3 py-2 rounded-lg",
                      "bg-neutral-50 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700",
                      "text-neutral-900 dark:text-slate-200",
                      "focus:outline-none focus:border-emerald-500/50"
                    )}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 p-4 border-t border-neutral-200 dark:border-slate-700/50">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  className="px-4 py-2 text-neutral-600 dark:text-slate-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim() || !newValue.trim()}
                  className={cn(
                    "px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all",
                    creating || !newName.trim() || !newValue.trim()
                      ? "bg-neutral-200 dark:bg-slate-800 text-neutral-400 dark:text-slate-500 cursor-not-allowed"
                      : "bg-emerald-600 text-white hover:bg-emerald-500"
                  )}
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Encrypting...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Store Secret
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rotate Secret Modal */}
      <AnimatePresence>
        {showRotateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => {
              setShowRotateModal(null);
              setRotateValue("");
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-500/30 rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-slate-700/50">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-neutral-900 dark:text-white">
                  <RefreshCw className="h-5 w-5 text-amber-400" />
                  Rotate Secret
                </h3>
                <button
                  onClick={() => {
                    setShowRotateModal(null);
                    setRotateValue("");
                  }}
                  className="p-2 text-neutral-400 dark:text-slate-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <p className="text-sm text-neutral-600 dark:text-slate-400">
                  Rotating <code className="font-mono text-amber-600 dark:text-amber-400">{showRotateModal}</code> will
                  replace the current value with a new one. The old value cannot be recovered.
                </p>

                <div>
                  <label className="block text-sm font-medium text-neutral-600 dark:text-slate-400 mb-1">
                    New Value <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={rotateValue}
                    onChange={(e) => setRotateValue(e.target.value)}
                    placeholder="Enter new secret value..."
                    className={cn(
                      "w-full px-3 py-2 rounded-lg font-mono",
                      "bg-neutral-50 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700",
                      "text-neutral-900 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-600",
                      "focus:outline-none focus:border-amber-500/50"
                    )}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 p-4 border-t border-neutral-200 dark:border-slate-700/50">
                <button
                  onClick={() => {
                    setShowRotateModal(null);
                    setRotateValue("");
                  }}
                  className="px-4 py-2 text-neutral-600 dark:text-slate-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => showRotateModal && handleRotate(showRotateModal)}
                  disabled={rotating || !rotateValue.trim()}
                  className={cn(
                    "px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all",
                    rotating || !rotateValue.trim()
                      ? "bg-neutral-200 dark:bg-slate-800 text-neutral-400 dark:text-slate-500 cursor-not-allowed"
                      : "bg-amber-500 text-slate-900 hover:bg-amber-400"
                  )}
                >
                  {rotating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Rotating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Rotate
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
