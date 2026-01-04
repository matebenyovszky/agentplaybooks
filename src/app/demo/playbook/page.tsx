"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { createDemoAdapter, resetDemoData, loadDemoData } from "@/lib/storage";
import { 
  ArrowLeft,
  Brain,
  Zap,
  Server,
  Database,
  Settings,
  Globe,
  Lock,
  Plus,
  Copy,
  Check,
  Sparkles,
  RefreshCw,
  LogIn,
  UserPlus,
  AlertTriangle,
  X
} from "lucide-react";
import type { Playbook, Persona, Skill, MCPServer, Memory } from "@/lib/supabase/types";

// Import shared editor components
import { PersonaEditor } from "@/components/playbook/PersonaEditor";
import { SkillEditor } from "@/components/playbook/SkillEditor";
import { McpServerEditor } from "@/components/playbook/McpServerEditor";
import { MemoryEditor } from "@/components/playbook/MemoryEditor";

type TabType = "personas" | "skills" | "mcp" | "memory" | "settings";

export default function DemoPlaybookPage() {
  const t = useTranslations();
  
  // Create demo storage adapter
  const storage = useMemo(() => createDemoAdapter(), []);
  
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

  const loadData = async () => {
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

  const updatePlaybook = useCallback(async (updates: Partial<Playbook>) => {
    if (!playbook) return;
    const updated = await storage.updatePlaybook(updates);
    if (updated) setPlaybook(updated);
  }, [playbook, storage]);

  // Add handlers
  const handleAddPersona = async () => {
    const defaultName = `New Persona ${personas.length + 1}`;
    const data = await storage.addPersona({
      name: defaultName,
      system_prompt: "You are a helpful assistant.",
      metadata: {},
    });
    if (data) setPersonas([...personas, data]);
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
    if (data) setSkills([...skills, data]);
  };

  const handleAddMCP = async () => {
    const defaultName = `New MCP Server ${mcpServers.length + 1}`;
    const data = await storage.addMcpServer({
      name: defaultName,
      description: "",
      tools: [],
      resources: [],
    });
    if (data) setMcpServers([...mcpServers, data]);
  };

  // Delete handlers
  const handleDeletePersona = async (personaId: string) => {
    const success = await storage.deletePersona(personaId);
    if (success) setPersonas(personas.filter(p => p.id !== personaId));
  };

  const handleDeleteSkill = async (skillId: string) => {
    const success = await storage.deleteSkill(skillId);
    if (success) setSkills(skills.filter(s => s.id !== skillId));
  };

  const handleDeleteMCP = async (mcpId: string) => {
    const success = await storage.deleteMcpServer(mcpId);
    if (success) setMcpServers(mcpServers.filter(m => m.id !== mcpId));
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const tabs = [
    { id: "personas" as TabType, label: t("editor.tabs.personas"), icon: Brain, color: "blue" },
    { id: "skills" as TabType, label: t("editor.tabs.skills"), icon: Zap, color: "purple" },
    { id: "mcp" as TabType, label: t("editor.tabs.mcp"), icon: Server, color: "pink" },
    { id: "memory" as TabType, label: t("editor.tabs.memory"), icon: Database, color: "green" },
    { id: "settings" as TabType, label: t("editor.tabs.settings"), icon: Settings, color: "slate" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="h-5 w-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span>Loading demo...</span>
        </div>
      </div>
    );
  }

  if (!playbook) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Failed to load demo</p>
          <Link 
            href="/"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Demo Banner */}
      <div className="bg-gradient-to-r from-amber-600/20 via-amber-500/10 to-amber-600/20 border-b border-amber-500/30">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-amber-500/20">
                <Sparkles className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-200">
                  Demo Mode - Changes saved to browser only
                </p>
                <p className="text-xs text-amber-200/60">
                  Sign up to save your playbook to the cloud and access it anywhere
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="px-3 py-1.5 text-sm rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reset Demo
              </button>
              <button
                onClick={() => setShowSignupPrompt(true)}
                className="px-3 py-1.5 text-sm rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors flex items-center gap-2"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Save to Cloud
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </Link>
            
            <div className="h-6 w-px bg-slate-700" />
            
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gradient-to-br from-blue-600 to-amber-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">
                  {playbook.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <input
                  type="text"
                  value={playbook.name}
                  onChange={(e) => updatePlaybook({ name: e.target.value })}
                  className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-500/50 rounded px-1"
                />
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <span className="text-amber-400">Demo Mode</span>
                  <span>•</span>
                  <span className="font-mono text-xs">GUID: {playbook.guid}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/50 rounded-lg px-3 py-1.5">
              {playbook.is_public ? (
                <>
                  <Globe className="h-4 w-4 text-green-400" />
                  <span>Public</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Private</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-800/50 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1 overflow-x-auto py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all whitespace-nowrap",
                  activeTab === tab.id
                    ? `bg-${tab.color}-500/20 text-${tab.color}-300 border border-${tab.color}-500/30`
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                )}
                style={activeTab === tab.id ? {
                  backgroundColor: `rgb(var(--${tab.color}-500) / 0.2)`,
                } : {}}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
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
                <div className="text-center py-12 text-slate-500">
                  <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No personas yet. Create one to define your AI&apos;s personality.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {personas.map((persona) => (
                    <PersonaEditor
                      key={persona.id}
                      persona={persona}
                      storage={storage}
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
                <div className="text-center py-12 text-slate-500">
                  <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No skills yet. Create one to define what your AI can do.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {skills.map((skill) => (
                    <SkillEditor
                      key={skill.id}
                      skill={skill}
                      storage={storage}
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
                <div className="text-center py-12 text-slate-500">
                  <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No MCP servers yet. Add one to define external tool integrations.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {mcpServers.map((mcp) => (
                    <McpServerEditor
                      key={mcp.id}
                      mcpServer={mcp}
                      storage={storage}
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
              className="space-y-6"
            >
              <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-6">
                <h3 className="text-lg font-semibold mb-4">Playbook Settings</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={playbook.name}
                      onChange={(e) => updatePlaybook({ name: e.target.value })}
                      className={cn(
                        "w-full p-3 rounded-lg",
                        "bg-slate-800/50 border border-slate-700/50",
                        "text-slate-200 placeholder:text-slate-600",
                        "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                      )}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      Description
                    </label>
                    <textarea
                      value={playbook.description || ""}
                      onChange={(e) => updatePlaybook({ description: e.target.value })}
                      rows={3}
                      className={cn(
                        "w-full p-3 rounded-lg resize-y",
                        "bg-slate-800/50 border border-slate-700/50",
                        "text-slate-200 placeholder:text-slate-600",
                        "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                      )}
                      placeholder="Describe what this playbook does..."
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-700/30">
                    <div className="flex items-center gap-3">
                      {playbook.is_public ? (
                        <Globe className="h-5 w-5 text-green-400" />
                      ) : (
                        <Lock className="h-5 w-5 text-slate-400" />
                      )}
                      <div>
                        <p className="font-medium">
                          {playbook.is_public ? "Public Playbook" : "Private Playbook"}
                        </p>
                        <p className="text-sm text-slate-500">
                          {playbook.is_public 
                            ? "Anyone can view and import this playbook"
                            : "Only you can access this playbook"
                          }
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => updatePlaybook({ is_public: !playbook.is_public })}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        playbook.is_public
                          ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                          : "bg-green-600/20 text-green-400 border border-green-500/30 hover:bg-green-600/30"
                      )}
                    >
                      {playbook.is_public ? "Make Private" : "Make Public"}
                    </button>
                  </div>
                </div>
              </div>

              {/* API Endpoints (demo info) */}
              <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-6">
                <h3 className="text-lg font-semibold mb-4">API Endpoints</h3>
                <p className="text-sm text-slate-500 mb-4">
                  In demo mode, API endpoints are simulated. Sign up to get real API access.
                </p>
                
                <div className="space-y-3">
                  {[
                    { label: "JSON Export", path: `/api/playbooks/${playbook.guid}` },
                    { label: "OpenAPI Spec", path: `/api/playbooks/${playbook.guid}/openapi` },
                    { label: "MCP Endpoint", path: `/api/mcp/${playbook.guid}` },
                  ].map((endpoint) => (
                    <div 
                      key={endpoint.label}
                      className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/30"
                    >
                      <div>
                        <p className="text-sm font-medium">{endpoint.label}</p>
                        <code className="text-xs text-slate-500">{endpoint.path}</code>
                      </div>
                      <button
                        onClick={() => copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}${endpoint.path}`, endpoint.label)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                      >
                        {copied === endpoint.label ? (
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
              <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-6">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-400" />
                  Use with AI Platforms
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  Learn how to add this playbook to your favorite AI assistant.
                </p>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  {[
                    { name: "ChatGPT", icon: "🤖", anchor: "#openai-chatgpt-custom-gpts" },
                    { name: "Claude", icon: "🧠", anchor: "#anthropic-claude-claude-ai" },
                    { name: "Gemini", icon: "💎", anchor: "#google-gemini" },
                    { name: "Grok", icon: "⚡", anchor: "#xai-grok" },
                    { name: "Claude Code", icon: "💻", anchor: "#claude-code-cli-agent" },
                    { name: "Any API", icon: "🔌", anchor: "#generic-integration-template" },
                  ].map((platform) => (
                    <Link
                      key={platform.name}
                      href={`/docs/platform-integrations${platform.anchor}`}
                      target="_blank"
                      className="p-3 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{platform.icon}</span>
                        <span className="font-medium text-sm">{platform.name}</span>
                      </div>
                    </Link>
                  ))}
                </div>
                
                <Link
                  href="/docs/platform-integrations"
                  target="_blank"
                  className="inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <span>📖 View complete integration guide</span>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Signup Prompt Modal */}
      <AnimatePresence>
        {showSignupPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setShowSignupPrompt(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-amber-500/20">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-semibold">Save Your Work</h3>
                  <button
                    onClick={() => setShowSignupPrompt(false)}
                    className="ml-auto p-1 text-slate-400 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <p className="text-slate-400 mb-6">
                  Your demo playbook is stored locally in your browser. Create an account to:
                </p>
                
                <ul className="space-y-2 mb-6">
                  {[
                    "Save your playbook to the cloud",
                    "Access from any device",
                    "Get real API endpoints",
                    "Share with your team",
                    "Generate API keys",
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                
                <div className="flex gap-3">
                  <Link
                    href="/signup"
                    className="flex-1 py-2.5 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-400 transition-colors flex items-center justify-center gap-2"
                  >
                    <UserPlus className="h-4 w-4" />
                    Sign Up
                  </Link>
                  <Link
                    href="/login"
                    className="flex-1 py-2.5 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <LogIn className="h-4 w-4" />
                    Log In
                  </Link>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
