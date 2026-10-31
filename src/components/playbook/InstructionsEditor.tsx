"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  ScrollText,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Sparkles,
  AlertCircle
} from "lucide-react";
import type { StorageAdapter } from "@/lib/storage";

interface InstructionsEditorProps {
  instructions: string | null;
  storage: StorageAdapter;
  onUpdate: (instructions: string) => void;
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

export function InstructionsEditor({ instructions, storage, onUpdate, readOnly = false }: InstructionsEditorProps) {
  const t = useTranslations();
  const savedValue = instructions || "";

  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState(savedValue);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const hasChanges = !readOnly && content !== savedValue;

  // Debounced save
  const debouncedContent = useDebounce(content, 1500);

  // Auto-save on debounced change
  useEffect(() => {
    if (readOnly) return;
    if (debouncedContent === savedValue) return;

    const save = async () => {
      setSaving(true);
      try {
        const updated = await storage.updatePlaybook({ instructions: debouncedContent });

        if (updated) {
          setError(false);
          onUpdate(updated.instructions || "");
        } else {
          setError(true);
          console.error("Failed to save playbook instructions");
        }
      } finally {
        setSaving(false);
      }
    };

    save();
  }, [debouncedContent, savedValue, onUpdate, readOnly, storage]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "relative group rounded-xl border transition-all duration-200",
        "bg-white dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-800/80",
        "border-neutral-200 dark:border-blue-900/30 hover:border-blue-500 dark:hover:border-blue-700/50",
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
            <ScrollText className="h-5 w-5 text-blue-400" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-slate-100 px-2 py-1 -ml-2">
              {t("editor.instructions.title")}
            </h3>
            <p className="text-sm text-neutral-500 dark:text-slate-500 truncate px-2">
              {t("editor.instructions.characterCount", { count: content.length })}
              {hasChanges && <span className="ml-2 text-amber-400">• {t("editor.instructions.unsaved")}</span>}
              {!readOnly && saving && <span className="ml-2 text-blue-400">• {t("editor.instructions.saving")}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard();
            }}
            className="p-2 text-neutral-500 dark:text-slate-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
            title={t("editor.instructions.copy")}
          >
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          </button>

          <div className="text-neutral-500 dark:text-slate-500">
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
              {/* Instructions (markdown) */}
              <div>
                <label className="block text-sm font-medium text-neutral-600 dark:text-slate-400 mb-2">
                  {t("editor.instructions.label")}
                </label>
                <textarea
                  value={content}
                  onChange={(e) => !readOnly && setContent(e.target.value)}
                  readOnly={readOnly}
                  className={cn(
                    "w-full min-h-[320px] p-4 rounded-lg",
                    "bg-neutral-50 dark:bg-slate-900/70 border border-neutral-200 dark:border-slate-700/50",
                    "text-neutral-900 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-600",
                    "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20",
                    "font-mono text-sm leading-relaxed resize-y",
                    readOnly && "cursor-default"
                  )}
                  placeholder={t("editor.instructions.placeholder")}
                />
              </div>

              {/* Save error */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                  <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {t("editor.instructions.saveError")}
                  </p>
                </div>
              )}

              {/* Tips - only show when editable */}
              {!readOnly && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                  <Sparkles className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-200/70">
                    {t("editor.instructions.tip")}
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

export default InstructionsEditor;
