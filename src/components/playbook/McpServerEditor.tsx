"use client";

import { useState, useEffect, useCallback } from "react";
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
  ExternalLink
} from "lucide-react";
import type { MCPServer } from "@/lib/supabase/types";
import type { StorageAdapter } from "@/lib/storage";

interface McpServerEditorProps {
  mcpServer: MCPServer;
  storage: StorageAdapter;
  onUpdate: (mcpServer: MCPServer) => void;
  onDelete: () => void;
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

export function McpServerEditor({ mcpServer, storage, onUpdate, onDelete }: McpServerEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(mcpServer.name);
  const [description, setDescription] = useState(mcpServer.description || "");
  const [toolsJson, setToolsJson] = useState(
    JSON.stringify(mcpServer.tools || [], null, 2)
  );
  const [resourcesJson, setResourcesJson] = useState(
    JSON.stringify(mcpServer.resources || [], null, 2)
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"tools" | "resources">("tools");

  // Parse tools and resources
  const tools: Tool[] = Array.isArray(mcpServer.tools) ? mcpServer.tools as Tool[] : [];
  const resources: Resource[] = Array.isArray(mcpServer.resources) ? mcpServer.resources as Resource[] : [];

  // Validate JSON
  useEffect(() => {
    try {
      JSON.parse(toolsJson);
      JSON.parse(resourcesJson);
      setJsonError(null);
    } catch (e) {
      setJsonError("Invalid JSON");
    }
  }, [toolsJson, resourcesJson]);

  // Track changes
  useEffect(() => {
    const changed = 
      name !== mcpServer.name || 
      description !== (mcpServer.description || "") ||
      toolsJson !== JSON.stringify(mcpServer.tools || [], null, 2) ||
      resourcesJson !== JSON.stringify(mcpServer.resources || [], null, 2);
    setHasChanges(changed);
  }, [name, description, toolsJson, resourcesJson, mcpServer]);

  const handleSave = useCallback(async () => {
    if (jsonError) return;

    setSaving(true);
    try {
      const parsedTools = JSON.parse(toolsJson);
      const parsedResources = JSON.parse(resourcesJson);

      const updated = await storage.updateMcpServer(mcpServer.id, {
        name,
        description,
        tools: parsedTools,
        resources: parsedResources
      });

      if (updated) {
        onUpdate(updated);
        setHasChanges(false);
      }
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setSaving(false);
    }
  }, [name, description, toolsJson, resourcesJson, mcpServer.id, jsonError, onUpdate, storage]);

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
        "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
        "border-pink-900/30 hover:border-pink-700/50",
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
              onChange={(e) => {
                e.stopPropagation();
                setName(e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "text-lg font-semibold bg-transparent border-none focus:outline-none",
                "w-full text-slate-100 placeholder:text-slate-500",
                "hover:bg-slate-800/50 focus:bg-slate-800/70 rounded px-2 py-1 -ml-2"
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
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            title="Copy MCP manifest"
          >
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Delete MCP server"
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
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={cn(
                    "w-full h-16 p-3 rounded-lg",
                    "bg-slate-900/70 border border-slate-700/50",
                    "text-slate-200 placeholder:text-slate-600",
                    "focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/20",
                    "text-sm resize-y"
                  )}
                  placeholder="Describe this MCP server..."
                />
              </div>

              {/* Section Toggle */}
              <div className="flex items-center gap-2 border-b border-slate-700/50 pb-2">
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

              {/* Tools Section */}
              {activeSection === "tools" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-400">
                      MCP Tools
                    </label>
                    <button
                      onClick={addTool}
                      className="px-3 py-1 text-sm text-pink-400 hover:text-pink-300 hover:bg-pink-500/10 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Add Tool
                    </button>
                  </div>

                  {tools.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 bg-slate-900/50 rounded-lg border border-dashed border-slate-700">
                      No tools defined. Click "Add Tool" to create one.
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
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-400">
                      MCP Resources
                    </label>
                    <button
                      onClick={addResource}
                      className="px-3 py-1 text-sm text-pink-400 hover:text-pink-300 hover:bg-pink-500/10 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Add Resource
                    </button>
                  </div>

                  {resources.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 bg-slate-900/50 rounded-lg border border-dashed border-slate-700">
                      No resources defined. Click "Add Resource" to create one.
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

              {/* MCP Info */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-pink-500/5 border border-pink-500/10">
                <ExternalLink className="h-4 w-4 text-pink-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-pink-200/70">
                  Learn more about MCP at{" "}
                  <a 
                    href="https://modelcontextprotocol.io/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-pink-400 hover:underline"
                  >
                    modelcontextprotocol.io
                  </a>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default McpServerEditor;


