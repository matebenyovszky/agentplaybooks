"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  FileJson,
  FileCode,
  File,
  Upload,
  X,
  Loader2,
  FileText,
  ExternalLink
} from "lucide-react";
import type { Skill, SkillAttachment, AttachmentFileType } from "@/lib/supabase/types";
import { FILE_EXTENSION_MAP, ALLOWED_FILE_TYPES, ATTACHMENT_LIMITS } from "@/lib/supabase/types";
import type { StorageAdapter } from "@/lib/storage";

interface SkillEditorProps {
  skill: Skill;
  storage: StorageAdapter;
  onUpdate: (skill: Skill) => void;
  onDelete: () => void;
  readOnly?: boolean;
}

interface SchemaProperty {
  type: string;
  description?: string;
  optional?: boolean;
  default?: unknown;
  enum?: string[];
}

export function SkillEditor({ skill, storage, onUpdate, onDelete, readOnly = false }: SkillEditorProps) {
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
  const [content, setContent] = useState(skill.content || "");
  
  // Determine if this is a markdown-based skill (Anthropic style) or JSON schema skill
  const isMarkdownSkill = useMemo(() => {
    return !!(skill.content && skill.content.length > 0);
  }, [skill.content]);
  
  const [viewMode, setViewMode] = useState<"markdown" | "visual" | "json">(
    isMarkdownSkill ? "markdown" : "visual"
  );
  
  // Attachments state
  const [attachments, setAttachments] = useState<SkillAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [showAddAttachment, setShowAddAttachment] = useState(false);
  const [newAttachment, setNewAttachment] = useState({
    filename: "",
    content: "",
    description: "",
    file_type: "text" as AttachmentFileType
  });
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [expandedAttachment, setExpandedAttachment] = useState<string | null>(null);

  // Parse definition for visual editor
  const definition = skill.definition as { 
    parameters?: { 
      type?: string;
      properties?: Record<string, SchemaProperty>;
      required?: string[];
    } 
  };
  const sourceUrl = (skill.definition as { source_url?: string } | null)?.source_url;
  const properties = definition?.parameters?.properties || {};
  const requiredFields = definition?.parameters?.required || [];

  const loadAttachments = useCallback(async () => {
    setAttachmentsLoading(true);
    try {
      const response = await fetch(`/api/manage/skills/${skill.id}/attachments`);
      if (response.ok) {
        const data = await response.json();
        setAttachments(data);
      }
    } catch (e) {
      console.error("Failed to load attachments:", e);
    } finally {
      setAttachmentsLoading(false);
    }
  }, [skill.id]);

  // Load attachments when expanded
  useEffect(() => {
    if (!expanded || attachments.length > 0 || attachmentsLoading) return;
    loadAttachments();
  }, [expanded, attachments.length, attachmentsLoading, loadAttachments]);

  const handleAddAttachment = async () => {
    if (!newAttachment.filename || !newAttachment.content) {
      setAttachmentError("Filename and content are required");
      return;
    }

    // Validate size
    const sizeBytes = new TextEncoder().encode(newAttachment.content).length;
    if (sizeBytes > ATTACHMENT_LIMITS.MAX_FILE_SIZE) {
      setAttachmentError(`File too large (${Math.round(sizeBytes / 1024)}KB, max ${Math.round(ATTACHMENT_LIMITS.MAX_FILE_SIZE / 1024)}KB)`);
      return;
    }

    setUploadingAttachment(true);
    setAttachmentError(null);

    try {
      const response = await fetch(`/api/manage/skills/${skill.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAttachment)
      });

      if (response.ok) {
        const data = await response.json();
        setAttachments([...attachments, data]);
        setNewAttachment({ filename: "", content: "", description: "", file_type: "text" });
        setShowAddAttachment(false);
      } else {
        const error = await response.json();
        setAttachmentError(error.error || "Failed to add attachment");
      }
    } catch {
      setAttachmentError("Failed to add attachment");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm("Delete this attachment?")) return;

    try {
      const response = await fetch(`/api/manage/skills/${skill.id}/attachments/${attachmentId}`, {
        method: "DELETE"
      });

      if (response.ok) {
        setAttachments(attachments.filter(a => a.id !== attachmentId));
      }
    } catch (error) {
      console.error("Failed to delete attachment:", error);
    }
  };

  // Detect file type from extension
  const detectFileType = (filename: string): AttachmentFileType => {
    const ext = filename.includes(".") ? "." + filename.split(".").pop()?.toLowerCase() : null;
    return (ext && FILE_EXTENSION_MAP[ext]) || "text";
  };

  // Get icon for file type
  const getFileIcon = (fileType: AttachmentFileType) => {
    if (["typescript", "javascript", "python", "go", "rust"].includes(fileType)) {
      return <FileCode className="h-4 w-4" />;
    }
    return <File className="h-4 w-4" />;
  };

  // Validate JSON on change
  useEffect(() => {
    try {
      JSON.parse(definitionJson);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON in definition");
    }
  }, [definitionJson]);

  // Track changes
  useEffect(() => {
    const changed = 
      name !== skill.name || 
      description !== (skill.description || "") ||
      content !== (skill.content || "") ||
      definitionJson !== JSON.stringify(skill.definition, null, 2) ||
      examplesJson !== JSON.stringify(skill.examples || [], null, 2);
    setHasChanges(changed);
  }, [name, description, content, definitionJson, examplesJson, skill]);

  const handleSave = useCallback(async () => {
    if (jsonError) return;

    setSaving(true);
    try {
      const parsedDefinition = JSON.parse(definitionJson);
      const parsedExamples = JSON.parse(examplesJson);

      const updated = await storage.updateSkill(skill.id, {
        name,
        description,
        content: content || null,
        definition: parsedDefinition,
        examples: parsedExamples
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
  }, [name, description, content, definitionJson, examplesJson, skill.id, jsonError, onUpdate, storage]);

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
            isMarkdownSkill 
              ? "bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-emerald-500/20"
              : "bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-purple-500/20"
          )}>
            {isMarkdownSkill ? (
              <FileText className="h-5 w-5 text-emerald-400" />
            ) : (
              <Zap className="h-5 w-5 text-purple-400" />
            )}
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
              {isMarkdownSkill ? (
                <>
                  <span className="text-emerald-400">Anthropic Skill</span>
                  <span className="mx-1">•</span>
                  {Math.round((content?.length || 0) / 4)} tokens
                  <span className="mx-1">•</span>
                  {attachments.length} files
                </>
              ) : (
                <>{Object.keys(properties).length} parameters</>
              )}
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
                {isMarkdownSkill && (
                  <button
                    onClick={() => setViewMode("markdown")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors",
                      viewMode === "markdown" 
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <FileText className="h-4 w-4" />
                    Skill Content
                  </button>
                )}
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
                  Parameters
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
                  JSON
                </button>
              </div>

              {/* Markdown Content View (for Anthropic-style skills) */}
              {viewMode === "markdown" && isMarkdownSkill && (
                <div className="space-y-4">
                  {/* Source info */}
                  {sourceUrl && (
                    <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-900/50 px-3 py-2 rounded-lg">
                      <ExternalLink className="h-4 w-4" />
                      <span>Source:</span>
                      <a 
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:text-purple-300 underline"
                      >
                        {sourceUrl}
                      </a>
                    </div>
                  )}
                  
                  {/* Markdown content */}
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      SKILL.md Content
                    </label>
                    <div className={cn(
                      "rounded-lg border overflow-hidden",
                      "bg-slate-950/80 border-slate-700/50"
                    )}>
                      {/* Simple markdown renderer - headers, code blocks, lists */}
                      <div className="p-4 prose prose-invert prose-sm max-w-none overflow-auto max-h-[600px]">
                        <pre className="whitespace-pre-wrap text-sm text-slate-300 font-mono leading-relaxed">
                          {content}
                        </pre>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {content.length.toLocaleString()} characters • {Math.round(content.length / 4)} tokens (approx)
                    </p>
                  </div>

                  {/* Edit content (only if not read-only) */}
                  {!readOnly && (
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">
                        Edit Content (Markdown)
                      </label>
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className={cn(
                          "w-full h-80 p-4 rounded-lg",
                          "bg-slate-900/70 border border-slate-700/50",
                          "text-slate-200 placeholder:text-slate-600",
                          "focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20",
                          "font-mono text-sm resize-y"
                        )}
                        placeholder="# Skill Name&#10;&#10;Instructions for Claude..."
                      />
                    </div>
                  )}
                </div>
              )}

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
                      No parameters defined. Click &quot;Add Parameter&quot; to add one.
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
                      onChange={(e) => !readOnly && setDefinitionJson(e.target.value)}
                      readOnly={readOnly}
                      className={cn(
                        "w-full h-64 p-3 rounded-lg",
                        "bg-slate-900/70 border",
                        jsonError ? "border-red-500/50" : "border-slate-700/50",
                        "text-slate-200 placeholder:text-slate-600",
                        "focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20",
                        "font-mono text-sm resize-y",
                        readOnly && "cursor-default"
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
                      onChange={(e) => !readOnly && setExamplesJson(e.target.value)}
                      readOnly={readOnly}
                      className={cn(
                        "w-full h-32 p-3 rounded-lg",
                        "bg-slate-900/70 border border-slate-700/50",
                        "text-slate-200 placeholder:text-slate-600",
                        "focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20",
                        "font-mono text-sm resize-y",
                        readOnly && "cursor-default"
                      )}
                      placeholder='[{"input": {...}, "output": "..."}]'
                    />
                  </div>
                </div>
              )}

              {/* Attachments Section */}
              <div className="border-t border-slate-700/50 pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    <FileCode className="h-4 w-4" />
                    Sample Files ({attachments.length}/{ATTACHMENT_LIMITS.MAX_FILES_PER_SKILL})
                  </label>
                  {!readOnly && attachments.length < ATTACHMENT_LIMITS.MAX_FILES_PER_SKILL && (
                    <button
                      onClick={() => setShowAddAttachment(!showAddAttachment)}
                      className="px-3 py-1 text-sm text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      {showAddAttachment ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      {showAddAttachment ? "Cancel" : "Add File"}
                    </button>
                  )}
                </div>

                {/* Add Attachment Form */}
                {showAddAttachment && !readOnly && (
                  <div className="p-4 bg-slate-900/70 rounded-lg border border-purple-500/30 mb-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Filename</label>
                        <input
                          type="text"
                          value={newAttachment.filename}
                          onChange={(e) => {
                            const filename = e.target.value;
                            setNewAttachment({
                              ...newAttachment,
                              filename,
                              file_type: detectFileType(filename)
                            });
                          }}
                          className="w-full p-2 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200 font-mono"
                          placeholder="example.ts"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Type</label>
                        <select
                          value={newAttachment.file_type}
                          onChange={(e) => setNewAttachment({
                            ...newAttachment,
                            file_type: e.target.value as AttachmentFileType
                          })}
                          className="w-full p-2 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200"
                        >
                          {ALLOWED_FILE_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Description (optional)</label>
                      <input
                        type="text"
                        value={newAttachment.description}
                        onChange={(e) => setNewAttachment({ ...newAttachment, description: e.target.value })}
                        className="w-full p-2 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200"
                        placeholder="What this file demonstrates..."
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">
                        Content (max {Math.round(ATTACHMENT_LIMITS.MAX_FILE_SIZE / 1024)}KB)
                      </label>
                      <textarea
                        value={newAttachment.content}
                        onChange={(e) => setNewAttachment({ ...newAttachment, content: e.target.value })}
                        className="w-full h-48 p-3 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200 font-mono resize-y"
                        placeholder="Paste your code or content here..."
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        {new TextEncoder().encode(newAttachment.content).length} bytes
                      </p>
                    </div>
                    {attachmentError && (
                      <div className="flex items-center gap-2 text-red-400 text-sm">
                        <AlertCircle className="h-4 w-4" />
                        {attachmentError}
                      </div>
                    )}
                    <button
                      onClick={handleAddAttachment}
                      disabled={uploadingAttachment || !newAttachment.filename || !newAttachment.content}
                      className={cn(
                        "w-full py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors",
                        newAttachment.filename && newAttachment.content
                          ? "bg-purple-600 hover:bg-purple-500 text-white"
                          : "bg-slate-800 text-slate-500 cursor-not-allowed"
                      )}
                    >
                      {uploadingAttachment ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Add Attachment
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Loading state */}
                {attachmentsLoading && (
                  <div className="flex items-center justify-center py-6 text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading attachments...
                  </div>
                )}

                {/* Attachments list */}
                {!attachmentsLoading && attachments.length === 0 && !showAddAttachment && (
                  <div className="text-center py-6 text-slate-500 text-sm bg-slate-900/30 rounded-lg border border-dashed border-slate-700">
                    No sample files attached.
                    {!readOnly && " Click \"Add File\" to add code examples."}
                  </div>
                )}

                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="bg-slate-900/50 rounded-lg border border-slate-700/50 overflow-hidden"
                      >
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
                          onClick={() => setExpandedAttachment(
                            expandedAttachment === attachment.id ? null : attachment.id
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-purple-400">
                              {getFileIcon(attachment.file_type)}
                            </div>
                            <div>
                              <p className="text-sm font-mono text-slate-200">{attachment.filename}</p>
                              <p className="text-xs text-slate-500">
                                {attachment.file_type} • {Math.round(attachment.size_bytes / 1024 * 10) / 10}KB
                                {attachment.description && ` • ${attachment.description}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {!readOnly && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteAttachment(attachment.id);
                                }}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                            {expandedAttachment === attachment.id ? (
                              <ChevronUp className="h-4 w-4 text-slate-500" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            )}
                          </div>
                        </div>
                        
                        {/* Expanded content */}
                        {expandedAttachment === attachment.id && (
                          <div className="border-t border-slate-700/50">
                            <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-64 overflow-y-auto bg-slate-950/50">
                              {attachment.content}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default SkillEditor;


