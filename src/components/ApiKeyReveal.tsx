"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiKeyRevealProps {
  value: string;
  className?: string;
  codeClassName?: string;
}

/**
 * Displays a newly issued key with explicit reveal and copy controls.
 * The server only returns plaintext during creation/rotation; this component
 * never implies that an old hashed key can be recovered later.
 */
export function ApiKeyReveal({ value, className, codeClassName }: ApiKeyRevealProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <code className={cn("min-w-0 flex-1 break-all font-mono", codeClassName)}>
        {visible ? value : "•".repeat(Math.min(value.length, 32))}
      </code>
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="shrink-0 rounded p-2 transition-colors hover:bg-black/10 dark:hover:bg-white/10"
        aria-label={visible ? "Hide API key" : "Show API key"}
        title={visible ? "Hide API key" : "Show API key"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 rounded p-2 transition-colors hover:bg-black/10 dark:hover:bg-white/10"
        aria-label="Copy API key"
        title="Copy API key"
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
