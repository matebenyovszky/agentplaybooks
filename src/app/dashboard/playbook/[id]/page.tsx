"use client";

import { useEffect, useState, use } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/utils";
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
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff
} from "lucide-react";
import type { Playbook, Persona, Skill, MCPServer, Memory, ApiKey } from "@/lib/supabase/types";

type TabType = "personas" | "skills" | "mcp" | "memory" | "apiKeys" | "settings";

export default function PlaybookEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations();
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("personas");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadPlaybook();
  }, [id]);

  const loadPlaybook = async () => {
    const supabase = createBrowserClient();

    const [playbookRes, personasRes, skillsRes, mcpRes, memoriesRes, keysRes] = await Promise.all([
      supabase.from("playbooks").select("*").eq("id", id).single(),
      supabase.from("personas").select("*").eq("playbook_id", id),
      supabase.from("skills").select("*").eq("playbook_id", id),
      supabase.from("mcp_servers").select("*").eq("playbook_id", id),
      supabase.from("memories").select("*").eq("playbook_id", id),
      supabase.from("api_keys").select("*").eq("playbook_id", id),
    ]);

    if (playbookRes.data) setPlaybook(playbookRes.data as Playbook);
    setPersonas((personasRes.data as Persona[]) || []);
    setSkills((skillsRes.data as Skill[]) || []);
    setMcpServers((mcpRes.data as MCPServer[]) || []);
    setMemories((memoriesRes.data as Memory[]) || []);
    setApiKeys((keysRes.data as ApiKey[]) || []);
    setLoading(false);
  };

  const handleSave = async () => {
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
  };

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
    const name = prompt("Skill name:");
    if (!name) return;

    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("skills")
      .insert({
        playbook_id: id,
        name,
        description: "",
        definition: { parameters: { type: "object", properties: {} } },
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

  const handleGenerateApiKey = async () => {
    const name = prompt("API Key name (optional):");
    const key = generateApiKey();
    const keyHash = await hashApiKey(key);
    const prefix = getKeyPrefix(key);

    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        playbook_id: id,
        key_hash: keyHash,
        key_prefix: prefix,
        name: name || null,
        permissions: ["memory:read", "memory:write", "skills:read", "personas:read"],
        is_active: true,
      })
      .select()
      .single();

    if (!error && data) {
      setApiKeys([...apiKeys, data as ApiKey]);
      setNewApiKey(key);
    }
  };

  const handleRevokeApiKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key?")) return;

    const supabase = createBrowserClient();
    await supabase.from("api_keys").delete().eq("id", keyId);
    setApiKeys(apiKeys.filter(k => k.id !== keyId));
  };

  const handleDeletePersona = async (personaId: string) => {
    if (!confirm("Delete this persona?")) return;
    
    const supabase = createBrowserClient();
    await supabase.from("personas").delete().eq("id", personaId);
    setPersonas(personas.filter(p => p.id !== personaId));
  };

  const handleDeleteSkill = async (skillId: string) => {
    if (!confirm("Delete this skill?")) return;
    
    const supabase = createBrowserClient();
    await supabase.from("skills").delete().eq("id", skillId);
    setSkills(skills.filter(s => s.id !== skillId));
  };

  const handleDeleteMCP = async (mcpId: string) => {
    if (!confirm("Delete this MCP server?")) return;
    
    const supabase = createBrowserClient();
    await supabase.from("mcp_servers").delete().eq("id", mcpId);
    setMcpServers(mcpServers.filter(m => m.id !== mcpId));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: "personas" as TabType, label: t("editor.tabs.personas"), icon: Brain, count: personas.length },
    { id: "skills" as TabType, label: t("editor.tabs.skills"), icon: Zap, count: skills.length },
    { id: "mcp" as TabType, label: t("editor.tabs.mcp"), icon: Server, count: mcpServers.length },
    { id: "memory" as TabType, label: t("editor.tabs.memory"), icon: Database, count: memories.length },
    { id: "apiKeys" as TabType, label: t("editor.tabs.apiKeys"), icon: Key, count: apiKeys.length },
    { id: "settings" as TabType, label: t("editor.tabs.settings"), icon: Settings, count: 0 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!playbook) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-neutral-400">Playbook not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <input
                type="text"
                value={playbook.name}
                onChange={(e) => setPlaybook({ ...playbook, name: e.target.value })}
                className="text-xl font-bold bg-transparent border-none focus:outline-none"
              />
              <div className="flex items-center gap-2 text-sm text-neutral-400">
                <code className="font-mono">/{playbook.guid}</code>
                <button
                  onClick={() => copyToClipboard(`${window.location.origin}/api/playbooks/${playbook.guid}`)}
                  className="p-1 hover:text-white transition-colors"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPlaybook({ ...playbook, is_public: !playbook.is_public })}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm ${
                playbook.is_public 
                  ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                  : "bg-neutral-800 text-neutral-400 border border-neutral-700"
              }`}
            >
              {playbook.is_public ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {playbook.is_public ? "Public" : "Private"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg font-semibold flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : t("editor.save")}
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 flex items-center gap-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-indigo-500 text-white"
                    : "border-transparent text-neutral-400 hover:text-white"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className="px-2 py-0.5 bg-neutral-800 rounded-full text-xs">
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
        {/* Personas Tab */}
        {activeTab === "personas" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">{t("editor.tabs.personas")}</h2>
              <button
                onClick={handleAddPersona}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                {t("editor.addPersona")}
              </button>
            </div>
            {personas.length === 0 ? (
              <EmptyState message="No personas yet" />
            ) : (
              <div className="space-y-4">
                {personas.map((persona) => (
                  <PersonaCard
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
          </div>
        )}

        {/* Skills Tab */}
        {activeTab === "skills" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">{t("editor.tabs.skills")}</h2>
              <button
                onClick={handleAddSkill}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                {t("editor.addSkill")}
              </button>
            </div>
            {skills.length === 0 ? (
              <EmptyState message="No skills yet" />
            ) : (
              <div className="space-y-4">
                {skills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    onDelete={() => handleDeleteSkill(skill.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* MCP Tab */}
        {activeTab === "mcp" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">{t("editor.tabs.mcp")}</h2>
              <button
                onClick={handleAddMCP}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                {t("editor.addMCP")}
              </button>
            </div>
            {mcpServers.length === 0 ? (
              <EmptyState message="No MCP servers yet" />
            ) : (
              <div className="space-y-4">
                {mcpServers.map((mcp) => (
                  <MCPCard
                    key={mcp.id}
                    mcp={mcp}
                    onDelete={() => handleDeleteMCP(mcp.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Memory Tab */}
        {activeTab === "memory" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">{t("editor.tabs.memory")}</h2>
            </div>
            {memories.length === 0 ? (
              <EmptyState message="No memories yet. AI agents can write memories via the API." />
            ) : (
              <div className="space-y-4">
                {memories.map((memory) => (
                  <div
                    key={memory.id}
                    className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <code className="text-indigo-400 font-mono">{memory.key}</code>
                      <span className="text-xs text-neutral-500">
                        {new Date(memory.updated_at).toLocaleString()}
                      </span>
                    </div>
                    <pre className="text-sm text-neutral-300 bg-neutral-800 p-3 rounded overflow-x-auto">
                      {JSON.stringify(memory.value, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === "apiKeys" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">{t("apiKeys.title")}</h2>
                <p className="text-sm text-neutral-400 mt-1">{t("apiKeys.description")}</p>
              </div>
              <button
                onClick={handleGenerateApiKey}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                {t("apiKeys.generate")}
              </button>
            </div>

            {/* New key modal */}
            {newApiKey && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg"
              >
                <p className="text-yellow-400 text-sm mb-2">{t("apiKeys.copyWarning")}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-neutral-900 rounded font-mono text-sm break-all">
                    {newApiKey}
                  </code>
                  <button
                    onClick={() => {
                      copyToClipboard(newApiKey);
                      setNewApiKey(null);
                    }}
                    className="p-3 bg-neutral-800 hover:bg-neutral-700 rounded"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {apiKeys.length === 0 ? (
              <EmptyState message="No API keys yet" />
            ) : (
              <div className="space-y-4">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <code className="font-mono text-neutral-300">{key.key_prefix}</code>
                        {key.name && <span className="text-sm text-neutral-400">({key.name})</span>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {key.permissions.map((perm) => (
                          <span
                            key={perm}
                            className="px-2 py-0.5 bg-neutral-800 rounded text-xs text-neutral-400"
                          >
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeApiKey(key.id)}
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold mb-6">{t("editor.tabs.settings")}</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm text-neutral-400 mb-2">Description</label>
                <textarea
                  value={playbook.description || ""}
                  onChange={(e) => setPlaybook({ ...playbook, description: e.target.value })}
                  className="w-full p-3 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:border-indigo-500"
                  rows={4}
                  placeholder="Describe what this playbook is for..."
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-2">Visibility</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setPlaybook({ ...playbook, is_public: false })}
                    className={`flex-1 p-4 rounded-lg border flex items-center gap-3 ${
                      !playbook.is_public
                        ? "border-indigo-500 bg-indigo-500/10"
                        : "border-neutral-800 bg-neutral-900"
                    }`}
                  >
                    <Lock className="h-5 w-5" />
                    <div className="text-left">
                      <p className="font-medium">Private</p>
                      <p className="text-sm text-neutral-400">Only you can access</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setPlaybook({ ...playbook, is_public: true })}
                    className={`flex-1 p-4 rounded-lg border flex items-center gap-3 ${
                      playbook.is_public
                        ? "border-indigo-500 bg-indigo-500/10"
                        : "border-neutral-800 bg-neutral-900"
                    }`}
                  >
                    <Globe className="h-5 w-5" />
                    <div className="text-left">
                      <p className="font-medium">Public</p>
                      <p className="text-sm text-neutral-400">Anyone with the link</p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-neutral-800">
                <h3 className="font-medium mb-4">API Endpoints</h3>
                <div className="space-y-2 text-sm font-mono">
                  <div className="p-3 bg-neutral-900 rounded">
                    <span className="text-green-400">GET</span> /api/playbooks/{playbook.guid}
                  </div>
                  <div className="p-3 bg-neutral-900 rounded">
                    <span className="text-green-400">GET</span> /api/playbooks/{playbook.guid}?format=openapi
                  </div>
                  <div className="p-3 bg-neutral-900 rounded">
                    <span className="text-green-400">GET</span> /api/playbooks/{playbook.guid}?format=mcp
                  </div>
                  <div className="p-3 bg-neutral-900 rounded">
                    <span className="text-blue-400">POST</span> /api/agent/{playbook.guid}/memory
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-neutral-500">
      {message}
    </div>
  );
}

function PersonaCard({ 
  persona, 
  onDelete,
  onUpdate 
}: { 
  persona: Persona; 
  onDelete: () => void;
  onUpdate: (p: Persona) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(persona.system_prompt);

  const handleSave = async () => {
    const supabase = createBrowserClient();
    await supabase
      .from("personas")
      .update({ system_prompt: prompt })
      .eq("id", persona.id);
    
    onUpdate({ ...persona, system_prompt: prompt });
    setEditing(false);
  };

  return (
    <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-indigo-400" />
          <h3 className="font-semibold">{persona.name}</h3>
        </div>
        <button
          onClick={onDelete}
          className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {editing ? (
        <div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full p-3 bg-neutral-800 border border-neutral-700 rounded-lg focus:outline-none focus:border-indigo-500 text-sm"
            rows={6}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1 text-sm text-neutral-400"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 bg-indigo-500 rounded text-sm"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p
          onClick={() => setEditing(true)}
          className="text-sm text-neutral-400 cursor-pointer hover:text-neutral-300 whitespace-pre-wrap"
        >
          {persona.system_prompt}
        </p>
      )}
    </div>
  );
}

function SkillCard({ skill, onDelete }: { skill: Skill; onDelete: () => void }) {
  return (
    <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-purple-400" />
          <h3 className="font-semibold">{skill.name}</h3>
        </div>
        <button
          onClick={onDelete}
          className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {skill.description && (
        <p className="text-sm text-neutral-400 mt-2">{skill.description}</p>
      )}
    </div>
  );
}

function MCPCard({ mcp, onDelete }: { mcp: MCPServer; onDelete: () => void }) {
  return (
    <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-pink-400" />
          <h3 className="font-semibold">{mcp.name}</h3>
        </div>
        <button
          onClick={onDelete}
          className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {mcp.description && (
        <p className="text-sm text-neutral-400 mt-2">{mcp.description}</p>
      )}
      <div className="flex gap-4 mt-3 text-sm text-neutral-500">
        <span>{Array.isArray(mcp.tools) ? mcp.tools.length : 0} tools</span>
        <span>{Array.isArray(mcp.resources) ? mcp.resources.length : 0} resources</span>
      </div>
    </div>
  );
}

