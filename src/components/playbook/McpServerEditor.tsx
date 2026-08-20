"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Server,
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Plus,
  Minus,
  AlertCircle,
  Wrench,
  FolderOpen,
  Shield,
  PlugZap,
} from "lucide-react";
import type { MCPServer } from "@/lib/supabase/types";
import type { StorageAdapter } from "@/lib/storage";
import { createBrowserClient } from "@/lib/supabase/client";
import { referencedSecretNames } from "@/lib/mcp/secret-references";

interface McpServerEditorProps {
  mcpServer: MCPServer;
  /** Enables vault secret name lookup for reference autocomplete. */
  playbookGuid?: string;
  storage: StorageAdapter;
  onUpdate: (mcpServer: MCPServer) => void;
  onDelete: () => void;
  readOnly?: boolean;
}

interface Tool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Key order and whitespace are not differences. Unparseable text counts as a
 * change so the editor still offers to save while the author is mid-edit.
 */
function parses(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sameJsonValue(text: string, stored: unknown): boolean {
  try {
    return canonicalJson(JSON.parse(text)) === canonicalJson(stored);
  } catch {
    return false;
  }
}

const DEFAULT_TRANSPORT_CONFIG = { url: "", timeout_ms: 15000 };

export function McpServerEditor({ mcpServer, playbookGuid, storage, onUpdate, onDelete, readOnly = false }: McpServerEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const isReadOnly = readOnly;
  const [name, setName] = useState(mcpServer.name);
  const [description, setDescription] = useState(mcpServer.description || "");
  const [toolsJson, setToolsJson] = useState(
    JSON.stringify(mcpServer.tools || [], null, 2)
  );
  const [resourcesJson, setResourcesJson] = useState(
    JSON.stringify(mcpServer.resources || [], null, 2)
  );
  const [transportType, setTransportType] = useState<"stdio" | "http" | "sse" | "openapi">(
    mcpServer.transport_type === "stdio" || mcpServer.transport_type === "openapi" || mcpServer.transport_type === "sse"
      ? mcpServer.transport_type
      : "http"
  );
  const [transportConfigJson, setTransportConfigJson] = useState(
    JSON.stringify(mcpServer.transport_config || DEFAULT_TRANSPORT_CONFIG, null, 2)
  );
  const [secretsJson, setSecretsJson] = useState("{}");
  const [secretsChanged, setSecretsChanged] = useState(false);
  const [hasStoredSecrets, setHasStoredSecrets] = useState(false);
  const [vaultSecretNames, setVaultSecretNames] = useState<string[]>([]);
  const [vaultReferenceName, setVaultReferenceName] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true; tools: string[]; resources: string[] } | { ok: false; error: string; code?: string } | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<"connection" | "tools" | "resources">("connection");

  // Parse tools and resources
  const tools: Tool[] = Array.isArray(mcpServer.tools) ? mcpServer.tools as Tool[] : [];
  const resources: Resource[] = Array.isArray(mcpServer.resources) ? mcpServer.resources as Resource[] : [];

  // Derived, not stored: as state written from an effect this lagged a render,
  // so Save was briefly enabled on invalid JSON and disabled just after it
  // became valid again.
  const jsonError = [toolsJson, resourcesJson, transportConfigJson, secretsJson]
    .every((text) => parses(text)) ? null : "Invalid JSON";

  // Whether anything actually differs from what is stored. Derived rather than
  // pushed into state from an effect: an effect ran a render late, and the JSON
  // fields were compared as *text* against a re-serialized copy of the stored
  // value. Paste `"auth": { "type": "bearer" }` on one line, save it, and the
  // pretty-printer expands it — so the editor kept reporting unsaved changes for
  // a server that had saved perfectly. Formatting is not a change; values are.
  const hasChanges =
    name !== mcpServer.name ||
    description !== (mcpServer.description || "") ||
    transportType !== (mcpServer.transport_type || "http") ||
    !sameJsonValue(toolsJson, mcpServer.tools || []) ||
    !sameJsonValue(resourcesJson, mcpServer.resources || []) ||
    !sameJsonValue(transportConfigJson, mcpServer.transport_config || DEFAULT_TRANSPORT_CONFIG) ||
    secretsChanged;

  useEffect(() => {
    if (readOnly) return;
    const loadSecretStatus = async () => {
      const supabase = createBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/mcp/config/${mcpServer.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const config = await response.json() as { has_secrets?: boolean };
        setHasStoredSecrets(!!config.has_secrets);
      }
    };
    void loadSecretStatus();
  }, [mcpServer.id, readOnly]);

  // Names in the playbook's Secrets vault, so auth references can be picked by
  // name instead of retyped. Metadata only; values never reach the browser
  // here. Editors without vault access simply get no suggestions.
  useEffect(() => {
    if (!playbookGuid) return;
    const loadVaultNames = async () => {
      const supabase = createBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/playbooks/${playbookGuid}/secrets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const rows = await response.json() as Array<{ name?: string }>;
      if (Array.isArray(rows)) {
        setVaultSecretNames(rows.map((row) => row.name).filter((name): name is string => !!name));
      }
    };
    void loadVaultNames();
  }, [playbookGuid]);

  const referencedNames = useMemo(() => {
    try {
      return referencedSecretNames(JSON.parse(transportConfigJson));
    } catch {
      return [];
    }
  }, [transportConfigJson]);

  const insertVaultReference = useCallback(() => {
    const name = vaultReferenceName.trim();
    if (!name) return;
    try {
      const config = JSON.parse(transportConfigJson) as Record<string, unknown>;
      const auth = (config.auth && typeof config.auth === "object" && !Array.isArray(config.auth)
        ? config.auth
        : {}) as Record<string, unknown>;
      if (auth.type === "api_key") {
        auth.api_key_secret = name;
      } else if (auth.type === "oauth2_client_credentials") {
        auth.client_secret = name;
      } else {
        auth.type = "bearer";
        auth.token_secret = name;
      }
      config.auth = auth;
      setTransportConfigJson(JSON.stringify(config, null, 2));
      setVaultReferenceName("");
    } catch {
      // Invalid JSON in the textarea is already flagged by jsonError.
    }
  }, [vaultReferenceName, transportConfigJson]);

  // Asks the server to reach the upstream with the credential a real call would
  // use, so a wrong URL or an unresolved secret is visible here instead of at
  // the moment an agent tries to use the playbook.
  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const supabase = createBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in again to test the connection.");
      const response = await fetch(`/api/mcp/config/${mcpServer.id}/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      setTestResult(response.ok ? payload : { ok: false, error: payload.error || `HTTP ${response.status}` });
    } catch (error) {
      setTestResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setTesting(false);
    }
  }, [mcpServer.id]);

  const handleSave = useCallback(async () => {
    if (jsonError) return;

    setSaving(true);
    try {
      const parsedTools = JSON.parse(toolsJson);
      const parsedResources = JSON.parse(resourcesJson);
      const parsedTransportConfig = JSON.parse(transportConfigJson);
      const parsedSecrets = JSON.parse(secretsJson);

      const updated = await storage.updateMcpServer(mcpServer.id, {
        name,
        description,
        tools: parsedTools,
        resources: parsedResources,
        transport_type: transportType,
        transport_config: parsedTransportConfig,
      });

      if (updated) {
        if (secretsChanged) {
          const supabase = createBrowserClient();
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) throw new Error("Authentication required to save MCP secrets");
          const response = await fetch(`/api/mcp/config/${mcpServer.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ secrets: parsedSecrets }),
          });
          if (!response.ok) throw new Error("Failed to save encrypted MCP secrets");
          setSecretsJson("{}");
          setSecretsChanged(false);
          setHasStoredSecrets(true);
        }
        onUpdate(updated);
      }
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setSaving(false);
    }
  }, [name, description, toolsJson, resourcesJson, transportType, transportConfigJson, secretsJson, secretsChanged, mcpServer.id, jsonError, onUpdate, storage]);

  // Debounced auto-save
  useEffect(() => {
    if (!hasChanges || jsonError) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 2000);

    return () => clearTimeout(timer);
  }, [hasChanges, jsonError, handleSave]);

  const copyToClipboard = useCallback(() => {
    const manifest = {
      name,
      description,
      tools: JSON.parse(toolsJson),
      resources: JSON.parse(resourcesJson)
    };
    navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [name, description, toolsJson, resourcesJson]);

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this MCP server?")) {
      onDelete();
    }
  };

  // Add a new tool with auto-generated name
  const addTool = () => {
    const currentTools = JSON.parse(toolsJson);

    // Generate unique tool name
    let toolNum = currentTools.length + 1;
    let toolName = `new_tool_${toolNum}`;
    while (currentTools.some((t: Tool) => t.name === toolName)) {
      toolNum++;
      toolName = `new_tool_${toolNum}`;
    }

    currentTools.push({
      name: toolName,
      description: "",
      inputSchema: {
        type: "object",
        properties: {}
      }
    });
    setToolsJson(JSON.stringify(currentTools, null, 2));
  };

  // Remove a tool
  const removeTool = (index: number) => {
    const currentTools = JSON.parse(toolsJson);
    currentTools.splice(index, 1);
    setToolsJson(JSON.stringify(currentTools, null, 2));
  };

  // Add a new resource with auto-generated name
  const addResource = () => {
    const currentResources = JSON.parse(resourcesJson);

    // Generate unique resource name
    let resNum = currentResources.length + 1;
    let resourceName = `resource_${resNum}`;
    while (currentResources.some((r: Resource) => r.name === resourceName)) {
      resNum++;
      resourceName = `resource_${resNum}`;
    }

    currentResources.push({
      uri: `file:///path/to/${resourceName}`,
      name: resourceName,
      description: "",
      mimeType: "application/json"
    });
    setResourcesJson(JSON.stringify(currentResources, null, 2));
  };

  // Remove a resource
  const removeResource = (index: number) => {
    const currentResources = JSON.parse(resourcesJson);
    currentResources.splice(index, 1);
    setResourcesJson(JSON.stringify(currentResources, null, 2));
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "relative group rounded-xl border transition-all duration-200",
        "bg-white dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-800/80",
        "border-neutral-200 dark:border-pink-900/30 hover:border-pink-500 dark:hover:border-pink-700/50",
        expanded && "ring-2 ring-pink-500/20"
      )}
    >
      {/* Header */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className={cn(
            "p-2 rounded-lg",
            "bg-gradient-to-br from-pink-600/20 to-orange-600/20",
            "border border-pink-500/20"
          )}>
            <Server className="h-5 w-5 text-pink-400" />
          </div>

          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={name}
              readOnly={isReadOnly}
              onChange={(e) => {
                e.stopPropagation();
                setName(e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "text-lg font-semibold bg-transparent border-none focus:outline-none",
                "w-full text-neutral-900 dark:text-slate-100 placeholder:text-neutral-400 dark:placeholder:text-slate-500",
                "hover:bg-neutral-100 dark:hover:bg-slate-800/50 focus:bg-neutral-100 dark:focus:bg-slate-800/70 rounded px-2 py-1 -ml-2"
              )}
              placeholder="MCP Server Name"
            />
            <div className="flex items-center gap-4 text-sm text-slate-500 px-2">
              <span className="flex items-center gap-1">
                <Wrench className="h-3 w-3" />
                {tools.length} tools
              </span>
              <span className="flex items-center gap-1">
                <FolderOpen className="h-3 w-3" />
                {resources.length} resources
              </span>
              {hasChanges && <span className="text-amber-400">• unsaved</span>}
              {saving && <span className="text-pink-400">• saving...</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard();
            }}
            className="p-2 text-neutral-500 dark:text-slate-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
            title="Copy MCP manifest"
          >
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="p-2 text-neutral-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/10 rounded-lg transition-colors"
            title="Delete MCP server"
            disabled={isReadOnly}
          >
            <Trash2 className="h-4 w-4" />
          </button>

          <div className="text-slate-500">
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-neutral-600 dark:text-slate-400 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  readOnly={isReadOnly}
                  onChange={(e) => setDescription(e.target.value)}
                  className={cn(
                    "w-full h-16 p-3 rounded-lg",
                    "bg-neutral-50 dark:bg-slate-900/70 border border-neutral-200 dark:border-slate-700/50",
                    "text-neutral-900 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-600",
                    "focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/20",
                    "text-sm resize-y"
                  )}
                  placeholder="Describe this MCP server..."
                />
              </div>

              {/* Section Toggle */}
              <div className="flex items-center gap-2 border-b border-slate-700/50 pb-2">
                <button
                  onClick={() => setActiveSection("connection")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors",
                    activeSection === "connection"
                      ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <PlugZap className="h-4 w-4" />
                  Connection
                </button>
                <button
                  onClick={() => setActiveSection("tools")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors",
                    activeSection === "tools"
                      ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Wrench className="h-4 w-4" />
                  Tools ({tools.length})
                </button>
                <button
                  onClick={() => setActiveSection("resources")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors",
                    activeSection === "resources"
                      ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <FolderOpen className="h-4 w-4" />
                  Resources ({resources.length})
                </button>
              </div>

              {activeSection === "connection" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Transport</label>
                    <select
                      value={transportType}
                      onChange={(event) => setTransportType(event.target.value as "stdio" | "http" | "sse" | "openapi")}
                      disabled={isReadOnly}
                      className="w-full rounded-lg bg-slate-900/70 border border-slate-700/50 px-3 py-2 text-slate-200"
                    >
                      <option value="stdio">Local package (stdio)</option>
                      <option value="http">MCP Streamable HTTP</option>
                      <option value="sse">MCP HTTP/SSE response</option>
                      <option value="openapi">OpenAPI</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Transport configuration</label>
                    <textarea
                      value={transportConfigJson}
                      readOnly={isReadOnly}
                      onChange={(event) => setTransportConfigJson(event.target.value)}
                      className={cn(
                        "w-full h-56 p-3 rounded-lg bg-slate-900/70 border font-mono text-sm text-slate-200",
                        jsonError ? "border-red-500/50" : "border-slate-700/50"
                      )}
                      placeholder={'{"url":"https://example.com/mcp","timeout_ms":15000,"access":"playbook_api_key","auth":{"type":"bearer","token_secret":"token"}}'}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Stdio connections use <code>command</code>, <code>args</code>, and optional <code>env</code>. OpenAPI connections may use <code>spec_url</code> and <code>base_url</code>. Private and local network targets are blocked.
                    </p>
                  </div>
                  {(referencedNames.length > 0 || vaultSecretNames.length > 0) && (
                    <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
                      <p className="text-sm font-medium text-slate-400 mb-2">Secret references</p>
                      {referencedNames.length > 0 && (
                        <ul className="space-y-1 mb-2">
                          {referencedNames.map((name) => (
                            <li key={name} className="flex items-center gap-2 text-xs font-mono">
                              <span className="text-slate-200">{name}</span>
                              {vaultSecretNames.includes(name) ? (
                                <span className="text-emerald-400">resolves from the Secrets vault</span>
                              ) : (
                                <span className="text-amber-400">not in the vault — provide it below or add it on the Secrets tab</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {!isReadOnly && vaultSecretNames.length > 0 && (
                        <div className="flex items-center gap-2">
                          <input
                            list={`vault-secrets-${mcpServer.id}`}
                            value={vaultReferenceName}
                            onChange={(event) => setVaultReferenceName(event.target.value)}
                            placeholder="Reference a vault secret by name..."
                            className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900/70 border border-slate-700/50 font-mono text-xs text-slate-200"
                          />
                          <datalist id={`vault-secrets-${mcpServer.id}`}>
                            {vaultSecretNames.map((name) => <option key={name} value={name} />)}
                          </datalist>
                          <button
                            type="button"
                            onClick={insertVaultReference}
                            disabled={!vaultReferenceName.trim()}
                            className="px-3 py-1.5 rounded-lg text-xs bg-slate-700/60 text-slate-200 hover:bg-slate-600/60 disabled:opacity-40"
                          >
                            Insert reference
                          </button>
                        </div>
                      )}
                      <p className="mt-2 text-xs text-slate-500">
                        Auth secrets resolve by name: this server&apos;s own encrypted secrets first, then the playbook&apos;s Secrets vault. Store a value once on the Secrets tab and reference it here — no need to paste it again.
                      </p>
                    </div>
                  )}
                  {!isReadOnly && (
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-400 mb-2">
                        <Shield className="h-4 w-4" /> Encrypted secrets
                        {hasStoredSecrets && <span className="text-emerald-400 text-xs">stored</span>}
                      </label>
                      <textarea
                        value={secretsJson}
                        onChange={(event) => {
                          setSecretsJson(event.target.value);
                          setSecretsChanged(true);
                        }}
                        className={cn(
                          "w-full h-32 p-3 rounded-lg bg-slate-900/70 border font-mono text-sm text-slate-200",
                          jsonError ? "border-red-500/50" : "border-slate-700/50"
                        )}
                        placeholder={'{"token":"..."} or {"client_secret":"..."}'}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Values are encrypted with AES-GCM and are never returned by the API. Enter only values that should replace the stored secret set. Anything defined here overrides a vault secret of the same name; names not defined here fall back to the Secrets vault.
                      </p>
                    </div>
                  )}
                  {!isReadOnly && (
                    <div className="pt-1">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleTest}
                          disabled={testing || hasChanges}
                          title={hasChanges ? "Save first — the test uses the stored configuration" : undefined}
                          className="px-3 py-1.5 rounded-lg text-xs bg-slate-700/60 text-slate-200 hover:bg-slate-600/60 disabled:opacity-40"
                        >
                          {testing ? "Testing..." : "Test connection"}
                        </button>
                        {hasChanges && (
                          <span className="text-xs text-slate-500">Save first — the test uses the stored configuration.</span>
                        )}
                      </div>
                      {testResult?.ok === true && (
                        <p className="mt-2 text-xs text-emerald-400">
                          Reached the upstream: {testResult.tools.length} tool(s), {testResult.resources.length} resource(s).
                          {testResult.tools.length > 0 && <span className="text-slate-400"> {testResult.tools.slice(0, 8).join(", ")}{testResult.tools.length > 8 ? "…" : ""}</span>}
                        </p>
                      )}
                      {testResult?.ok === false && (
                        <p className="mt-2 text-xs text-amber-400">
                          {testResult.error}{testResult.code ? ` (${testResult.code})` : ""}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tools Section */}
              {activeSection === "tools" && (
                <div className="space-y-3">
                  {/* A federated server answers tools/list itself, so these lists
                      stay empty for one and that is correct — not a setup step
                      someone forgot. */}
                  <p className="text-xs text-slate-500">
                    This server is reached over {transportType === "openapi" ? "OpenAPI" : "MCP"}, so its
                    {" "}tools and resources are discovered from the upstream every time an agent lists
                    them — nothing needs to be entered here. Use <strong>Test connection</strong> on the
                    {" "}Connection tab to see what it offers. The lists below are only for tools this
                    {" "}playbook declares itself.
                  </p>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-400">
                      MCP Tools
                    </label>
                    <button
                      onClick={addTool}
                      className="px-3 py-1 text-sm text-pink-400 hover:text-pink-300 hover:bg-pink-500/10 rounded-lg flex items-center gap-1 transition-colors"
                      disabled={isReadOnly}
                    >
                      <Plus className="h-3 w-3" />
                      Add Tool
                    </button>
                  </div>

                  {tools.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 bg-slate-900/50 rounded-lg border border-dashed border-slate-700">
                      No tools defined. Click Add Tool to create one.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tools.map((tool, index) => (
                        <div
                          key={index}
                          className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                value={tool.name}
                                readOnly={isReadOnly}
                                onChange={(e) => {
                                  const currentTools = JSON.parse(toolsJson);
                                  currentTools[index].name = e.target.value.replace(/[^a-zA-Z0-9_]/g, '_');
                                  setToolsJson(JSON.stringify(currentTools, null, 2));
                                }}
                                className="text-pink-300 bg-slate-800 border border-slate-700 rounded px-2 py-1 font-mono text-sm w-full focus:outline-none focus:border-pink-500/50"
                                placeholder="tool_name"
                              />
                              <input
                                type="text"
                                value={tool.description || ""}
                                readOnly={isReadOnly}
                                onChange={(e) => {
                                  const currentTools = JSON.parse(toolsJson);
                                  currentTools[index].description = e.target.value;
                                  setToolsJson(JSON.stringify(currentTools, null, 2));
                                }}
                                className="text-sm text-slate-400 bg-slate-800/50 border border-slate-700/50 rounded px-2 py-1 w-full focus:outline-none focus:border-pink-500/50"
                                placeholder="Tool description..."
                              />
                            </div>
                            <button
                              onClick={() => removeTool(index)}
                              className="p-1 text-slate-500 hover:text-red-400 transition-colors shrink-0"
                              disabled={isReadOnly}
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      Tools JSON (Advanced)
                    </label>
                    <textarea
                      value={toolsJson}
                      readOnly={isReadOnly}
                      onChange={(e) => setToolsJson(e.target.value)}
                      className={cn(
                        "w-full h-48 p-3 rounded-lg",
                        "bg-slate-900/70 border",
                        jsonError ? "border-red-500/50" : "border-slate-700/50",
                        "text-slate-200 placeholder:text-slate-600",
                        "focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/20",
                        "font-mono text-sm resize-y"
                      )}
                    />
                  </div>
                </div>
              )}

              {/* Resources Section */}
              {activeSection === "resources" && (
                <div className="space-y-3">
                  {/* A federated server answers tools/list itself, so these lists
                      stay empty for one and that is correct — not a setup step
                      someone forgot. */}
                  <p className="text-xs text-slate-500">
                    This server is reached over {transportType === "openapi" ? "OpenAPI" : "MCP"}, so its
                    {" "}tools and resources are discovered from the upstream every time an agent lists
                    them — nothing needs to be entered here. Use <strong>Test connection</strong> on the
                    {" "}Connection tab to see what it offers. The lists below are only for tools this
                    {" "}playbook declares itself.
                  </p>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-400">
                      MCP Resources
                    </label>
                    <button
                      onClick={addResource}
                      className="px-3 py-1 text-sm text-pink-400 hover:text-pink-300 hover:bg-pink-500/10 rounded-lg flex items-center gap-1 transition-colors"
                      disabled={isReadOnly}
                    >
                      <Plus className="h-3 w-3" />
                      Add Resource
                    </button>
                  </div>

                  {resources.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 bg-slate-900/50 rounded-lg border border-dashed border-slate-700">
                      No resources defined. Click Add Resource to create one.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {resources.map((resource, index) => (
                        <div
                          key={index}
                          className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={resource.name}
                                  readOnly={isReadOnly}
                                  onChange={(e) => {
                                    const currentResources = JSON.parse(resourcesJson);
                                    currentResources[index].name = e.target.value;
                                    setResourcesJson(JSON.stringify(currentResources, null, 2));
                                  }}
                                  className="text-pink-300 bg-slate-800 border border-slate-700 rounded px-2 py-1 font-mono text-sm flex-1 focus:outline-none focus:border-pink-500/50"
                                  placeholder="resource_name"
                                />
                                <select
                                  value={resource.mimeType || "application/json"}
                                  onChange={(e) => {
                                    const currentResources = JSON.parse(resourcesJson);
                                    currentResources[index].mimeType = e.target.value;
                                    setResourcesJson(JSON.stringify(currentResources, null, 2));
                                  }}
                                  className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-400"
                                  disabled={isReadOnly}
                                >
                                  <option value="application/json">JSON</option>
                                  <option value="text/plain">Text</option>
                                  <option value="text/markdown">Markdown</option>
                                  <option value="application/xml">XML</option>
                                </select>
                              </div>
                              <input
                                type="text"
                                value={resource.uri}
                                readOnly={isReadOnly}
                                onChange={(e) => {
                                  const currentResources = JSON.parse(resourcesJson);
                                  currentResources[index].uri = e.target.value;
                                  setResourcesJson(JSON.stringify(currentResources, null, 2));
                                }}
                                className="text-sm text-slate-400 bg-slate-800/50 border border-slate-700/50 rounded px-2 py-1 font-mono w-full focus:outline-none focus:border-pink-500/50"
                                placeholder="file:///path/to/resource"
                              />
                            </div>
                            <button
                              onClick={() => removeResource(index)}
                              className="p-1 text-slate-500 hover:text-red-400 transition-colors shrink-0"
                              disabled={isReadOnly}
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      Resources JSON (Advanced)
                    </label>
                    <textarea
                      value={resourcesJson}
                      readOnly={isReadOnly}
                      onChange={(e) => setResourcesJson(e.target.value)}
                      className={cn(
                        "w-full h-48 p-3 rounded-lg",
                        "bg-slate-900/70 border",
                        jsonError ? "border-red-500/50" : "border-slate-700/50",
                        "text-slate-200 placeholder:text-slate-600",
                        "focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/20",
                        "font-mono text-sm resize-y"
                      )}
                    />
                  </div>
                </div>
              )}

              {jsonError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {jsonError}
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default McpServerEditor;
