"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
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

interface SkillEditorProps {
  skill: Skill;
  onUpdate: (skill: Skill) => void;
  onDelete: () => void;
}

interface SchemaProperty {
  type: string;
  description?: string;
  optional?: boolean;
  default?: unknown;
  enum?: string[];
}

export function SkillEditor({ skill, onUpdate, onDelete }: SkillEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description || "");
  const [definitionJson, setDefinitionJson] = useState(
    JSON.stringify(skill.definition, null, 2)
  );
  const [examplesJson, setExamplesJson] = useState(
    JSON.stringify(skill.examples || [], null, 2)
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual");

  // Parse definition for visual editor
  const definition = skill.definition as { 
    parameters?: { 
      type?: string;
      properties?: Record<string, SchemaProperty>;
      required?: string[];
    } 
  };
  const properties = definition?.parameters?.properties || {};
  const requiredFields = definition?.parameters?.required || [];

  // Validate JSON on change
  useEffect(() => {
    try {
      JSON.parse(definitionJson);
      setJsonError(null);
    } catch (e) {
      setJsonError("Invalid JSON in definition");
    }
  }, [definitionJson]);

  // Track changes
  useEffect(() => {
    const changed = 
      name !== skill.name || 
      description !== (skill.description || "") ||
      definitionJson !== JSON.stringify(skill.definition, null, 2) ||
      examplesJson !== JSON.stringify(skill.examples || [], null, 2);
    setHasChanges(changed);
  }, [name, description, definitionJson, examplesJson, skill]);

  const handleSave = useCallback(async () => {
    if (jsonError) return;

    setSaving(true);
    try {
      const parsedDefinition = JSON.parse(definitionJson);
      const parsedExamples = JSON.parse(examplesJson);

      const supabase = createBrowserClient();
      const { error } = await supabase
        .from("skills")
        .update({ 
          name,
          description,
          definition: parsedDefinition,
          examples: parsedExamples
        })
        .eq("id", skill.id);

      if (!error) {
        onUpdate({ 
          ...skill, 
          name, 
          description,
          definition: parsedDefinition,
          examples: parsedExamples
        });
        setHasChanges(false);
      }
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setSaving(false);
    }
  }, [name, description, definitionJson, examplesJson, skill, jsonError, onUpdate]);

  // Debounced auto-save
  useEffect(() => {
    if (!hasChanges || jsonError) return;
    
    const timer = setTimeout(() => {
      handleSave();
    }, 2000);

    return () => clearTimeout(timer);
  }, [hasChanges, jsonError, handleSave]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(definitionJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [definitionJson]);

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this skill?")) {
      onDelete();
    }
  };

  // Add a new property to schema with auto-generated name
  const addProperty = () => {
    const currentDef = JSON.parse(definitionJson);
    if (!currentDef.parameters) {
      currentDef.parameters = { type: "object", properties: {} };
    }
    if (!currentDef.parameters.properties) {
      currentDef.parameters.properties = {};
    }
    
    // Generate unique property name
    let propNum = 1;
    let propName = `param_${propNum}`;
    while (currentDef.parameters.properties[propName]) {
      propNum++;
      propName = `param_${propNum}`;
    }
    
    currentDef.parameters.properties[propName] = {
      type: "string",
      description: ""
    };

    setDefinitionJson(JSON.stringify(currentDef, null, 2));
  };

  // Remove a property from schema
  const removeProperty = (propName: string) => {
    const currentDef = JSON.parse(definitionJson);
    delete currentDef.parameters?.properties?.[propName];
    
    // Also remove from required if present
    if (currentDef.parameters?.required) {
      currentDef.parameters.required = currentDef.parameters.required.filter(
        (r: string) => r !== propName
      );
    }
    
    setDefinitionJson(JSON.stringify(currentDef, null, 2));
  };

  // Update a property in schema
  const updateProperty = (propName: string, field: string, value: string | boolean) => {
    const currentDef = JSON.parse(definitionJson);
    if (currentDef.parameters?.properties?.[propName]) {
      if (field === "required") {
        if (!currentDef.parameters.required) {
          currentDef.parameters.required = [];
        }
        if (value) {
          if (!currentDef.parameters.required.includes(propName)) {
            currentDef.parameters.required.push(propName);
          }
        } else {
          currentDef.parameters.required = currentDef.parameters.required.filter(
            (r: string) => r !== propName
          );
        }
      } else {
        currentDef.parameters.properties[propName][field] = value;
      }
    }
    setDefinitionJson(JSON.stringify(currentDef, null, 2));
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
        "border-purple-900/30 hover:border-purple-700/50",
        expanded && "ring-2 ring-purple-500/20"
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
            "bg-gradient-to-br from-purple-600/20 to-pink-600/20",
            "border border-purple-500/20"
          )}>
            <Zap className="h-5 w-5 text-purple-400" />
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
                "hover:bg-slate-800/50 focus:bg-slate-800/70 rounded px-2 py-1 -ml-2",
                "font-mono"
              )}
              placeholder="skill_name"
            />
            <p className="text-sm text-slate-500 truncate px-2">
              {Object.keys(properties).length} parameters
              {hasChanges && <span className="ml-2 text-amber-400">• unsaved</span>}
              {saving && <span className="ml-2 text-purple-400">• saving...</span>}
              {jsonError && <span className="ml-2 text-red-400">• {jsonError}</span>}
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
            title="Copy JSON schema"
          >
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Delete skill"
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
                  Description (used by AI to decide when to use this skill)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={cn(
                    "w-full h-20 p-3 rounded-lg",
                    "bg-slate-900/70 border border-slate-700/50",
                    "text-slate-200 placeholder:text-slate-600",
                    "focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20",
                    "text-sm resize-y"
                  )}
                  placeholder="Describe what this skill does and when it should be used..."
                />
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-2 border-b border-slate-700/50 pb-2">
                <button
                  onClick={() => setViewMode("visual")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors",
                    viewMode === "visual" 
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" 
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Code2 className="h-4 w-4" />
                  Visual Editor
                </button>
                <button
                  onClick={() => setViewMode("json")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors",
                    viewMode === "json" 
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" 
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <FileJson className="h-4 w-4" />
                  JSON Schema
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
                      onClick={addProperty}
                      className="px-3 py-1 text-sm text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Add Parameter
                    </button>
                  </div>
                  
                  {Object.entries(properties).length === 0 ? (
                    <div className="p-6 text-center text-slate-500 bg-slate-900/50 rounded-lg border border-dashed border-slate-700">
                      No parameters defined. Click "Add Parameter" to add one.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(properties).map(([propName, prop]) => (
                        <div 
                          key={propName}
                          className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">Name</label>
                                <input
                                  type="text"
                                  value={propName}
                                  onChange={(e) => {
                                    const newName = e.target.value.replace(/[^a-zA-Z0-9_]/g, '_');
                                    if (newName && newName !== propName) {
                                      const currentDef = JSON.parse(definitionJson);
                                      if (!currentDef.parameters.properties[newName]) {
                                        // Rename property
                                        currentDef.parameters.properties[newName] = currentDef.parameters.properties[propName];
                                        delete currentDef.parameters.properties[propName];
                                        // Update required array if present
                                        if (currentDef.parameters.required) {
                                          currentDef.parameters.required = currentDef.parameters.required.map(
                                            (r: string) => r === propName ? newName : r
                                          );
                                        }
                                        setDefinitionJson(JSON.stringify(currentDef, null, 2));
                                      }
                                    }
                                  }}
                                  className="text-sm text-purple-300 bg-slate-800 border border-slate-700 rounded px-2 py-1 font-mono w-full focus:outline-none focus:border-purple-500/50"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">Type</label>
                                <select
                                  value={prop.type || "string"}
                                  onChange={(e) => updateProperty(propName, "type", e.target.value)}
                                  className="w-full p-1.5 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200"
                                >
                                  <option value="string">string</option>
                                  <option value="number">number</option>
                                  <option value="integer">integer</option>
                                  <option value="boolean">boolean</option>
                                  <option value="array">array</option>
                                  <option value="object">object</option>
                                </select>
                              </div>
                              <div className="col-span-2">
                                <label className="text-xs text-slate-500 mb-1 block">Description</label>
                                <input
                                  type="text"
                                  value={prop.description || ""}
                                  onChange={(e) => updateProperty(propName, "description", e.target.value)}
                                  className="w-full p-1.5 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200"
                                  placeholder="What this parameter is for..."
                                />
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <label className="flex items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={requiredFields.includes(propName)}
                                  onChange={(e) => updateProperty(propName, "required", e.target.checked)}
                                  className="rounded border-slate-600"
                                />
                                <span className="text-slate-400">Required</span>
                              </label>
                              <button
                                onClick={() => removeProperty(propName)}
                                className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* JSON Editor */}
              {viewMode === "json" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      Definition (JSON Schema)
                    </label>
                    <textarea
                      value={definitionJson}
                      onChange={(e) => setDefinitionJson(e.target.value)}
                      className={cn(
                        "w-full h-64 p-3 rounded-lg",
                        "bg-slate-900/70 border",
                        jsonError ? "border-red-500/50" : "border-slate-700/50",
                        "text-slate-200 placeholder:text-slate-600",
                        "focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20",
                        "font-mono text-sm resize-y"
                      )}
                    />
                    {jsonError && (
                      <div className="flex items-center gap-2 mt-2 text-red-400 text-sm">
                        <AlertCircle className="h-4 w-4" />
                        {jsonError}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      Examples (JSON array)
                    </label>
                    <textarea
                      value={examplesJson}
                      onChange={(e) => setExamplesJson(e.target.value)}
                      className={cn(
                        "w-full h-32 p-3 rounded-lg",
                        "bg-slate-900/70 border border-slate-700/50",
                        "text-slate-200 placeholder:text-slate-600",
                        "focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20",
                        "font-mono text-sm resize-y"
                      )}
                      placeholder='[{"input": {...}, "output": "..."}]'
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default SkillEditor;


