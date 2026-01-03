"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { 
  Brain, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  Copy,
  Check,
  Sparkles,
  Edit3
} from "lucide-react";
import type { Persona } from "@/lib/supabase/types";

interface DemoPersonaEditorProps {
  persona: Persona;
  onUpdate: (persona: Persona) => void;
  onDelete: () => void;
}

export function DemoPersonaEditor({ persona, onUpdate, onDelete }: DemoPersonaEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(persona.name);
  const [systemPrompt, setSystemPrompt] = useState(persona.system_prompt);
  const [metadataJson, setMetadataJson] = useState(
    JSON.stringify(persona.metadata || {}, null, 2)
  );
  const [copied, setCopied] = useState(false);
  const [metadataError, setMetadataError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && expanded) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [systemPrompt, expanded]);

  const handleUpdate = () => {
    let metadata = persona.metadata;
    try {
      metadata = JSON.parse(metadataJson);
      setMetadataError("");
    } catch {
      setMetadataError("Invalid JSON");
      return;
    }
    
    onUpdate({
      ...persona,
      name,
      system_prompt: systemPrompt,
      metadata
    });
  };

  // Update on blur
  const handleBlur = () => {
    if (name !== persona.name || systemPrompt !== persona.system_prompt) {
      handleUpdate();
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(systemPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = () => {
    if (confirm(`Delete persona "${persona.name}"?`)) {
      onDelete();
    }
  };

  return (
    <motion.div
      layout
      className={cn(
        "rounded-xl border overflow-hidden transition-colors",
        "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
        "border-blue-900/30 hover:border-blue-700/50"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between p-4 cursor-pointer",
          "hover:bg-blue-900/10 transition-colors"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            "bg-gradient-to-br from-blue-500/20 to-blue-600/20"
          )}>
            <Brain className="h-5 w-5 text-blue-400" />
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
              placeholder="Persona name"
            />
            <p className="text-sm text-slate-500 truncate max-w-md">
              {systemPrompt.slice(0, 100)}...
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
            title="Copy prompt"
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
              {/* System Prompt */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-400 mb-2">
                  <Sparkles className="h-4 w-4" />
                  System Prompt
                </label>
                <textarea
                  ref={textareaRef}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  onBlur={handleBlur}
                  className={cn(
                    "w-full p-4 rounded-lg",
                    "bg-slate-900/70 border border-slate-700/50",
                    "text-slate-200 placeholder:text-slate-600",
                    "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20",
                    "font-mono text-sm leading-relaxed",
                    "resize-none min-h-[200px]"
                  )}
                  placeholder="Enter the system prompt for this persona..."
                />
              </div>

              {/* Metadata JSON */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-400 mb-2">
                  <Edit3 className="h-4 w-4" />
                  Metadata (JSON)
                </label>
                <textarea
                  value={metadataJson}
                  onChange={(e) => {
                    setMetadataJson(e.target.value);
                    try {
                      JSON.parse(e.target.value);
                      setMetadataError("");
                    } catch {
                      setMetadataError("Invalid JSON");
                    }
                  }}
                  onBlur={() => {
                    if (!metadataError) {
                      handleUpdate();
                    }
                  }}
                  className={cn(
                    "w-full p-3 rounded-lg font-mono text-sm",
                    "bg-slate-900/70 border",
                    metadataError 
                      ? "border-red-500/50 focus:border-red-500" 
                      : "border-slate-700/50 focus:border-blue-500/50",
                    "text-slate-300 placeholder:text-slate-600",
                    "focus:outline-none focus:ring-1",
                    metadataError ? "focus:ring-red-500/20" : "focus:ring-blue-500/20",
                    "resize-y min-h-[80px]"
                  )}
                  placeholder="{}"
                />
                {metadataError && (
                  <p className="text-red-400 text-sm mt-1">{metadataError}</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


