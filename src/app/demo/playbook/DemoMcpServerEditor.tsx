"use client";

import { useState } from "react";
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
  Wrench,
  FolderOpen,
  ExternalLink
} from "lucide-react";
import type { MCPServer } from "@/lib/supabase/types";

interface DemoMcpServerEditorProps {
  mcpServer: MCPServer;
  onUpdate: (mcpServer: MCPServer) => void;
  onDelete: () => void;
}

interface Tool {
  name: string;
  description?: string;
}

interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export function DemoMcpServerEditor({ mcpServer, onUpdate, onDelete }: DemoMcpServerEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(mcpServer.name);
  const [description, setDescription] = useState(mcpServer.description || "");
  const [activeSubTab, setActiveSubTab] = useState<"tools" | "resources">("tools");
  const [tools, setTools] = useState<Tool[]>(mcpServer.tools || []);
  const [resources, setResources] = useState<Resource[]>(mcpServer.resources || []);
  const [copied, setCopied] = useState(false);

  const handleUpdate = () => {
    onUpdate({
      ...mcpServer,
      name,
      description,
      tools,
      resources
    });
  };

  const handleBlur = () => {
    handleUpdate();
  };

  const addTool = () => {
    setTools([...tools, { name: "new_tool", description: "" }]);
  };

  const removeTool = (index: number) => {
    setTools(tools.filter((_, i) => i !== index));
  };

  const updateTool = (index: number, field: keyof Tool, value: string) => {
    const updated = [...tools];
    updated[index] = { ...updated[index], [field]: value };
    setTools(updated);
  };

  const addResource = () => {
    setResources([...resources, { uri: "", name: "New Resource", description: "" }]);
  };

  const removeResource = (index: number) => {
    setResources(resources.filter((_, i) => i !== index));
  };

  const updateResource = (index: number, field: keyof Resource, value: string) => {
    const updated = [...resources];
    updated[index] = { ...updated[index], [field]: value };
    setResources(updated);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify({ tools, resources }, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = () => {
    if (confirm(`Delete MCP server "${mcpServer.name}"?`)) {
      onDelete();
    }
  };

  return (
    <motion.div
      layout
      className={cn(
        "rounded-xl border overflow-hidden transition-colors",
        "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
        "border-pink-900/30 hover:border-pink-700/50"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between p-4 cursor-pointer",
          "hover:bg-pink-900/10 transition-colors"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            "bg-gradient-to-br from-pink-500/20 to-pink-600/20"
          )}>
            <Server className="h-5 w-5 text-pink-400" />
          </div>
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleBlur}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "text-lg font-semibold bg-transparent border-none focus:outline-none",
                "text-white placeholder:text-slate-500",
                "hover:bg-slate-800/50 focus:bg-slate-800/70 rounded px-2 py-0.5 -ml-2"
              )}
              placeholder="Server name"
            />
            <p className="text-sm text-slate-500">
              {tools.length} tools, {resources.length} resources
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard();
            }}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            title="Copy config"
          >
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <div className="p-2 text-slate-500">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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
            className="border-t border-slate-700/50"
          >
            <div className="p-4 space-y-4">
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={handleBlur}
                  className={cn(
                    "w-full p-3 rounded-lg",
                    "bg-slate-900/70 border border-slate-700/50",
                    "text-slate-200 placeholder:text-slate-600",
                    "focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/20"
                  )}
                  placeholder="Describe this MCP server..."
                />
              </div>

              {/* Sub-tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveSubTab("tools")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2",
                    activeSubTab === "tools"
                      ? "bg-pink-500/20 text-pink-400 border border-pink-500/30"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  <Wrench className="h-4 w-4" />
                  Tools ({tools.length})
                </button>
                <button
                  onClick={() => setActiveSubTab("resources")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2",
                    activeSubTab === "resources"
                      ? "bg-pink-500/20 text-pink-400 border border-pink-500/30"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  <FolderOpen className="h-4 w-4" />
                  Resources ({resources.length})
                </button>
              </div>

              {/* Tools */}
              {activeSubTab === "tools" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Define MCP tools</span>
                    <button
                      onClick={addTool}
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium flex items-center gap-1",
                        "bg-pink-500/20 text-pink-400 hover:bg-pink-500/30"
                      )}
                    >
                      <Plus className="h-3 w-3" />
                      Add Tool
                    </button>
                  </div>
                  
                  {tools.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No tools defined</p>
                  ) : (
                    <div className="space-y-2">
                      {tools.map((tool, index) => (
                        <div key={index} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
                          <div className="flex gap-2 items-start mb-2">
                            <input
                              type="text"
                              value={tool.name}
                              onChange={(e) => updateTool(index, "name", e.target.value)}
                              onBlur={handleBlur}
                              className={cn(
                                "flex-1 p-2 rounded bg-slate-900/70 border border-slate-700/50",
                                "text-sm font-mono text-slate-200",
                                "focus:outline-none focus:border-pink-500/50"
                              )}
                              placeholder="tool_name"
                            />
                            <button
                              onClick={() => removeTool(index)}
                              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                          </div>
                          <input
                            type="text"
                            value={tool.description || ""}
                            onChange={(e) => updateTool(index, "description", e.target.value)}
                            onBlur={handleBlur}
                            className={cn(
                              "w-full p-2 rounded bg-slate-900/70 border border-slate-700/50",
                              "text-sm text-slate-400",
                              "focus:outline-none focus:border-pink-500/50"
                            )}
                            placeholder="Tool description..."
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Resources */}
              {activeSubTab === "resources" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Define MCP resources</span>
                    <button
                      onClick={addResource}
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium flex items-center gap-1",
                        "bg-pink-500/20 text-pink-400 hover:bg-pink-500/30"
                      )}
                    >
                      <Plus className="h-3 w-3" />
                      Add Resource
                    </button>
                  </div>
                  
                  {resources.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No resources defined</p>
                  ) : (
                    <div className="space-y-2">
                      {resources.map((resource, index) => (
                        <div key={index} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
                          <div className="flex gap-2 items-start mb-2">
                            <input
                              type="text"
                              value={resource.name}
                              onChange={(e) => updateResource(index, "name", e.target.value)}
                              onBlur={handleBlur}
                              className={cn(
                                "flex-1 p-2 rounded bg-slate-900/70 border border-slate-700/50",
                                "text-sm text-slate-200",
                                "focus:outline-none focus:border-pink-500/50"
                              )}
                              placeholder="Resource name"
                            />
                            <button
                              onClick={() => removeResource(index)}
                              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                          </div>
                          <input
                            type="text"
                            value={resource.uri}
                            onChange={(e) => updateResource(index, "uri", e.target.value)}
                            onBlur={handleBlur}
                            className={cn(
                              "w-full p-2 rounded bg-slate-900/70 border border-slate-700/50",
                              "text-sm font-mono text-slate-400 mb-2",
                              "focus:outline-none focus:border-pink-500/50"
                            )}
                            placeholder="resource://uri"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* MCP Docs link */}
              <a
                href="https://modelcontextprotocol.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-pink-400 hover:text-pink-300 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Learn more about MCP
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

