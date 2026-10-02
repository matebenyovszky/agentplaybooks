"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Brain, Check, Loader2, X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

type ProposalRow = {
  id: string;
  kind: "skill" | "memory";
  target: string;
  payload: Record<string, unknown>;
  rationale: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_via: string;
  submitter_key_prefix: string | null;
  review_note: string | null;
  created_at: string;
};

type ProposalDetail = ProposalRow & { current: Record<string, unknown> | null };

const STATUSES = ["pending", "approved", "rejected"] as const;

function proposedText(proposal: ProposalRow): string {
  if (proposal.kind === "skill") {
    const { description, content } = proposal.payload as { description?: string; content?: string };
    return `${description ?? ""}\n\n${content ?? ""}`.trim();
  }
  const { value, summary } = proposal.payload as { value?: unknown; summary?: string };
  return [summary, JSON.stringify(value, null, 2)].filter(Boolean).join("\n\n");
}

function currentText(proposal: ProposalDetail): string | null {
  if (!proposal.current) return null;
  if (proposal.kind === "skill") {
    const { description, content } = proposal.current as { description?: string; content?: string };
    return `${description ?? ""}\n\n${content ?? ""}`.trim();
  }
  const { value, summary } = proposal.current as { value?: unknown; summary?: string };
  return [summary, JSON.stringify(value, null, 2)].filter(Boolean).join("\n\n");
}

/**
 * Review queue for a playbook: skill changes and memory entries that others
 * (people or agents holding a proposer key) suggested. Approving writes them
 * to the playbook; the previous version stays in the skill or memory history.
 */
export function ProposalsManager({ playbookId }: { playbookId: string }) {
  const [status, setStatus] = useState<typeof STATUSES[number]>("pending");
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [selected, setSelected] = useState<ProposalDetail | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await authFetch(`/api/playbooks/${playbookId}/proposals?status=${status}`);
    const data = await response.json().catch(() => null);
    if (response.ok && Array.isArray(data)) {
      setRows(data as ProposalRow[]);
      setError(null);
    } else {
      setError(typeof data?.error === "string" ? data.error : "Could not load proposals");
    }
    setLoading(false);
  }, [playbookId, status]);

  useEffect(() => { void load(); }, [load]);

  const open = async (id: string) => {
    setNote("");
    const response = await authFetch(`/api/playbooks/${playbookId}/proposals/${id}`);
    const data = await response.json().catch(() => null);
    if (response.ok && data?.id) setSelected(data as ProposalDetail);
    else setError(typeof data?.error === "string" ? data.error : "Could not load the proposal");
  };

  const decide = async (decision: "approve" | "reject") => {
    if (!selected) return;
    setDeciding(true);
    const response = await authFetch(`/api/playbooks/${playbookId}/proposals/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: note.trim() || null }),
    });
    const data = await response.json().catch(() => null);
    setDeciding(false);
    if (!response.ok) {
      setError(typeof data?.error === "string" ? data.error : "Could not save the decision");
      return;
    }
    setSelected(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900/80 border border-neutral-200 dark:border-slate-700/50">
        <h3 className="font-semibold text-neutral-900 dark:text-white mb-2">Proposals</h3>
        <p className="text-sm text-neutral-600 dark:text-slate-400 mb-4">
          Skill changes and memories suggested by people or agents with a Proposer key. Nothing is
          written to this playbook until you approve it; the previous version stays in its history.
        </p>
        <div className="flex gap-2 mb-4">
          {STATUSES.map((value) => (
            <button
              key={value}
              onClick={() => { setStatus(value); setSelected(null); }}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize ${status === value
                ? "bg-amber-500 text-slate-950 font-medium"
                : "bg-neutral-100 dark:bg-slate-800 text-neutral-700 dark:text-slate-300"}`}
            >
              {value}
            </button>
          ))}
        </div>
        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-500">No {status} proposals.</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-slate-800">
            {rows.map((row) => (
              <button key={row.id} onClick={() => open(row.id)} className="w-full py-3 flex items-center gap-3 text-left">
                {row.kind === "skill"
                  ? <BookOpen className="h-5 w-5 text-blue-500" />
                  : <Brain className="h-5 w-5 text-purple-500" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{row.kind === "skill" ? "Skill" : "Memory"}: {row.target}</p>
                  <p className="text-xs text-neutral-500 truncate">
                    {new Date(row.created_at).toLocaleString()} · {row.submitter_key_prefix ?? row.submitted_via}
                    {row.rationale ? ` · ${row.rationale}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900/80 border border-neutral-200 dark:border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-neutral-900 dark:text-white">
              {selected.kind === "skill" ? "Skill" : "Memory"}: {selected.target}
            </h3>
            <button onClick={() => setSelected(null)} className="p-1 text-neutral-500" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          {selected.rationale && <p className="text-sm text-neutral-600 dark:text-slate-400 mb-3">{selected.rationale}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1">Current</p>
              <pre className="text-xs whitespace-pre-wrap p-3 rounded bg-neutral-50 dark:bg-slate-950 border border-neutral-200 dark:border-slate-800 max-h-96 overflow-auto">
                {currentText(selected) ?? "(new — nothing to replace)"}
              </pre>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1">Proposed</p>
              <pre className="text-xs whitespace-pre-wrap p-3 rounded bg-amber-500/5 border border-amber-500/30 max-h-96 overflow-auto">
                {proposedText(selected)}
              </pre>
            </div>
          </div>
          {selected.status === "pending" ? (
            <div className="mt-4 space-y-3">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Note to the proposer (optional)"
                className="w-full px-3 py-2 rounded bg-white dark:bg-slate-950 border border-neutral-200 dark:border-slate-700 text-sm"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => decide("approve")}
                  disabled={deciding}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {deciding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
                </button>
                <button
                  onClick={() => decide("reject")}
                  disabled={deciding}
                  className="px-4 py-2 bg-neutral-200 dark:bg-slate-800 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  <X className="h-4 w-4" /> Reject
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">
              {selected.status === "approved" ? "Approved" : "Rejected"}
              {selected.review_note ? `: ${selected.review_note}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
