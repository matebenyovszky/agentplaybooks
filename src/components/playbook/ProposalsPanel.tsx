"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Inbox, Loader2, X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { cn } from "@/lib/utils";

type Proposal = {
  id: string;
  kind: "memory" | "skill";
  target: string;
  is_new: boolean;
  proposed: Record<string, unknown>;
  proposed_by: string | null;
  proposed_at: string;
};

type ProposalsPanelProps = {
  playbookGuid: string;
  kind: "memory" | "skill";
  // Called after an approval, so the tab can reload what changed.
  onApproved?: () => void;
};

const preview = (proposal: Proposal) => {
  if (proposal.kind === "skill") return String(proposal.proposed.content ?? "");
  const { value, ...rest } = proposal.proposed;
  return JSON.stringify(rest.description ? { description: rest.description, value } : value, null, 2);
};

// Changes proposed by keys with memory:propose or skills:propose. Nothing here
// has taken effect: approving applies it, rejecting discards it.
export function ProposalsPanel({ playbookGuid, kind, onApproved }: ProposalsPanelProps) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authFetch(`/api/playbooks/${playbookGuid}/proposals?kind=${kind}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (active) setProposals(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [playbookGuid, kind]);

  const review = async (proposal: Proposal, decision: "approve" | "reject") => {
    setBusy(proposal.id);
    setError(null);
    const res = await authFetch(`/api/playbooks/${playbookGuid}/proposals/${proposal.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: proposal.kind, decision }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Review failed");
      return;
    }
    setProposals((current) => current.filter((item) => item.id !== proposal.id));
    if (decision === "approve") onApproved?.();
  };

  if (proposals.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
        <Inbox className="h-4 w-4" />
        {proposals.length} {kind === "skill" ? "skill" : "memory"} proposal{proposals.length === 1 ? "" : "s"} waiting for review
      </h3>
      {error && <p className="mb-2 text-sm text-red-500">{error}</p>}
      <ul className="space-y-2">
        {proposals.map((proposal) => (
          <li key={proposal.id} className="rounded-lg border border-neutral-200 bg-white/60 dark:border-slate-700/50 dark:bg-slate-900/40">
            <div className="flex items-center gap-2 p-3">
              <button
                onClick={() => setOpen(open === proposal.id ? null : proposal.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {open === proposal.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <span className="truncate font-mono text-sm">{proposal.target}</span>
                <span className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-xs",
                  proposal.is_new ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-blue-500/15 text-blue-600 dark:text-blue-400",
                )}>
                  {proposal.is_new ? "new" : "change"}
                </span>
                <span className="truncate text-xs text-neutral-500 dark:text-slate-500">
                  {proposal.proposed_by ?? "unknown"} · {new Date(proposal.proposed_at).toLocaleString()}
                </span>
              </button>
              <button
                onClick={() => review(proposal, "approve")}
                disabled={busy !== null}
                className="flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50"
              >
                {busy === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Approve
              </button>
              <button
                onClick={() => review(proposal, "reject")}
                disabled={busy !== null}
                className="flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </button>
            </div>
            {open === proposal.id && (
              <div className="border-t border-neutral-200 p-3 dark:border-slate-700/50">
                {proposal.kind === "skill" && typeof proposal.proposed.description === "string" && (
                  <p className="mb-2 text-sm text-neutral-600 dark:text-slate-400">{proposal.proposed.description}</p>
                )}
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-3 text-xs dark:bg-slate-950/60">
                  {preview(proposal)}
                </pre>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
