"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { 
  Brain, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  Copy,
  Check,
  Sparkles
} from "lucide-react";
import type { Persona } from "@/lib/supabase/types";
import type { StorageAdapter } from "@/lib/storage";

interface PersonaEditorProps {
  persona: Persona;
  storage: StorageAdapter;
  onUpdate: (persona: Persona) => void;
  onDelete: () => void;
  readOnly?: boolean;
}

// Debounce hook for auto-save
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function PersonaEditor({ persona, storage, onUpdate, onDelete, readOnly = false }: PersonaEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(persona.name);
  const [systemPrompt, setSystemPrompt] = useState(persona.system_prompt);
  const [metadata, setMetadata] = useState(JSON.stringify(persona.metadata || {}, null, 2));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track changes
  useEffect(() => {
    const changed = 
      name !== persona.name || 
      systemPrompt !== persona.system_prompt ||
      metadata !== JSON.stringify(persona.metadata || {}, null, 2);
    setHasChanges(changed);
  }, [name, systemPrompt, metadata, persona]);

  // Debounced save
  const debouncedPrompt = useDebounce(systemPrompt, 1500);
  const debouncedName = useDebounce(name, 1500);
  const debouncedMetadata = useDebounce(metadata, 1500);

  // Auto-save on debounced change
  useEffect(() => {
    if (!hasChanges) return;
    
    const save = async () => {
      setSaving(true);
      try {
        let parsedMetadata = persona.metadata;
        try {
          parsedMetadata = JSON.parse(metadata);
        } catch {
          // Keep existing metadata if JSON is invalid
        }

        const updated = await storage.updatePersona(persona.id, {
          name: debouncedName,
          system_prompt: debouncedPrompt,
          metadata: parsedMetadata
        });

        if (updated) {
          onUpdate(updated);
          setHasChanges(false);
        }
      } finally {
        setSaving(false);
      }
    };

    save();
  }, [debouncedPrompt, debouncedName, debouncedMetadata, hasChanges, metadata, onUpdate, persona.id, persona.metadata, storage]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && expanded) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [systemPrompt, expanded]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(systemPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [systemPrompt]);

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this persona?")) {
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
        "border-blue-900/30 hover:border-blue-700/50",
        expanded && "ring-2 ring-blue-500/20"
      )}
    >
      {/* Header - Always visible */}
      <div 
        className="flex items-center gap-4 p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className={cn(
            "p-2 rounded-lg",
            "bg-gradient-to-br from-blue-600/20 to-indigo-600/20",
            "border border-blue-500/20"
          )}>
            <Brain className="h-5 w-5 text-blue-400" />
          </div>
          
          <div className="flex-1 min-w-0">
            {readOnly ? (
              <h3 className="text-lg font-semibold text-slate-100 px-2 py-1 -ml-2">{name}</h3>
            ) : (
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
                placeholder="Persona Name"
              />
            )}
            <p className="text-sm text-slate-500 truncate px-2">
              {systemPrompt.length} characters
              {!readOnly && hasChanges && <span className="ml-2 text-amber-400">• unsaved</span>}
              {!readOnly && saving && <span className="ml-2 text-blue-400">• saving...</span>}
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
            title="Copy system prompt"
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
              title="Delete persona"
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
              {/* System Prompt */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  System Prompt
                </label>
                <textarea
                  ref={textareaRef}
                  value={systemPrompt}
                  onChange={(e) => !readOnly && setSystemPrompt(e.target.value)}
                  readOnly={readOnly}
                  className={cn(
                    "w-full min-h-[200px] p-4 rounded-lg",
                    "bg-slate-900/70 border border-slate-700/50",
                    "text-slate-200 placeholder:text-slate-600",
                    "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20",
                    "font-mono text-sm leading-relaxed resize-y",
                    readOnly && "cursor-default"
                  )}
                  placeholder="You are a helpful assistant..."
                />
              </div>

              {/* Metadata (JSON) */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Metadata (JSON)
                </label>
                <textarea
                  value={metadata}
                  onChange={(e) => !readOnly && setMetadata(e.target.value)}
                  readOnly={readOnly}
                  className={cn(
                    "w-full h-24 p-4 rounded-lg",
                    "bg-slate-900/70 border border-slate-700/50",
                    "text-slate-200 placeholder:text-slate-600",
                    "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20",
                    "font-mono text-sm resize-y",
                    readOnly && "cursor-default"
                  )}
                  placeholder='{"key": "value"}'
                />
              </div>

              {/* Tips - only show when editable */}
              {!readOnly && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                  <Sparkles className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-200/70">
                    Changes are automatically saved. Use clear, specific instructions for best AI behavior.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default PersonaEditor;
