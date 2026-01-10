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
  AlertCircle,
  FileCode,
  File,
  Upload,
  X,
  Loader2,
  FileText
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

export function SkillEditor({ skill, storage, onUpdate, onDelete, readOnly = false }: SkillEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description || "");
  const [licence, setLicence] = useState(skill.licence || "");
  const [content, setContent] = useState(skill.content || "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Determine if this is a content-based skill
  const hasContent = useMemo(() => {
    return !!(skill.content && skill.content.length > 0);
  }, [skill.content]);

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

  // Track changes
  useEffect(() => {
    const changed =
      name !== skill.name ||
      description !== (skill.description || "") ||
      content !== (skill.content || "") ||
      licence !== (skill.licence || "");
    setHasChanges(changed);
  }, [name, description, content, licence, skill]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await storage.updateSkill(skill.id, {
        name,
        description,
        content: content || null,
        licence: licence || null
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
  }, [name, description, content, licence, skill.id, onUpdate, storage]);

  // Debounced auto-save
  useEffect(() => {
    if (!hasChanges) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 2000);

    return () => clearTimeout(timer);
  }, [hasChanges, handleSave]);

  const copyToClipboard = useCallback(() => {
    const skillData = JSON.stringify({ name, description, licence, content }, null, 2);
    navigator.clipboard.writeText(skillData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [name, description, licence, content]);

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this skill?")) {
      onDelete();
    }
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
            hasContent
              ? "bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-emerald-500/20"
              : "bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-purple-500/20"
          )}>
            {hasContent ? (
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
              disabled={readOnly}
              className={cn(
                "text-lg font-semibold bg-transparent border-none focus:outline-none",
                "w-full text-slate-100 placeholder:text-slate-500",
                "hover:bg-slate-800/50 focus:bg-slate-800/70 rounded px-2 py-1 -ml-2",
                "font-mono",
                readOnly && "cursor-default"
              )}
              placeholder="skill_name"
            />
            <p className="text-sm text-slate-500 truncate px-2">
              {hasContent ? (
                <>
                  <span className="text-emerald-400">Content Skill</span>
                  <span className="mx-1">•</span>
                  {Math.round((content?.length || 0) / 4)} tokens
                  <span className="mx-1">•</span>
                  {attachments.length} files
                </>
              ) : (
                <>{attachments.length} files attached</>
              )}
              {hasChanges && <span className="ml-2 text-amber-400">• unsaved</span>}
              {saving && <span className="ml-2 text-purple-400">• saving...</span>}
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
            title="Copy skill data"
          >
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          </button>

          {!readOnly && (
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
          )}

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
                  disabled={readOnly}
                  className={cn(
                    "w-full h-20 p-3 rounded-lg",
                    "bg-slate-900/70 border border-slate-700/50",
                    "text-slate-200 placeholder:text-slate-600",
                    "focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20",
                    "text-sm resize-y",
                    readOnly && "cursor-default"
                  )}
                  placeholder="Describe what this skill does..."
                />
              </div>

              {/* Licence */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Licence
                </label>
                <input
                  type="text"
                  value={licence}
                  onChange={(e) => setLicence(e.target.value)}
                  disabled={readOnly}
                  className={cn(
                    "w-full p-3 rounded-lg",
                    "bg-slate-900/70 border border-slate-700/50",
                    "text-slate-200 placeholder:text-slate-600",
                    "focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20",
                    "text-sm",
                    readOnly && "cursor-default"
                  )}
                  placeholder="e.g., MIT, Apache 2.0, CC BY 4.0..."
                />
              </div>

              {/* Skill Content */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Skill Content (Markdown)
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={readOnly}
                  className={cn(
                    "w-full h-64 p-4 rounded-lg",
                    "bg-slate-900/70 border border-slate-700/50",
                    "text-slate-200 placeholder:text-slate-600",
                    "focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20",
                    "font-mono text-sm resize-y",
                    readOnly && "cursor-default"
                  )}
                  placeholder="# Skill Name&#10;&#10;Instructions and content for the skill..."
                />
                <p className="text-xs text-slate-500 mt-2">
                  {content.length.toLocaleString()} characters • ~{Math.round(content.length / 4)} tokens
                </p>
              </div>

              {/* Attachments Section */}
              <div className="border-t border-slate-700/50 pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    <FileCode className="h-4 w-4" />
                    Related Files ({attachments.length}/{ATTACHMENT_LIMITS.MAX_FILES_PER_SKILL})
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
                        <label className="text-xs text-slate-500 mb-1 block">Path / Filename</label>
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
                          placeholder="src/utils/helper.ts"
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
                          Add File
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Loading state */}
                {attachmentsLoading && (
                  <div className="flex items-center justify-center py-6 text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading files...
                  </div>
                )}

                {/* Attachments list */}
                {!attachmentsLoading && attachments.length === 0 && !showAddAttachment && (
                  <div className="text-center py-6 text-slate-500 text-sm bg-slate-900/30 rounded-lg border border-dashed border-slate-700">
                    No files attached.
                    {!readOnly && " Click \"Add File\" to add related files."}
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
