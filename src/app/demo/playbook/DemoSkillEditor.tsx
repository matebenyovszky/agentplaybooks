"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { 
  Zap,
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Plus,
  Minus,
  AlertCircle,
  Code2,
  FileJson
} from "lucide-react";
import type { Skill } from "@/lib/supabase/types";

interface DemoSkillEditorProps {
  skill: Skill;
  onUpdate: (skill: Skill) => void;
  onDelete: () => void;
}

interface Parameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export function DemoSkillEditor({ skill, onUpdate, onDelete }: DemoSkillEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description || "");
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual");
  const [jsonSchema, setJsonSchema] = useState(
    JSON.stringify(skill.definition || {}, null, 2)
  );
  const [jsonError, setJsonError] = useState("");
  const [copied, setCopied] = useState(false);

  // Parse parameters from definition
  const parseParameters = (): Parameter[] => {
    const def = skill.definition;
    if (!def?.parameters?.properties) return [];
    
    const required = def.parameters.required || [];
    return Object.entries(def.parameters.properties as Record<string, { type?: string; description?: string }>).map(([key, value]) => ({
      name: key,
      type: value.type || "string",
      description: value.description || "",
      required: required.includes(key)
    }));
  };

  const [parameters, setParameters] = useState<Parameter[]>(parseParameters);

  const handleUpdate = () => {
    let definition = skill.definition;
    
    if (viewMode === "json") {
      try {
        definition = JSON.parse(jsonSchema);
        setJsonError("");
      } catch {
        setJsonError("Invalid JSON");
        return;
      }
    } else {
      // Build from visual editor
      const properties: Record<string, { type: string; description: string }> = {};
      const required: string[] = [];
      
      parameters.forEach(param => {
        properties[param.name] = {
          type: param.type,
          description: param.description
        };
        if (param.required) {
          required.push(param.name);
        }
      });
      
      definition = {
        parameters: {
          type: "object",
          properties,
          required
        }
      };
    }
    
    onUpdate({
      ...skill,
      name,
      description,
      definition
    });
  };

  const addParameter = () => {
    const newParam: Parameter = {
      name: `param_${parameters.length + 1}`,
      type: "string",
      description: "",
      required: false
    };
    setParameters([...parameters, newParam]);
  };

  const removeParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const updateParameter = (index: number, field: keyof Parameter, value: string | boolean) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], [field]: value };
    setParameters(updated);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(skill.definition, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = () => {
    if (confirm(`Delete skill "${skill.name}"?`)) {
      onDelete();
    }
  };

  // Update on blur
  const handleBlur = () => {
    handleUpdate();
  };

  return (
    <motion.div
      layout
      className={cn(
        "rounded-xl border overflow-hidden transition-colors",
        "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
        "border-purple-900/30 hover:border-purple-700/50"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between p-4 cursor-pointer",
          "hover:bg-purple-900/10 transition-colors"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            "bg-gradient-to-br from-purple-500/20 to-purple-600/20"
          )}>
            <Zap className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleBlur}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "font-mono text-lg font-semibold bg-transparent border-none focus:outline-none",
                "text-white placeholder:text-slate-500",
                "hover:bg-slate-800/50 focus:bg-slate-800/70 rounded px-2 py-0.5 -ml-2"
              )}
              placeholder="skill_name"
            />
            <p className="text-sm text-slate-500 truncate max-w-md">
              {description || "No description"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {parameters.length} params
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard();
            }}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            title="Copy schema"
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
                    "focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20"
                  )}
                  placeholder="What does this skill do?"
                />
              </div>

              {/* View Mode Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (viewMode === "json") {
                      try {
                        const parsed = JSON.parse(jsonSchema);
                        onUpdate({ ...skill, definition: parsed });
                        setParameters(parseParameters());
                      } catch {}
                    }
                    setViewMode("visual");
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2",
                    viewMode === "visual"
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  <Code2 className="h-4 w-4" />
                  Visual
                </button>
                <button
                  onClick={() => {
                    handleUpdate();
                    setJsonSchema(JSON.stringify(skill.definition, null, 2));
                    setViewMode("json");
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2",
                    viewMode === "json"
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  <FileJson className="h-4 w-4" />
                  JSON
                </button>
              </div>

              {/* Visual Editor */}
              {viewMode === "visual" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-400">
                      Parameters
                    </label>
                    <button
                      onClick={addParameter}
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium flex items-center gap-1",
                        "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                      )}
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                  </div>
                  
                  {parameters.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No parameters defined</p>
                  ) : (
                    <div className="space-y-2">
                      {parameters.map((param, index) => (
                        <div key={index} className="flex gap-2 items-start">
                          <input
                            type="text"
                            value={param.name}
                            onChange={(e) => updateParameter(index, "name", e.target.value)}
                            onBlur={handleBlur}
                            className={cn(
                              "flex-1 p-2 rounded bg-slate-900/70 border border-slate-700/50",
                              "text-sm font-mono text-slate-200",
                              "focus:outline-none focus:border-purple-500/50"
                            )}
                            placeholder="param_name"
                          />
                          <select
                            value={param.type}
                            onChange={(e) => updateParameter(index, "type", e.target.value)}
                            onBlur={handleBlur}
                            className={cn(
                              "w-24 p-2 rounded bg-slate-900/70 border border-slate-700/50",
                              "text-sm text-slate-200",
                              "focus:outline-none focus:border-purple-500/50"
                            )}
                          >
                            <option value="string">string</option>
                            <option value="number">number</option>
                            <option value="integer">integer</option>
                            <option value="boolean">boolean</option>
                            <option value="array">array</option>
                            <option value="object">object</option>
                          </select>
                          <button
                            onClick={() => updateParameter(index, "required", !param.required)}
                            className={cn(
                              "px-2 py-2 rounded text-xs",
                              param.required
                                ? "bg-red-500/20 text-red-400"
                                : "bg-slate-800 text-slate-500"
                            )}
                            title={param.required ? "Required" : "Optional"}
                          >
                            REQ
                          </button>
                          <button
                            onClick={() => removeParameter(index)}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* JSON Editor */}
              {viewMode === "json" && (
                <div>
                  <textarea
                    value={jsonSchema}
                    onChange={(e) => {
                      setJsonSchema(e.target.value);
                      try {
                        JSON.parse(e.target.value);
                        setJsonError("");
                      } catch {
                        setJsonError("Invalid JSON");
                      }
                    }}
                    onBlur={handleBlur}
                    className={cn(
                      "w-full p-4 rounded-lg font-mono text-sm",
                      "bg-slate-900/70 border",
                      jsonError 
                        ? "border-red-500/50 focus:border-red-500" 
                        : "border-slate-700/50 focus:border-purple-500/50",
                      "text-slate-300 placeholder:text-slate-600",
                      "focus:outline-none focus:ring-1",
                      jsonError ? "focus:ring-red-500/20" : "focus:ring-purple-500/20",
                      "resize-y min-h-[200px]"
                    )}
                    placeholder="{}"
                  />
                  {jsonError && (
                    <p className="flex items-center gap-1 text-red-400 text-sm mt-1">
                      <AlertCircle className="h-4 w-4" />
                      {jsonError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


