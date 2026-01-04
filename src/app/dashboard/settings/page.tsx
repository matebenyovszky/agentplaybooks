"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { 
  Sidebar, 
  SidebarBody, 
  SidebarLink 
} from "@/components/ui/sidebar";
import { 
  BookOpen, 
  Globe, 
  Settings, 
  LogOut, 
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Shield,
  Star
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface UserApiKey {
  id: string;
  key_prefix: string;
  name: string | null;
  permissions: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface NewKeyResponse extends UserApiKey {
  key: string;
  warning: string;
}

const AVAILABLE_PERMISSIONS = [
  { id: "playbooks:read", label: "Read Playbooks", description: "List and view your playbooks" },
  { id: "playbooks:write", label: "Write Playbooks", description: "Create, update, delete playbooks" },
  { id: "personas:write", label: "Write Personas", description: "Add, update, delete personas" },
  { id: "skills:write", label: "Write Skills", description: "Add, update, delete skills" },
  { id: "memory:read", label: "Read Memory", description: "Read memory entries" },
  { id: "memory:write", label: "Write Memory", description: "Write and delete memory entries" },
  { id: "full", label: "Full Access", description: "All permissions" },
];

export default function SettingsPage() {
  const t = useTranslations();
  const [user, setUser] = useState<User | null>(null);
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(["playbooks:read", "playbooks:write", "memory:read", "memory:write"]);
  const [createdKey, setCreatedKey] = useState<NewKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        window.location.href = "/login";
        return;
      }
      setUser(user);
      loadApiKeys();
    });
  }, []);

  const loadApiKeys = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/user/api-keys", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      }
    } catch (e) {
      console.error("Failed to load API keys:", e);
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleCreateKey = async () => {
    if (selectedPermissions.length === 0) {
      setError("Please select at least one permission");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newKeyName || null,
          permissions: selectedPermissions,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create API key");
      }

      const data: NewKeyResponse = await response.json();
      setCreatedKey(data);
      setApiKeys([data, ...apiKeys]);
    } catch (e: any) {
      setError(e.message);
    }

    setCreating(false);
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to delete this API key? This cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`/api/user/api-keys/${keyId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        setApiKeys(apiKeys.filter(k => k.id !== keyId));
      }
    } catch (e) {
      console.error("Failed to delete API key:", e);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setCreatedKey(null);
    setNewKeyName("");
    setSelectedPermissions(["playbooks:read", "playbooks:write", "memory:read", "memory:write"]);
    setError(null);
  };

  const togglePermission = (permId: string) => {
    if (permId === "full") {
      setSelectedPermissions(["full"]);
    } else {
      setSelectedPermissions(prev => {
        const filtered = prev.filter(p => p !== "full");
        if (filtered.includes(permId)) {
          return filtered.filter(p => p !== permId);
        } else {
          return [...filtered, permId];
        }
      });
    }
  };

  const sidebarLinks = [
    {
      label: t("dashboard.myPlaybooks"),
      href: "/dashboard",
      icon: <BookOpen className="h-5 w-5 text-blue-400" />,
    },
    {
      label: t("dashboard.favorites") || "Favorites",
      href: "/dashboard/favorites",
      icon: <Star className="h-5 w-5 text-yellow-400" />,
    },
    {
      label: t("dashboard.explore"),
      href: "/explore",
      icon: <Globe className="h-5 w-5 text-green-400" />,
    },
    {
      label: t("dashboard.settings"),
      href: "/dashboard/settings",
      icon: <Settings className="h-5 w-5 text-purple-400" />,
    },
  ];

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <div className="flex h-screen">
        {/* Sidebar */}
        <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
          <SidebarBody className="flex flex-col h-full justify-between">
            <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
              <Link href="/" className="flex items-center gap-2 px-2 py-4">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">AP</span>
                </div>
                <motion.span
                  animate={{ opacity: sidebarOpen ? 1 : 0 }}
                  className="font-semibold text-white whitespace-nowrap"
                >
                  AgentPlaybooks
                </motion.span>
              </Link>
              
              <div className="mt-8 flex flex-col gap-2">
                {sidebarLinks.map((link) => (
                  <SidebarLink key={link.href} link={link} />
                ))}
              </div>
            </div>
            
            <div className="border-t border-slate-800 pt-4">
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-2 py-2 text-slate-400 hover:text-white transition-colors w-full"
              >
                <LogOut className="h-5 w-5" />
                <motion.span
                  animate={{ opacity: sidebarOpen ? 1 : 0 }}
                  className="whitespace-nowrap"
                >
                  {t("common.signOut")}
                </motion.span>
              </button>
            </div>
          </SidebarBody>
        </Sidebar>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
              <p className="text-slate-400">Manage your account and API keys</p>
            </div>

            {/* User Info */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 mb-8">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-400" />
                Account
              </h2>
              <div className="space-y-2">
                <p className="text-slate-300">
                  <span className="text-slate-500">Email:</span> {user?.email}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-500">User ID:</span>{" "}
                  <code className="text-xs bg-slate-700 px-2 py-1 rounded">{user?.id}</code>
                </p>
              </div>
            </div>

            {/* User API Keys */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Key className="h-5 w-5 text-purple-400" />
                    User API Keys
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">
                    API keys for programmatic access to all your playbooks. Used by AI agents.
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create Key
                </button>
              </div>

              {loading ? (
                <div className="text-center py-8 text-slate-400">Loading...</div>
              ) : apiKeys.length === 0 ? (
                <div className="text-center py-8">
                  <Key className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No API keys yet</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Create an API key to allow AI agents to manage your playbooks
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {apiKeys.map((key) => (
                    <div
                      key={key.id}
                      className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <code className="text-sm bg-slate-700 px-2 py-1 rounded text-purple-300">
                              {key.key_prefix}
                            </code>
                            {key.name && (
                              <span className="text-white font-medium">{key.name}</span>
                            )}
                            {!key.is_active && (
                              <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {key.permissions.map((perm) => (
                              <span
                                key={perm}
                                className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded"
                              >
                                {perm}
                              </span>
                            ))}
                          </div>
                          <div className="text-xs text-slate-500">
                            Created: {formatDate(key.created_at)}
                            {key.last_used_at && (
                              <> · Last used: {formatDate(key.last_used_at)}</>
                            )}
                            {key.expires_at && (
                              <> · Expires: {formatDate(key.expires_at)}</>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteKey(key.id)}
                          className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                          title="Delete key"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Usage Info */}
              <div className="mt-6 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <h3 className="text-sm font-medium text-blue-400 mb-2">How to use</h3>
                <p className="text-sm text-slate-400 mb-3">
                  Use your API key with the Management API or MCP Server:
                </p>
                <div className="bg-slate-900 rounded p-3 font-mono text-xs text-slate-300 overflow-x-auto">
                  <div className="text-slate-500"># REST API</div>
                  <div>curl -H &quot;Authorization: Bearer YOUR_API_KEY&quot; \</div>
                  <div className="pl-4">https://agentplaybooks.ai/api/manage/playbooks</div>
                  <div className="mt-2 text-slate-500"># MCP Server URL</div>
                  <div>https://agentplaybooks.ai/api/mcp/manage</div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  <Link href="/docs/management-api" className="text-blue-400 hover:underline">
                    View full documentation →
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl border border-slate-700 max-w-md w-full p-6"
          >
            {createdKey ? (
              <>
                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="h-6 w-6 text-green-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white">API Key Created</h3>
                  <p className="text-slate-400 text-sm mt-1">
                    Copy this key now. It won&apos;t be shown again!
                  </p>
                </div>

                <div className="bg-slate-900 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-sm text-purple-300 break-all">{createdKey.key}</code>
                    <button
                      onClick={() => copyToClipboard(createdKey.key)}
                      className="p-2 hover:bg-slate-700 rounded transition-colors flex-shrink-0"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20 mb-4">
                  <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                  <p className="text-sm text-yellow-300">{createdKey.warning}</p>
                </div>

                <button
                  onClick={closeModal}
                  className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h3 className="text-xl font-semibold text-white mb-4">Create API Key</h3>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 rounded-lg border border-red-500/20 mb-4">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Name (optional)
                    </label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., Claude Desktop"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Permissions
                    </label>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {AVAILABLE_PERMISSIONS.map((perm) => (
                        <label
                          key={perm.id}
                          className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                            selectedPermissions.includes(perm.id)
                              ? "bg-purple-500/20 border border-purple-500/50"
                              : "bg-slate-900 border border-slate-700 hover:border-slate-600"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(perm.id)}
                            onChange={() => togglePermission(perm.id)}
                            className="mt-0.5 rounded border-slate-600 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 bg-slate-800"
                          />
                          <div>
                            <div className="text-sm font-medium text-white">{perm.label}</div>
                            <div className="text-xs text-slate-400">{perm.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={closeModal}
                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    disabled={creating}
                    className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {creating ? "Creating..." : "Create Key"}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}

