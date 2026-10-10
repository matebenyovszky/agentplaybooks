"use client";

/**
 * What the `demonstrations:` block in a skill's frontmatter actually resolved
 * to.
 *
 * The block is edited as YAML in the content box, which means the failure mode
 * is silent: a mistyped provider or a segment written the wrong way round is
 * simply skipped by every reader, and the author has no way to tell until a
 * push is rejected. This panel runs the same parser the server runs, so what it
 * shows is what the playbook will publish — including the errors.
 */

import { useMemo } from "react";
import { AlertTriangle, ExternalLink, Film, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  readSkillDemonstrations,
  resolveDemonstration,
  type DemonstrationRole,
} from "@/lib/demonstrations";

const ROLE_STYLES: Record<DemonstrationRole, { label: string; className: string }> = {
  demonstration: {
    label: "Demonstration",
    className: "bg-purple-500/10 text-purple-600 dark:text-purple-300",
  },
  reference: {
    label: "Reference",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  },
  warning: {
    label: "What not to do",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
};

const PROVIDER_LABELS: Record<string, string> = {
  youtube: "YouTube",
  hf_dataset: "Hugging Face",
  url: "Recording",
};

export function DemonstrationPreview({ content }: { content: string }) {
  const { demonstrations, errors } = useMemo(
    () => readSkillDemonstrations(content),
    [content],
  );

  const resolved = useMemo(() => demonstrations.map(resolveDemonstration), [demonstrations]);

  if (resolved.length === 0 && errors.length === 0) return null;

  return (
    <div className="border-t border-neutral-200 dark:border-slate-700/50 pt-4 mt-4">
      <label className="text-sm font-medium text-neutral-600 dark:text-slate-400 flex items-center gap-2 mb-3">
        <Film className="h-4 w-4" />
        Demonstrations ({resolved.length})
      </label>

      {resolved.length > 1 && (
        <p className="text-xs text-neutral-500 dark:text-slate-500 mb-3">
          Performed in this order.
        </p>
      )}

      <div className="space-y-2">
        {resolved.map((demonstration, index) => (
          <div
            key={`${demonstration.provider}-${demonstration.ref}-${index}`}
            className="rounded-lg border border-neutral-200 dark:border-slate-700/50 bg-neutral-50 dark:bg-slate-900/70 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium",
                      ROLE_STYLES[demonstration.role].className,
                    )}
                  >
                    {ROLE_STYLES[demonstration.role].label}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-slate-500">
                    {PROVIDER_LABELS[demonstration.provider] ?? demonstration.provider}
                    {" · "}
                    {demonstration.fidelity}
                  </span>
                </div>
                <p className="text-sm text-neutral-900 dark:text-slate-200 mt-1 truncate">
                  {demonstration.title ?? demonstration.ref}
                </p>
              </div>
              <a
                href={demonstration.url}
                target="_blank"
                rel="noreferrer noopener"
                className="shrink-0 text-purple-500 hover:text-purple-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-purple-500/40 rounded"
                aria-label={`Open ${demonstration.title ?? demonstration.ref}`}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            {demonstration.role === "warning" && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 mt-2">
                <OctagonAlert className="h-3 w-3 shrink-0" />
                Records a failure mode. An agent is told not to reproduce it.
              </p>
            )}

            {demonstration.segments.length > 0 && (
              <ul className="mt-2 space-y-1">
                {demonstration.segments.map((segment, segmentIndex) => (
                  // Two segments may legitimately start at the same second, so
                  // the start time alone is not a unique key.
                  <li key={`${segment.start}-${segmentIndex}`} className="text-xs flex gap-2">
                    <a
                      href={segment.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-mono text-purple-500 hover:text-purple-400 shrink-0"
                    >
                      {segment.timestamp}
                    </a>
                    <span className="text-neutral-700 dark:text-slate-300 min-w-0">
                      {segment.label && <span className="font-medium">{segment.label}</span>}
                      {segment.label && segment.comment && " — "}
                      {segment.comment}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {errors.length === 1
              ? "One entry will not publish:"
              : `${errors.length} entries will not publish:`}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {errors.map((error) => (
              <li key={error} className="text-xs font-mono text-amber-700 dark:text-amber-300/90">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
