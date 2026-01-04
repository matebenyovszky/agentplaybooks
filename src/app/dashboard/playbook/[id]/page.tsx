"use client";

import { useEffect, useState, use, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { createSupabaseAdapter } from "@/lib/storage";
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
  Loader2,
  Search,
  Download,
  X,
  Star,
  Tag
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
  
  // Create storage adapter
  const storage = useMemo(() => createSupabaseAdapter(id), [id]);
  
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
  const [isOwner, setIsOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Browse public modals
  const [showBrowseSkills, setShowBrowseSkills] = useState(false);
  const [showBrowseMCP, setShowBrowseMCP] = useState(false);
  const [publicSkills, setPublicSkills] = useState<Skill[]>([]);
  const [publicMCPs, setPublicMCPs] = useState<MCPServer[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseSearch, setBrowseSearch] = useState("");
  const [newTagInput, setNewTagInput] = useState("");

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

    // Get current user first
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;
    setCurrentUserId(userId);

    const [playbookRes, personasRes, skillsRes, mcpRes, memoriesRes, keysRes] = await Promise.all([
      supabase.from("playbooks").select("*").eq("id", id).single(),
      supabase.from("personas").select("*").eq("playbook_id", id).order("created_at"),
      supabase.from("skills").select("*").eq("playbook_id", id).order("created_at"),
      supabase.from("mcp_servers").select("*").eq("playbook_id", id).order("created_at"),
      supabase.from("memories").select("*").eq("playbook_id", id).order("updated_at", { ascending: false }),
      supabase.from("api_keys").select("*").eq("playbook_id", id).order("created_at", { ascending: false }),
    ]);

    if (playbookRes.data) {
      setPlaybook(playbookRes.data as Playbook);
      // Check if current user is the owner
      setIsOwner(userId !== null && playbookRes.data.user_id === userId);
    }
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

  // Add handlers - create items with default names, no prompt needed
  const handleAddPersona = async () => {
    const defaultName = `New Persona ${personas.length + 1}`;
    
    const data = await storage.addPersona({
      name: defaultName,
      system_prompt: "You are a helpful assistant.",
      metadata: {},
    });

    if (data) {
      setPersonas([...personas, data]);
    }
  };

  const handleAddSkill = async () => {
    const defaultName = `new_skill_${skills.length + 1}`;
    
    const data = await storage.addSkill({
      name: defaultName,
      description: "",
      definition: { 
        parameters: { 
          type: "object", 
          properties: {},
          required: []
        } 
      },
      examples: [],
    });

    if (data) {
      setSkills([...skills, data]);
    }
  };

  const handleAddMCP = async () => {
    const defaultName = `New MCP Server ${mcpServers.length + 1}`;
    
    const data = await storage.addMcpServer({
      name: defaultName,
      description: "",
      tools: [],
      resources: [],
    });

    if (data) {
      setMcpServers([...mcpServers, data]);
    }
  };

  // Import handlers for public skills/MCP servers
  const handleImportSkill = async (publicSkill: Skill) => {
    const supabase = createBrowserClient();
    
    const { data, error } = await supabase
      .from("skills")
      .insert({
        playbook_id: id,
        name: publicSkill.name,
        description: publicSkill.description,
        definition: publicSkill.definition,
        examples: publicSkill.examples,
      })
      .select()
      .single();

    if (!error && data) {
      setSkills([...skills, data as Skill]);
    }
  };

  const handleImportMCP = async (publicMCP: MCPServer) => {
    const supabase = createBrowserClient();
    
    const { data, error } = await supabase
      .from("mcp_servers")
      .insert({
        playbook_id: id,
        name: publicMCP.name,
        description: publicMCP.description,
        tools: publicMCP.tools,
        resources: publicMCP.resources,
      })
      .select()
      .single();

    if (!error && data) {
      setMcpServers([...mcpServers, data as MCPServer]);
      setShowBrowseMCP(false);
    }
  };

  // Load public skills for browsing
  const loadPublicSkills = async () => {
    setBrowseLoading(true);
    const supabase = createBrowserClient();
    
    const { data } = await supabase
      .from("skills")
      .select(`
        *,
        playbooks!inner(is_public)
      `)
      .eq("playbooks.is_public", true)
      .order("name");
    
    setPublicSkills((data as Skill[]) || []);
    setBrowseLoading(false);
  };

  // Load public MCP servers for browsing
  const loadPublicMCPs = async () => {
    setBrowseLoading(true);
    const supabase = createBrowserClient();
    
    const { data } = await supabase
      .from("mcp_servers")
      .select(`
        *,
        playbooks!inner(is_public)
      `)
      .eq("playbooks.is_public", true)
      .order("name");
    
    setPublicMCPs((data as MCPServer[]) || []);
    setBrowseLoading(false);
  };

  // Open browse modals
  const openBrowseSkills = () => {
    setShowBrowseSkills(true);
    setBrowseSearch("");
    loadPublicSkills();
  };

  const openBrowseMCP = () => {
    setShowBrowseMCP(true);
    setBrowseSearch("");
    loadPublicMCPs();
  };

  // Filter public items by search
  const filteredPublicSkills = publicSkills.filter(s => 
    s.name.toLowerCase().includes(browseSearch.toLowerCase()) ||
    (s.description || "").toLowerCase().includes(browseSearch.toLowerCase())
  );

  const filteredPublicMCPs = publicMCPs.filter(m => 
    m.name.toLowerCase().includes(browseSearch.toLowerCase()) ||
    (m.description || "").toLowerCase().includes(browseSearch.toLowerCase())
  );

  // Delete handlers
  const handleDeletePersona = async (personaId: string) => {
    const success = await storage.deletePersona(personaId);
    if (success) {
      setPersonas(personas.filter(p => p.id !== personaId));
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    const success = await storage.deleteSkill(skillId);
    if (success) {
      setSkills(skills.filter(s => s.id !== skillId));
    }
  };

  const handleDeleteMCP = async (mcpId: string) => {
    const success = await storage.deleteMcpServer(mcpId);
    if (success) {
      setMcpServers(mcpServers.filter(m => m.id !== mcpId));
    }
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
              {isOwner ? (
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
              ) : (
                <h1 className="text-xl font-bold text-white px-2 py-1 -ml-2">{playbook.name}</h1>
              )}
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
            {/* Read-only badge for non-owners */}
            {!isOwner && (
              <span className="px-3 py-1.5 bg-slate-700/50 text-slate-400 text-sm rounded-lg border border-slate-600/50 flex items-center gap-2">
                <Eye className="h-4 w-4" />
                {t("editor.readOnly") || "Read Only"}
              </span>
            )}
            
            {/* Status indicators - only for owners */}
            {isOwner && hasChanges && !saving && (
              <span className="text-amber-400 text-sm">Unsaved changes</span>
            )}
            {isOwner && saving && (
              <span className="flex items-center gap-2 text-blue-400 text-sm">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            
            {/* Public/Private toggle - only for owners */}
            {isOwner ? (
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
            ) : (
              <span className={cn(
                "px-3 py-2 rounded-lg flex items-center gap-2 text-sm",
                playbook.is_public 
                  ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                  : "bg-slate-800/50 text-slate-400 border border-slate-700/50"
              )}>
                {playbook.is_public ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {playbook.is_public ? "Public" : "Private"}
              </span>
            )}
            
            {/* Save button - only for owners */}
            {isOwner && (
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
            )}
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
                {isOwner && (
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
                )}
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
                      storage={storage}
                      readOnly={!isOwner}
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
                {isOwner && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={openBrowseSkills}
                      className={cn(
                        "px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium",
                        "bg-slate-700/50 text-slate-300 border border-slate-600/50",
                        "hover:bg-slate-700 transition-colors"
                      )}
                    >
                      <Search className="h-4 w-4" />
                      {t("editor.browsePublic")}
                    </button>
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
                )}
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
                      storage={storage}
                      readOnly={!isOwner}
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
                {isOwner && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={openBrowseMCP}
                      className={cn(
                        "px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium",
                        "bg-slate-700/50 text-slate-300 border border-slate-600/50",
                        "hover:bg-slate-700 transition-colors"
                      )}
                    >
                      <Search className="h-4 w-4" />
                      {t("editor.browsePublic")}
                    </button>
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
                )}
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
                      storage={storage}
                      readOnly={!isOwner}
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
                storage={storage}
                memories={memories}
                onUpdate={setMemories}
                readOnly={!isOwner}
              />
            </motion.div>
          )}

          {/* API Keys Tab - only visible to owner */}
          {activeTab === "apiKeys" && isOwner && (
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
          
          {/* API Keys Tab - not owner message */}
          {activeTab === "apiKeys" && !isOwner && (
            <motion.div
              key="apiKeys-readonly"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center py-16"
            >
              <Lock className="h-12 w-12 mx-auto text-slate-600 mb-4" />
              <p className="text-slate-400">{t("editor.apiKeysPrivate") || "API Keys are only visible to the playbook owner"}</p>
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
                  {isOwner ? (
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
                  ) : (
                    <p className="text-slate-300 p-3 bg-slate-900/50 rounded-lg min-h-[60px]">
                      {playbook.description || <span className="text-slate-500 italic">No description</span>}
                    </p>
                  )}
                </div>

                {/* Tags */}
                <div className={cn(
                  "p-5 rounded-xl",
                  "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
                  "border border-slate-700/50"
                )}>
                  <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Tags
                  </label>
                  {isOwner && (
                    <p className="text-xs text-slate-500 mb-3">
                      Add tags to help others find your playbook in the Explore page
                    </p>
                  )}
                  
                  {/* Existing tags */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(playbook.tags || []).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-full text-sm"
                      >
                        {tag}
                        {isOwner && (
                          <button
                            onClick={() => {
                              const newTags = (playbook.tags || []).filter(t => t !== tag);
                              updatePlaybook({ tags: newTags });
                            }}
                            className="hover:bg-amber-500/30 rounded-full p-0.5 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                    {(!playbook.tags || playbook.tags.length === 0) && (
                      <span className="text-sm text-slate-500 italic">No tags yet</span>
                    )}
                  </div>
                  
                  {/* Add new tag - only for owner */}
                  {isOwner && (
                    <>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newTagInput}
                          onChange={(e) => setNewTagInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newTagInput.trim()) {
                              e.preventDefault();
                              const tag = newTagInput.trim();
                              if (tag && !(playbook.tags || []).includes(tag)) {
                                updatePlaybook({ tags: [...(playbook.tags || []), tag] });
                              }
                              setNewTagInput("");
                            }
                          }}
                          className={cn(
                            "flex-1 px-3 py-2 rounded-lg",
                            "bg-slate-900/70 border border-slate-700/50",
                            "text-slate-200 placeholder:text-slate-600",
                            "focus:outline-none focus:border-amber-500/50"
                          )}
                          placeholder="Add a tag (e.g. coding, writing, automation)"
                          maxLength={30}
                        />
                        <button
                          onClick={() => {
                            const tag = newTagInput.trim();
                            if (tag && !(playbook.tags || []).includes(tag)) {
                              updatePlaybook({ tags: [...(playbook.tags || []), tag] });
                            }
                            setNewTagInput("");
                          }}
                          disabled={!newTagInput.trim()}
                          className={cn(
                            "px-4 py-2 rounded-lg font-medium transition-colors",
                            newTagInput.trim()
                              ? "bg-amber-500 text-slate-900 hover:bg-amber-400"
                              : "bg-slate-800 text-slate-500 cursor-not-allowed"
                          )}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      
                      {/* Popular tags suggestions */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="text-xs text-slate-500 mr-1">Popular:</span>
                        {["coding", "writing", "data", "automation", "research", "creative", "productivity"].map(tag => (
                          <button
                            key={tag}
                            onClick={() => {
                          if (!(playbook.tags || []).includes(tag)) {
                            updatePlaybook({ tags: [...(playbook.tags || []), tag] });
                          }
                        }}
                        disabled={(playbook.tags || []).includes(tag)}
                        className={cn(
                          "px-2 py-0.5 rounded text-xs transition-colors",
                          (playbook.tags || []).includes(tag)
                            ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                            : "bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                        )}
                      >
                            +{tag}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Visibility - only changeable by owner */}
                {isOwner ? (
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
                ) : (
                  <div className={cn(
                    "p-5 rounded-xl",
                    "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
                    "border border-slate-700/50"
                  )}>
                    <label className="block text-sm font-medium text-slate-400 mb-4">
                      Visibility
                    </label>
                    <div className={cn(
                      "p-4 rounded-xl border flex items-center gap-3",
                      playbook.is_public
                        ? "border-green-500/50 bg-green-500/10"
                        : "border-blue-500/50 bg-blue-500/10"
                    )}>
                      {playbook.is_public ? <Globe className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                      <div className="text-left">
                        <p className="font-medium">{playbook.is_public ? "Public" : "Private"}</p>
                        <p className="text-sm text-slate-400">
                          {playbook.is_public ? "Anyone with the link can view" : "Only the owner can access"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

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

                {/* Platform Integrations */}
                <div className={cn(
                  "p-5 rounded-xl",
                  "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
                  "border border-slate-700/50"
                )}>
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400" />
                    Use with AI Platforms
                  </h3>
                  <p className="text-sm text-slate-500 mb-4">
                    Add this playbook to your favorite AI assistant. Click a platform for step-by-step instructions.
                  </p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                    {[
                      { 
                        name: "ChatGPT", 
                        icon: "🤖", 
                        color: "from-emerald-600/20 to-teal-600/20", 
                        borderColor: "border-emerald-500/30",
                        desc: "Custom GPTs with Actions",
                        anchor: "#openai-chatgpt-custom-gpts"
                      },
                      { 
                        name: "Claude", 
                        icon: "🧠", 
                        color: "from-orange-600/20 to-amber-600/20", 
                        borderColor: "border-orange-500/30",
                        desc: "Projects & Instructions",
                        anchor: "#anthropic-claude-claude-ai"
                      },
                      { 
                        name: "Gemini", 
                        icon: "💎", 
                        color: "from-blue-600/20 to-cyan-600/20", 
                        borderColor: "border-blue-500/30",
                        desc: "Gems Configuration",
                        anchor: "#google-gemini"
                      },
                      { 
                        name: "Grok", 
                        icon: "⚡", 
                        color: "from-slate-600/20 to-zinc-600/20", 
                        borderColor: "border-slate-500/30",
                        desc: "Projects & System Prompts",
                        anchor: "#xai-grok"
                      },
                      { 
                        name: "Claude Code", 
                        icon: "💻", 
                        color: "from-violet-600/20 to-purple-600/20", 
                        borderColor: "border-violet-500/30",
                        desc: "MCP Integration",
                        anchor: "#claude-code-cli-agent"
                      },
                      { 
                        name: "Any API", 
                        icon: "🔌", 
                        color: "from-pink-600/20 to-rose-600/20", 
                        borderColor: "border-pink-500/30",
                        desc: "Generic Integration",
                        anchor: "#generic-integration-template"
                      },
                    ].map((platform) => (
                      <Link
                        key={platform.name}
                        href={`/docs/platform-integrations${platform.anchor}`}
                        target="_blank"
                        className={cn(
                          "p-3 rounded-lg border transition-all group",
                          `bg-gradient-to-br ${platform.color}`,
                          platform.borderColor,
                          "hover:scale-[1.02] hover:shadow-lg"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{platform.icon}</span>
                          <span className="font-medium text-sm">{platform.name}</span>
                          <ExternalLink className="h-3 w-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                        </div>
                        <p className="text-xs text-slate-400">{platform.desc}</p>
                      </Link>
                    ))}
                  </div>
                  
                  {/* Quick Copy URLs for each platform */}
                  <div className="space-y-2 pt-3 border-t border-slate-700/50">
                    <p className="text-xs text-slate-500 mb-2">Quick copy URLs for integration:</p>
                    <div className="grid gap-2">
                      {[
                        { 
                          label: "OpenAPI (for ChatGPT Actions)", 
                          url: `${getBaseUrl()}/api/playbooks/${playbook.guid}?format=openapi`,
                          color: "text-emerald-400"
                        },
                        { 
                          label: "Markdown (for Claude/Gemini)", 
                          url: `${getBaseUrl()}/api/playbooks/${playbook.guid}?format=markdown`,
                          color: "text-orange-400"
                        },
                        { 
                          label: "MCP Endpoint (for Claude Code)", 
                          url: `${getBaseUrl()}/api/mcp/${playbook.guid}`,
                          color: "text-violet-400"
                        },
                      ].map(({ label, url, color }) => (
                        <div 
                          key={label}
                          className="flex items-center gap-2 p-2 bg-slate-900/70 rounded-lg border border-slate-700/50 group"
                        >
                          <span className={cn("text-xs font-medium whitespace-nowrap", color)}>
                            {label}
                          </span>
                          <code className="flex-1 text-xs text-slate-400 font-mono truncate">
                            {url}
                          </code>
                          <button
                            onClick={() => copyToClipboard(url, label)}
                            className="p-1.5 text-slate-500 hover:text-white transition-colors"
                          >
                            {copied === label ? (
                              <Check className="h-3.5 w-3.5 text-green-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Full docs link */}
                  <div className="mt-4 pt-3 border-t border-slate-700/50">
                    <Link
                      href="/docs/platform-integrations"
                      target="_blank"
                      className="inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      <span>📖</span>
                      <span>View complete integration guide</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
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

      {/* Browse Public Skills Modal */}
      <AnimatePresence>
        {showBrowseSkills && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setShowBrowseSkills(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl max-h-[80vh] bg-slate-900 border border-purple-500/30 rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Globe className="h-5 w-5 text-purple-400" />
                  {t("editor.browsePublicSkills")}
                </h3>
                <button
                  onClick={() => setShowBrowseSkills(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Search */}
              <div className="p-4 border-b border-slate-700/50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={browseSearch}
                    onChange={(e) => setBrowseSearch(e.target.value)}
                    placeholder={t("editor.searchPublic")}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
                  />
                </div>
              </div>

              {/* Content */}
              <div className="p-4 overflow-y-auto max-h-[50vh]">
                {browseLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
                  </div>
                ) : filteredPublicSkills.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    {publicSkills.length === 0 
                      ? t("editor.noPublicSkills")
                      : t("editor.noMatchingSkills")
                    }
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredPublicSkills.map((skill) => (
                      <div
                        key={skill.id}
                        className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:border-purple-500/30 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-purple-400 shrink-0" />
                            <code className="font-medium text-slate-200 font-mono">{skill.name}</code>
                          </div>
                          {skill.description && (
                            <p className="text-sm text-slate-400 mt-1 truncate">
                              {skill.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            handleImportSkill(skill);
                            setShowBrowseSkills(false);
                          }}
                          className="shrink-0 ml-4 px-3 py-1.5 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-600/30 transition-colors flex items-center gap-1.5 text-sm"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {t("editor.import")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Browse Public MCP Servers Modal */}
      <AnimatePresence>
        {showBrowseMCP && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setShowBrowseMCP(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl max-h-[80vh] bg-slate-900 border border-pink-500/30 rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Globe className="h-5 w-5 text-pink-400" />
                  {t("editor.browsePublicMCP")}
                </h3>
                <button
                  onClick={() => setShowBrowseMCP(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Search */}
              <div className="p-4 border-b border-slate-700/50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={browseSearch}
                    onChange={(e) => setBrowseSearch(e.target.value)}
                    placeholder={t("editor.searchPublic")}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-pink-500/50"
                  />
                </div>
              </div>

              {/* Content */}
              <div className="p-4 overflow-y-auto max-h-[50vh]">
                {browseLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 text-pink-400 animate-spin" />
                  </div>
                ) : filteredPublicMCPs.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    {publicMCPs.length === 0 
                      ? t("editor.noPublicMCP")
                      : t("editor.noMatchingMCP")
                    }
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredPublicMCPs.map((mcp) => (
                      <div
                        key={mcp.id}
                        className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:border-pink-500/30 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Server className="h-4 w-4 text-pink-400 shrink-0" />
                            <span className="font-medium text-slate-200">{mcp.name}</span>
                          </div>
                          {mcp.description && (
                            <p className="text-sm text-slate-400 mt-1 truncate">
                              {mcp.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            <span>{Array.isArray(mcp.tools) ? mcp.tools.length : 0} tools</span>
                            <span>{Array.isArray(mcp.resources) ? mcp.resources.length : 0} resources</span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            handleImportMCP(mcp);
                          }}
                          className="shrink-0 ml-4 px-3 py-1.5 bg-pink-600/20 text-pink-400 border border-pink-500/30 rounded-lg hover:bg-pink-600/30 transition-colors flex items-center gap-1.5 text-sm"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {t("editor.import")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
