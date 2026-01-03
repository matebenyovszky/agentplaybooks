"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
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
  Loader2,
  Sparkles,
  RefreshCw,
  LogIn,
  UserPlus,
  AlertTriangle,
  X
} from "lucide-react";
import type { Playbook, Persona, Skill, MCPServer, Memory, ApiKey } from "@/lib/supabase/types";

// Import demo storage
import {
  loadDemoData,
  saveDemoData,
  resetDemoData,
  updateDemoPlaybook,
  addDemoPersona,
  updateDemoPersona,
  deleteDemoPersona,
  addDemoSkill,
  updateDemoSkill,
  deleteDemoSkill,
  addDemoMcpServer,
  updateDemoMcpServer,
  deleteDemoMcpServer,
  addDemoMemory,
  updateDemoMemory,
  deleteDemoMemory,
} from "@/lib/demo-storage";

// Import editor components (we'll create demo-compatible versions)
import { DemoPersonaEditor } from "./DemoPersonaEditor";
import { DemoSkillEditor } from "./DemoSkillEditor";
import { DemoMcpServerEditor } from "./DemoMcpServerEditor";
import { DemoMemoryEditor } from "./DemoMemoryEditor";

type TabType = "personas" | "skills" | "mcp" | "memory" | "settings";

export default function DemoPlaybookPage() {
  const t = useTranslations();
  
  // State
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("personas");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const data = loadDemoData();
    setPlaybook(data.playbook);
    setPersonas(data.personas);
    setSkills(data.skills);
    setMcpServers(data.mcpServers);
    setMemories(data.memories);
    setLoading(false);
  };

  const handleReset = () => {
    if (confirm("Reset demo to default? All your changes will be lost.")) {
      const data = resetDemoData();
      setPlaybook(data.playbook);
      setPersonas(data.personas);
      setSkills(data.skills);
      setMcpServers(data.mcpServers);
      setMemories(data.memories);
    }
  };

  const updatePlaybook = useCallback((updates: Partial<Playbook>) => {
    if (!playbook) return;
    const updated = updateDemoPlaybook(updates);
    setPlaybook(updated);
  }, [playbook]);

  // Add handlers
  const handleAddPersona = () => {
    const name = prompt("Persona name:");
    if (!name) return;

    const newPersona = addDemoPersona({
      name,
      system_prompt: "You are a helpful assistant.",
      metadata: {},
    });
    setPersonas([...personas, newPersona]);
  };

  const handleAddSkill = () => {
    const name = prompt("Skill name (snake_case):");
    if (!name) return;

    const newSkill = addDemoSkill({
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
    });
    setSkills([...skills, newSkill]);
  };

  const handleAddMCP = () => {
    const name = prompt("MCP Server name:");
    if (!name) return;

    const newMcp = addDemoMcpServer({
      name,
      description: "",
      tools: [],
      resources: [],
    });
    setMcpServers([...mcpServers, newMcp]);
  };

  // Delete handlers
  const handleDeletePersona = (personaId: string) => {
    deleteDemoPersona(personaId);
    setPersonas(personas.filter(p => p.id !== personaId));
  };

  const handleDeleteSkill = (skillId: string) => {
    deleteDemoSkill(skillId);
    setSkills(skills.filter(s => s.id !== skillId));
  };

  const handleDeleteMCP = (mcpId: string) => {
    deleteDemoMcpServer(mcpId);
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
    return "https://agentplaybooks.com";
  };

  const tabs = [
    { id: "personas" as TabType, label: t("editor.tabs.personas"), icon: Brain, count: personas.length, color: "blue" },
    { id: "skills" as TabType, label: t("editor.tabs.skills"), icon: Zap, count: skills.length, color: "purple" },
    { id: "mcp" as TabType, label: t("editor.tabs.mcp"), icon: Server, count: mcpServers.length, color: "pink" },
    { id: "memory" as TabType, label: t("editor.tabs.memory"), icon: Database, count: memories.length, color: "teal" },
    { id: "settings" as TabType, label: t("editor.tabs.settings"), icon: Settings, count: 0, color: "slate" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          <p className="text-slate-400">Loading demo...</p>
        </div>
      </div>
    );
  }

  if (!playbook) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-slate-400 mb-4">Demo not available</p>
          <Link 
            href="/"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white">
      {/* Demo Banner */}
      <div className="bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-b border-amber-500/30">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <span className="text-amber-200 text-sm">
              <strong>Demo Mode</strong> - Changes are saved locally. Sign up to save to the cloud!
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="px-3 py-1 text-sm text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Reset Demo
            </button>
            <Link
              href="/login"
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2",
                "bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors"
              )}
            >
              <UserPlus className="h-4 w-4" />
              Sign Up Free
            </Link>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-blue-900/30 bg-[#0a0f1a]/90 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
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
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                  DEMO
                </span>
                <code className="font-mono">/{playbook.guid}</code>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-green-400 text-sm flex items-center gap-1">
              <Check className="h-3 w-3" />
              Auto-saved locally
            </span>
            
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
            
            {/* Save to Cloud button */}
            <button
              onClick={() => setShowSignupPrompt(true)}
              className={cn(
                "px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-all",
                "bg-gradient-to-r from-amber-600 to-amber-400 text-slate-900 shadow-lg shadow-amber-500/25"
              )}
            >
              <Save className="h-4 w-4" />
              Save to Cloud
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
                    <DemoPersonaEditor
                      key={persona.id}
                      persona={persona}
                      onDelete={() => handleDeletePersona(persona.id)}
                      onUpdate={(updated) => {
                        updateDemoPersona(updated.id, updated);
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
                    <DemoSkillEditor
                      key={skill.id}
                      skill={skill}
                      onDelete={() => handleDeleteSkill(skill.id)}
                      onUpdate={(updated) => {
                        updateDemoSkill(updated.id, updated);
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
                    <DemoMcpServerEditor
                      key={mcp.id}
                      mcpServer={mcp}
                      onDelete={() => handleDeleteMCP(mcp.id)}
                      onUpdate={(updated) => {
                        updateDemoMcpServer(updated.id, updated);
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
              <DemoMemoryEditor
                memories={memories}
                onUpdate={(updated) => setMemories(updated)}
                onAdd={(memory) => {
                  const newMem = addDemoMemory(memory);
                  setMemories([...memories, newMem]);
                }}
                onEdit={(id, updates) => {
                  updateDemoMemory(id, updates);
                  setMemories(memories.map(m => m.id === id ? { ...m, ...updates } : m));
                }}
                onDelete={(id) => {
                  deleteDemoMemory(id);
                  setMemories(memories.filter(m => m.id !== id));
                }}
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

                {/* API Endpoints Info */}
                <div className={cn(
                  "p-5 rounded-xl",
                  "bg-gradient-to-br from-amber-900/20 to-orange-900/20",
                  "border border-amber-500/30"
                )}>
                  <h3 className="font-medium mb-3 flex items-center gap-2 text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    API Endpoints (Available after signup)
                  </h3>
                  <p className="text-sm text-amber-200/70 mb-4">
                    Sign up to get your own API endpoints for this playbook. Your AI agents will be able to read and write data.
                  </p>
                  <div className="space-y-2 opacity-60">
                    {[
                      { method: "GET", path: `/api/playbooks/your-guid`, desc: "JSON format" },
                      { method: "GET", path: `/api/playbooks/your-guid?format=mcp`, desc: "MCP manifest" },
                      { method: "POST", path: `/api/agent/your-guid/memory`, desc: "Write memory" },
                    ].map(({ method, path, desc }) => (
                      <div 
                        key={path}
                        className="flex items-center gap-3 p-3 bg-slate-900/70 rounded-lg border border-slate-700/50"
                      >
                        <span className={cn(
                          "text-xs font-mono px-2 py-0.5 rounded",
                          method === "GET" ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"
                        )}>
                          {method}
                        </span>
                        <code className="flex-1 text-sm text-slate-400 font-mono truncate">
                          {path}
                        </code>
                        <span className="text-xs text-slate-500">
                          {desc}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Link
                    href="/login"
                    className={cn(
                      "mt-4 w-full px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2",
                      "bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors"
                    )}
                  >
                    <UserPlus className="h-4 w-4" />
                    Sign Up to Get API Access
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Sign Up Prompt Modal */}
      <AnimatePresence>
        {showSignupPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowSignupPrompt(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "w-full max-w-md rounded-2xl",
                "bg-gradient-to-br from-slate-900 to-slate-800",
                "border border-slate-700 shadow-2xl"
              )}
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Ready to save your work?
                </h3>
                <p className="text-slate-400 mb-6">
                  Create a free account to save this playbook to the cloud, get API endpoints, and access your playbook from anywhere.
                </p>
                
                <div className="space-y-3">
                  <Link
                    href="/login?signup=true"
                    className={cn(
                      "w-full px-4 py-3 rounded-lg font-semibold flex items-center justify-center gap-2",
                      "bg-gradient-to-r from-amber-600 to-amber-400 text-slate-900",
                      "hover:opacity-90 transition-opacity"
                    )}
                  >
                    <UserPlus className="h-5 w-5" />
                    Sign Up Free
                  </Link>
                  <Link
                    href="/login"
                    className={cn(
                      "w-full px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2",
                      "bg-slate-700 text-white hover:bg-slate-600 transition-colors"
                    )}
                  >
                    <LogIn className="h-5 w-5" />
                    Already have an account? Sign In
                  </Link>
                  <button
                    onClick={() => setShowSignupPrompt(false)}
                    className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Continue in Demo Mode
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


