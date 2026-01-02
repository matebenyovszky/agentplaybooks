"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { 
  ArrowLeft,
  Brain,
  Zap,
  Server,
  Database,
  Key,
  Settings,
  Save,
  Globe,
  Lock,
  Plus,
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2
} from "lucide-react";
import type { Playbook, Persona, Skill, MCPServer, Memory, ApiKey } from "@/lib/supabase/types";

// Import editor components
import { PersonaEditor } from "@/components/playbook/PersonaEditor";
import { SkillEditor } from "@/components/playbook/SkillEditor";
import { McpServerEditor } from "@/components/playbook/McpServerEditor";
import { MemoryEditor } from "@/components/playbook/MemoryEditor";
import { ApiKeyManager } from "@/components/playbook/ApiKeyManager";

type TabType = "personas" | "skills" | "mcp" | "memory" | "apiKeys" | "settings";

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export default function PlaybookEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations();
  
  // State
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("personas");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Track changes for debounced save
  const debouncedPlaybook = useDebounce(playbook, 1500);

  useEffect(() => {
    loadPlaybook();
  }, [id]);

  // Auto-save playbook changes
  useEffect(() => {
    if (!debouncedPlaybook || !hasChanges) return;

    const save = async () => {
      setSaving(true);
      const supabase = createBrowserClient();
      await supabase
        .from("playbooks")
        .update({
          name: debouncedPlaybook.name,
          description: debouncedPlaybook.description,
          is_public: debouncedPlaybook.is_public,
        })
        .eq("id", id);
      
      setSaving(false);
      setHasChanges(false);
    };

    save();
  }, [debouncedPlaybook, hasChanges, id]);

  const loadPlaybook = async () => {
    const supabase = createBrowserClient();

    const [playbookRes, personasRes, skillsRes, mcpRes, memoriesRes, keysRes] = await Promise.all([
      supabase.from("playbooks").select("*").eq("id", id).single(),
      supabase.from("personas").select("*").eq("playbook_id", id).order("created_at"),
      supabase.from("skills").select("*").eq("playbook_id", id).order("created_at"),
      supabase.from("mcp_servers").select("*").eq("playbook_id", id).order("created_at"),
      supabase.from("memories").select("*").eq("playbook_id", id).order("updated_at", { ascending: false }),
      supabase.from("api_keys").select("*").eq("playbook_id", id).order("created_at", { ascending: false }),
    ]);

    if (playbookRes.data) setPlaybook(playbookRes.data as Playbook);
    setPersonas((personasRes.data as Persona[]) || []);
    setSkills((skillsRes.data as Skill[]) || []);
    setMcpServers((mcpRes.data as MCPServer[]) || []);
    setMemories((memoriesRes.data as Memory[]) || []);
    setApiKeys((keysRes.data as ApiKey[]) || []);
    setLoading(false);
  };

  const handleManualSave = async () => {
    if (!playbook) return;
    setSaving(true);
    
    const supabase = createBrowserClient();
    await supabase
      .from("playbooks")
      .update({
        name: playbook.name,
        description: playbook.description,
        is_public: playbook.is_public,
      })
      .eq("id", id);

    setSaving(false);
    setHasChanges(false);
  };

  const updatePlaybook = useCallback((updates: Partial<Playbook>) => {
    if (!playbook) return;
    setPlaybook({ ...playbook, ...updates });
    setHasChanges(true);
  }, [playbook]);

  // Add handlers
  const handleAddPersona = async () => {
    const name = prompt("Persona name:");
    if (!name) return;

    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("personas")
      .insert({
        playbook_id: id,
        name,
        system_prompt: "You are a helpful assistant.",
        metadata: {},
      })
      .select()
      .single();

    if (!error && data) {
      setPersonas([...personas, data as Persona]);
    }
  };

  const handleAddSkill = async () => {
    const name = prompt("Skill name (snake_case):");
    if (!name) return;

    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("skills")
      .insert({
        playbook_id: id,
        name,
        description: "",
        definition: { 
          parameters: { 
            type: "object", 
            properties: {},
            required: []
          } 
        },
        examples: [],
      })
      .select()
      .single();

    if (!error && data) {
      setSkills([...skills, data as Skill]);
    }
  };

  const handleAddMCP = async () => {
    const name = prompt("MCP Server name:");
    if (!name) return;

    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("mcp_servers")
      .insert({
        playbook_id: id,
        name,
        description: "",
        tools: [],
        resources: [],
      })
      .select()
      .single();

    if (!error && data) {
      setMcpServers([...mcpServers, data as MCPServer]);
    }
  };

  // Delete handlers
  const handleDeletePersona = async (personaId: string) => {
    const supabase = createBrowserClient();
    await supabase.from("personas").delete().eq("id", personaId);
    setPersonas(personas.filter(p => p.id !== personaId));
  };

  const handleDeleteSkill = async (skillId: string) => {
    const supabase = createBrowserClient();
    await supabase.from("skills").delete().eq("id", skillId);
    setSkills(skills.filter(s => s.id !== skillId));
  };

  const handleDeleteMCP = async (mcpId: string) => {
    const supabase = createBrowserClient();
    await supabase.from("mcp_servers").delete().eq("id", mcpId);
    setMcpServers(mcpServers.filter(m => m.id !== mcpId));
  };

  // Clipboard
  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  // Get base URL for API endpoints
  const getBaseUrl = () => {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "https://agentplaybooks.ai";
  };

  const tabs = [
    { id: "personas" as TabType, label: t("editor.tabs.personas"), icon: Brain, count: personas.length, color: "blue" },
    { id: "skills" as TabType, label: t("editor.tabs.skills"), icon: Zap, count: skills.length, color: "purple" },
    { id: "mcp" as TabType, label: t("editor.tabs.mcp"), icon: Server, count: mcpServers.length, color: "pink" },
    { id: "memory" as TabType, label: t("editor.tabs.memory"), icon: Database, count: memories.length, color: "teal" },
    { id: "apiKeys" as TabType, label: t("editor.tabs.apiKeys"), icon: Key, count: apiKeys.length, color: "amber" },
    { id: "settings" as TabType, label: t("editor.tabs.settings"), icon: Settings, count: 0, color: "slate" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          <p className="text-slate-400">Loading playbook...</p>
        </div>
      </div>
    );
  }

  if (!playbook) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-slate-400 mb-4">Playbook not found</p>
          <Link 
            href="/dashboard"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-blue-900/30 bg-[#0a0f1a]/90 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <input
                type="text"
                value={playbook.name}
                onChange={(e) => updatePlaybook({ name: e.target.value })}
                className={cn(
                  "text-xl font-bold bg-transparent border-none focus:outline-none",
                  "text-white placeholder:text-slate-500",
                  "hover:bg-slate-800/50 focus:bg-slate-800/70 rounded px-2 py-1 -ml-2"
                )}
              />
              <div className="flex items-center gap-2 text-sm text-slate-500 px-2">
                <code className="font-mono">/{playbook.guid}</code>
                <button
                  onClick={() => copyToClipboard(`${getBaseUrl()}/api/playbooks/${playbook.guid}`, "api-url")}
                  className="p-1 hover:text-white transition-colors"
                  title="Copy API URL"
                >
                  {copied === "api-url" ? (
                    <Check className="h-3 w-3 text-green-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Status indicators */}
            {hasChanges && !saving && (
              <span className="text-amber-400 text-sm">Unsaved changes</span>
            )}
            {saving && (
              <span className="flex items-center gap-2 text-blue-400 text-sm">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            
            {/* Public/Private toggle */}
            <button
              onClick={() => updatePlaybook({ is_public: !playbook.is_public })}
              className={cn(
                "px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors",
                playbook.is_public 
                  ? "bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20" 
                  : "bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600"
              )}
            >
              {playbook.is_public ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {playbook.is_public ? "Public" : "Private"}
            </button>
            
            {/* Save button */}
            <button
              onClick={handleManualSave}
              disabled={saving || !hasChanges}
              className={cn(
                "px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-all",
                hasChanges
                  ? "bg-gradient-to-r from-amber-600 to-amber-400 text-slate-900 shadow-lg shadow-amber-500/25"
                  : "bg-slate-800 text-slate-400"
              )}
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : t("editor.save")}
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-blue-900/30 bg-[#0a0f1a]/50">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-4 py-3 flex items-center gap-2 text-sm font-medium border-b-2 transition-all whitespace-nowrap",
                  activeTab === tab.id
                    ? `border-${tab.color}-500 text-white`
                    : "border-transparent text-slate-400 hover:text-white hover:border-slate-700"
                )}
                style={{
                  borderBottomColor: activeTab === tab.id 
                    ? tab.color === "blue" ? "#3b82f6" 
                      : tab.color === "purple" ? "#a855f7" 
                      : tab.color === "pink" ? "#ec4899" 
                      : tab.color === "teal" ? "#14b8a6" 
                      : tab.color === "amber" ? "#f59e0b" 
                      : "#64748b"
                    : "transparent"
                }}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className="px-2 py-0.5 bg-slate-800 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {/* Personas Tab */}
          {activeTab === "personas" && (
            <motion.div
              key="personas"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Brain className="h-5 w-5 text-blue-400" />
                  {t("editor.tabs.personas")}
                </h2>
                <button
                  onClick={handleAddPersona}
                  className={cn(
                    "px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium",
                    "bg-blue-600/20 text-blue-400 border border-blue-500/30",
                    "hover:bg-blue-600/30 transition-colors"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  {t("editor.addPersona")}
                </button>
              </div>
              
              {personas.length === 0 ? (
                <EmptyState 
                  icon={Brain}
                  message="No personas yet" 
                  description="Personas define AI personalities and system prompts."
                  color="blue"
                />
              ) : (
                <div className="space-y-4">
                  {personas.map((persona) => (
                    <PersonaEditor
                      key={persona.id}
                      persona={persona}
                      onDelete={() => handleDeletePersona(persona.id)}
                      onUpdate={(updated) => {
                        setPersonas(personas.map(p => p.id === updated.id ? updated : p));
                      }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Skills Tab */}
          {activeTab === "skills" && (
            <motion.div
              key="skills"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-purple-400" />
                  {t("editor.tabs.skills")}
                </h2>
                <button
                  onClick={handleAddSkill}
                  className={cn(
                    "px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium",
                    "bg-purple-600/20 text-purple-400 border border-purple-500/30",
                    "hover:bg-purple-600/30 transition-colors"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  {t("editor.addSkill")}
                </button>
              </div>
              
              {skills.length === 0 ? (
                <EmptyState 
                  icon={Zap}
                  message="No skills yet" 
                  description="Skills define structured capabilities using JSON Schema."
                  color="purple"
                />
              ) : (
                <div className="space-y-4">
                  {skills.map((skill) => (
                    <SkillEditor
                      key={skill.id}
                      skill={skill}
                      onDelete={() => handleDeleteSkill(skill.id)}
                      onUpdate={(updated) => {
                        setSkills(skills.map(s => s.id === updated.id ? updated : s));
                      }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* MCP Tab */}
          {activeTab === "mcp" && (
            <motion.div
              key="mcp"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Server className="h-5 w-5 text-pink-400" />
                  {t("editor.tabs.mcp")}
                </h2>
                <button
                  onClick={handleAddMCP}
                  className={cn(
                    "px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium",
                    "bg-pink-600/20 text-pink-400 border border-pink-500/30",
                    "hover:bg-pink-600/30 transition-colors"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  {t("editor.addMCP")}
                </button>
              </div>
              
              {mcpServers.length === 0 ? (
                <EmptyState 
                  icon={Server}
                  message="No MCP servers yet" 
                  description="MCP servers provide tools and resources for AI agents."
                  color="pink"
                />
              ) : (
                <div className="space-y-4">
                  {mcpServers.map((mcp) => (
                    <McpServerEditor
                      key={mcp.id}
                      mcpServer={mcp}
                      onDelete={() => handleDeleteMCP(mcp.id)}
                      onUpdate={(updated) => {
                        setMcpServers(mcpServers.map(m => m.id === updated.id ? updated : m));
                      }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Memory Tab */}
          {activeTab === "memory" && (
            <motion.div
              key="memory"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <MemoryEditor
                playbook_id={id}
                memories={memories}
                onUpdate={setMemories}
              />
            </motion.div>
          )}

          {/* API Keys Tab */}
          {activeTab === "apiKeys" && (
            <motion.div
              key="apiKeys"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <ApiKeyManager
                playbook_id={id}
                apiKeys={apiKeys}
                onUpdate={setApiKeys}
              />
            </motion.div>
          )}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-3xl"
            >
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <Settings className="h-5 w-5 text-slate-400" />
                {t("editor.tabs.settings")}
              </h2>
              
              <div className="space-y-6">
                {/* Description */}
                <div className={cn(
                  "p-5 rounded-xl",
                  "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
                  "border border-slate-700/50"
                )}>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Description
                  </label>
                  <textarea
                    value={playbook.description || ""}
                    onChange={(e) => updatePlaybook({ description: e.target.value })}
                    className={cn(
                      "w-full p-3 rounded-lg",
                      "bg-slate-900/70 border border-slate-700/50",
                      "text-slate-200 placeholder:text-slate-600",
                      "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20",
                      "resize-y min-h-[100px]"
                    )}
                    placeholder="Describe what this playbook is for..."
                  />
                </div>

                {/* Visibility */}
                <div className={cn(
                  "p-5 rounded-xl",
                  "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
                  "border border-slate-700/50"
                )}>
                  <label className="block text-sm font-medium text-slate-400 mb-4">
                    Visibility
                  </label>
                  <div className="flex gap-4">
                    <button
                      onClick={() => updatePlaybook({ is_public: false })}
                      className={cn(
                        "flex-1 p-4 rounded-xl border flex items-center gap-3 transition-all",
                        !playbook.is_public
                          ? "border-blue-500/50 bg-blue-500/10"
                          : "border-slate-700/50 bg-slate-900/50 hover:border-slate-600"
                      )}
                    >
                      <Lock className="h-5 w-5" />
                      <div className="text-left">
                        <p className="font-medium">Private</p>
                        <p className="text-sm text-slate-400">Only you can access</p>
                      </div>
                    </button>
                    <button
                      onClick={() => updatePlaybook({ is_public: true })}
                      className={cn(
                        "flex-1 p-4 rounded-xl border flex items-center gap-3 transition-all",
                        playbook.is_public
                          ? "border-green-500/50 bg-green-500/10"
                          : "border-slate-700/50 bg-slate-900/50 hover:border-slate-600"
                      )}
                    >
                      <Globe className="h-5 w-5" />
                      <div className="text-left">
                        <p className="font-medium">Public</p>
                        <p className="text-sm text-slate-400">Anyone with the link</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* API Endpoints */}
                <div className={cn(
                  "p-5 rounded-xl",
                  "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
                  "border border-slate-700/50"
                )}>
                  <h3 className="font-medium mb-4 flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-slate-400" />
                    API Endpoints
                  </h3>
                  <div className="space-y-2">
                    {[
                      { method: "GET", path: `/api/playbooks/${playbook.guid}`, desc: "JSON format" },
                      { method: "GET", path: `/api/playbooks/${playbook.guid}?format=openapi`, desc: "OpenAPI for GPTs" },
                      { method: "GET", path: `/api/playbooks/${playbook.guid}?format=mcp`, desc: "MCP manifest" },
                      { method: "GET", path: `/api/playbooks/${playbook.guid}?format=markdown`, desc: "Markdown docs" },
                      { method: "GET", path: `/api/mcp/${playbook.guid}`, desc: "MCP server" },
                      { method: "POST", path: `/api/agent/${playbook.guid}/memory`, desc: "Write memory (API key)" },
                    ].map(({ method, path, desc }) => (
                      <div 
                        key={path}
                        className="flex items-center gap-3 p-3 bg-slate-900/70 rounded-lg border border-slate-700/50 group"
                      >
                        <span className={cn(
                          "text-xs font-mono px-2 py-0.5 rounded",
                          method === "GET" ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"
                        )}>
                          {method}
                        </span>
                        <code className="flex-1 text-sm text-slate-300 font-mono truncate">
                          {path}
                        </code>
                        <span className="text-xs text-slate-500 hidden sm:block">
                          {desc}
                        </span>
                        <button
                          onClick={() => copyToClipboard(`${getBaseUrl()}${path}`, path)}
                          className="p-1.5 text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                        >
                          {copied === path ? (
                            <Check className="h-4 w-4 text-green-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Danger Zone */}
                <div className={cn(
                  "p-5 rounded-xl",
                  "bg-gradient-to-br from-red-950/30 to-red-900/20",
                  "border border-red-900/30"
                )}>
                  <h3 className="font-medium text-red-400 mb-2">Danger Zone</h3>
                  <p className="text-sm text-slate-400 mb-4">
                    Deleting this playbook will remove all associated personas, skills, MCP servers, memories, and API keys.
                  </p>
                  <button
                    onClick={async () => {
                      if (!confirm("Are you SURE you want to delete this entire playbook? This cannot be undone!")) return;
                      if (!confirm("Really? This will delete ALL data in this playbook.")) return;
                      
                      const supabase = createBrowserClient();
                      await supabase.from("playbooks").delete().eq("id", id);
                      window.location.href = "/dashboard";
                    }}
                    className="px-4 py-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition-colors"
                  >
                    Delete Playbook
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// Empty state component
function EmptyState({ 
  icon: Icon, 
  message, 
  description,
  color 
}: { 
  icon: React.ComponentType<{ className?: string }>; 
  message: string;
  description: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-700",
    purple: "text-purple-700",
    pink: "text-pink-700",
    teal: "text-teal-700",
    amber: "text-amber-700",
    slate: "text-slate-700"
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-12 text-center bg-slate-900/50 rounded-xl border border-dashed border-slate-700"
    >
      <Icon className={cn("h-12 w-12 mx-auto mb-4", colorMap[color] || "text-slate-700")} />
      <h3 className="text-lg font-medium text-slate-400 mb-2">{message}</h3>
      <p className="text-sm text-slate-500">{description}</p>
    </motion.div>
  );
}
