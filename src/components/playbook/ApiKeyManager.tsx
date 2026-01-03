"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/utils";
import { 
  Key,
  Trash2,
  Copy,
  Check,
  Plus,
  Shield,
  Clock,
  AlertTriangle,
  X,
  Eye,
  EyeOff
} from "lucide-react";
import type { ApiKey } from "@/lib/supabase/types";

interface ApiKeyManagerProps {
  playbook_id: string;
  apiKeys: ApiKey[];
  onUpdate: (apiKeys: ApiKey[]) => void;
}

// Available permissions
const PERMISSIONS = [
  { value: "memory:read", label: "Read Memory", description: "Read memory values" },
  { value: "memory:write", label: "Write Memory", description: "Create and update memory values" },
  { value: "skills:read", label: "Read Skills", description: "Read skill definitions" },
  { value: "skills:write", label: "Write Skills", description: "Create and update skills" },
  { value: "personas:read", label: "Read Personas", description: "Read persona definitions" },
  { value: "personas:write", label: "Write Personas", description: "Create and update personas" },
];

export function ApiKeyManager({ playbook_id, apiKeys, onUpdate }: ApiKeyManagerProps) {
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  // Create form state
  const [keyName, setKeyName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([
    "memory:read", "memory:write", "skills:read", "personas:read"
  ]);

  const handleCreateKey = async () => {
    if (selectedPermissions.length === 0) {
      alert("Please select at least one permission");
      return;
    }

    setCreating(true);
    try {
      const key = generateApiKey();
      const keyHash = await hashApiKey(key);
      const prefix = getKeyPrefix(key);

      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("api_keys")
        .insert({
          playbook_id,
          key_hash: keyHash,
          key_prefix: prefix,
          name: keyName || null,
          permissions: selectedPermissions,
          is_active: true,
        })
        .select()
        .single();

      if (!error && data) {
        onUpdate([...apiKeys, data as ApiKey]);
        setNewApiKey(key);
        setShowCreateModal(false);
        // Reset form
        setKeyName("");
        setSelectedPermissions(["memory:read", "memory:write", "skills:read", "personas:read"]);
      }
    } catch (e) {
      console.error("Create key error:", e);
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This cannot be undone.")) return;

    const supabase = createBrowserClient();
    const { error } = await supabase
      .from("api_keys")
      .delete()
      .eq("id", keyId);

    if (!error) {
      onUpdate(apiKeys.filter(k => k.id !== keyId));
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const togglePermission = (perm: string) => {
    if (selectedPermissions.includes(perm)) {
      setSelectedPermissions(selectedPermissions.filter(p => p !== perm));
    } else {
      setSelectedPermissions([...selectedPermissions, perm]);
    }
  };

  const activeKeys = apiKeys.filter(k => k.is_active);
  const hasExpired = (key: ApiKey) => key.expires_at && new Date(key.expires_at) < new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Key className="h-5 w-5 text-amber-400" />
            API Keys
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Generate keys to let AI agents write back to this playbook
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className={cn(
            "px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium",
            "bg-amber-600/20 text-amber-400 border border-amber-500/30",
            "hover:bg-amber-600/30 transition-colors"
          )}
        >
          <Plus className="h-4 w-4" />
          Generate New Key
        </button>
      </div>

      {/* New Key Alert */}
      <AnimatePresence>
        {newApiKey && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className={cn(
              "p-4 rounded-xl",
              "bg-amber-500/10 border border-amber-500/30"
            )}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-amber-300 mb-1">
                  Copy your API key now!
                </h4>
                <p className="text-sm text-amber-200/70 mb-3">
                  This is the only time you'll see this key. Store it securely.
                </p>
                <div className="flex items-center gap-2">
                  <code className={cn(
                    "flex-1 p-3 rounded-lg overflow-x-auto",
                    "bg-slate-900/70 border border-slate-700",
                    "text-sm font-mono text-slate-200"
                  )}>
                    {newApiKey}
                  </code>
                  <button
                    onClick={() => {
                      copyToClipboard(newApiKey, "new");
                      setTimeout(() => setNewApiKey(null), 500);
                    }}
                    className={cn(
                      "p-3 rounded-lg transition-colors",
                      "bg-amber-600 text-white hover:bg-amber-500"
                    )}
                  >
                    {copiedKey === "new" ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Copy className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setNewApiKey(null)}
                className="p-1 text-amber-400 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {apiKeys.length === 0 && !newApiKey && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-8 text-center bg-slate-900/50 rounded-xl border border-dashed border-slate-700"
        >
          <Key className="h-12 w-12 text-slate-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-400 mb-2">No API keys yet</h3>
          <p className="text-sm text-slate-500 mb-4">
            Generate an API key to allow AI agents to write data back to this playbook.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className={cn(
              "px-4 py-2 rounded-lg inline-flex items-center gap-2 text-sm font-medium",
              "bg-amber-600/20 text-amber-400 border border-amber-500/30",
              "hover:bg-amber-600/30 transition-colors"
            )}
          >
            <Plus className="h-4 w-4" />
            Generate First Key
          </button>
        </motion.div>
      )}

      {/* Keys List */}
      {apiKeys.length > 0 && (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {apiKeys.map((apiKey) => (
              <motion.div
                key={apiKey.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={cn(
                  "p-4 rounded-xl border transition-all",
                  "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
                  hasExpired(apiKey) 
                    ? "border-red-900/30 opacity-60"
                    : apiKey.is_active 
                      ? "border-amber-900/30 hover:border-amber-700/50"
                      : "border-slate-700/30 opacity-60"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "p-2 rounded-lg",
                      "bg-gradient-to-br from-amber-600/20 to-orange-600/20",
                      "border border-amber-500/20"
                    )}>
                      <Key className="h-5 w-5 text-amber-400" />
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-3">
                        <code className="text-amber-300 font-mono">
                          {apiKey.key_prefix}
                        </code>
                        {apiKey.name && (
                          <span className="text-sm text-slate-400">
                            ({apiKey.name})
                          </span>
                        )}
                        {hasExpired(apiKey) && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                            Expired
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {apiKey.permissions.map((perm) => (
                          <span
                            key={perm}
                            className={cn(
                              "px-2 py-0.5 rounded text-xs",
                              "bg-slate-800 text-slate-400 border border-slate-700"
                            )}
                          >
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {apiKey.last_used_at && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        Last used {new Date(apiKey.last_used_at).toLocaleDateString()}
                      </span>
                    )}
                    <button
                      onClick={() => handleRevokeKey(apiKey.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5",
                        "text-red-400 hover:text-red-300",
                        "hover:bg-red-500/10 transition-colors"
                      )}
                    >
                      <Trash2 className="h-4 w-4" />
                      Revoke
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
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
              <div className="p-6">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-amber-400" />
                  Create New API Key
                </h3>
                
                <div className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      Key Name (optional)
                    </label>
                    <input
                      type="text"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      placeholder="e.g., Production Bot, Claude Desktop"
                      className={cn(
                        "w-full p-3 rounded-lg",
                        "bg-slate-900/70 border border-slate-700/50",
                        "text-slate-200 placeholder:text-slate-600",
                        "focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                      )}
                    />
                  </div>

                  {/* Permissions */}
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      Permissions
                    </label>
                    <div className="space-y-2">
                      {PERMISSIONS.map((perm) => (
                        <label
                          key={perm.value}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                            selectedPermissions.includes(perm.value)
                              ? "bg-amber-500/10 border border-amber-500/30"
                              : "bg-slate-900/50 border border-slate-700/50 hover:border-slate-600"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(perm.value)}
                            onChange={() => togglePermission(perm.value)}
                            className="mt-0.5 rounded border-slate-600 text-amber-500 focus:ring-amber-500/20"
                          />
                          <div>
                            <p className="font-medium text-slate-200">{perm.label}</p>
                            <p className="text-sm text-slate-500">{perm.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    disabled={creating || selectedPermissions.length === 0}
                    className={cn(
                      "px-4 py-2 rounded-lg font-medium",
                      "bg-amber-600 text-white",
                      "hover:bg-amber-500 transition-colors",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {creating ? "Creating..." : "Create Key"}
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

export default ApiKeyManager;


