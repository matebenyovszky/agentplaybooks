"use client";

import { useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatGPTIcon, ClaudeIcon, MarkdownIcon } from "@/components/ui/ai-icons";

type OpenInDropdownProps = {
  buildPrompt: () => string;
  markdownPath?: string;
  buttonLabel?: string;
  small?: boolean;
  className?: string;
  disabled?: boolean;
};

export function OpenInDropdown({
  buildPrompt,
  markdownPath,
  buttonLabel = "Open in",
  small,
  className,
  disabled,
}: OpenInDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleOpenIn = (platform: "claude" | "chatgpt") => {
    const content = buildPrompt();
    if (!content) return;
    const encoded = encodeURIComponent(content);
    const url =
      platform === "claude"
        ? `https://claude.ai/new?q=${encoded}`
        : `https://chatgpt.com/?q=${encoded}`;
    openExternal(url);
    setIsOpen(false);
  };

  const handleViewMarkdown = () => {
    if (!markdownPath) return;
    const url = markdownPath.startsWith("http")
      ? markdownPath
      : `${window.location.origin}${markdownPath}`;
    openExternal(url);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget)) {
            setIsOpen(false);
          }
        }}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-900/70 text-slate-200 transition-colors hover:bg-slate-800/70",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          small ? "p-2" : "px-3 py-2 text-sm",
        )}
      >
        <ExternalLink className={small ? "h-4 w-4" : "h-4 w-4"} />
        {!small && <span className="font-medium">{buttonLabel}</span>}
      </button>

      {isOpen && !disabled && (
        <div className="absolute bottom-full right-0 mb-2 w-64 rounded-md border border-slate-700/60 bg-slate-900 text-slate-100 shadow-xl z-50">
          {markdownPath && (
            <button
              type="button"
              onClick={handleViewMarkdown}
              className="w-full flex flex-col items-start px-3 py-3 hover:bg-slate-800/70 transition-colors border-b border-slate-700/50"
            >
              <div className="flex items-center gap-2">
                <MarkdownIcon className="h-4 w-4" />
                <span className="text-sm font-medium">View as Markdown</span>
              </div>
              <span className="text-xs text-slate-400">Open playbook markdown in a new tab</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handleOpenIn("claude")}
            className="w-full flex flex-col items-start px-3 py-3 hover:bg-slate-800/70 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ClaudeIcon className="h-4 w-4" />
              <span className="text-sm font-medium">Open in Claude</span>
            </div>
            <span className="text-xs text-slate-400">Start a new chat with this playbook</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenIn("chatgpt")}
            className="w-full flex flex-col items-start px-3 py-3 hover:bg-slate-800/70 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChatGPTIcon className="h-4 w-4" />
              <span className="text-sm font-medium">Open in ChatGPT</span>
            </div>
            <span className="text-xs text-slate-400">Start a new chat with this playbook</span>
          </button>
        </div>
      )}
    </div>
  );
}
