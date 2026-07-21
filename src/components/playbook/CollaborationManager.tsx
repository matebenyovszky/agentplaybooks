"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, Trash2, UserRound } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

type CollaboratorRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  status: "active" | "pending" | "expired";
  invite_expires_at: string;
};

export function CollaborationManager({ playbookId }: { playbookId: string }) {
  const [rows, setRows] = useState<CollaboratorRow[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await authFetch(`/api/playbooks/${playbookId}/collaborators`);
    const data = await response.json().catch(() => null);
    if (response.ok && Array.isArray(data)) setRows(data as CollaboratorRow[]);
    else setError(typeof data?.error === "string" ? data.error : "Could not load collaborators");
    setLoading(false);
  }, [playbookId]);

  useEffect(() => { void load(); }, [load]);

  const createInvite = async () => {
    setCreating(true);
    setError(null);
    const response = await authFetch(`/api/playbooks/${playbookId}/collaborators`, { method: "POST" });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.invite_path) {
      setInviteUrl(`${window.location.origin}${data.invite_path}`);
      await load();
    } else {
      setError(typeof data?.error === "string" ? data.error : "Could not create invite");
    }
    setCreating(false);
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this collaborator or revoke this invite?")) return;
    const response = await authFetch(`/api/playbooks/${playbookId}/collaborators/${id}`, { method: "DELETE" });
    if (response.ok) setRows((current) => current.filter((row) => row.id !== id));
    else setError("Could not revoke access");
  };

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900/80 border border-neutral-200 dark:border-slate-700/50">
        <h3 className="font-semibold text-neutral-900 dark:text-white mb-2">Invite an editor</h3>
        <p className="text-sm text-neutral-600 dark:text-slate-400 mb-4">
          The link can be accepted once and expires after 72 hours. Editors can change playbook content, but cannot access secrets, API keys, visibility, sharing, or deletion.
        </p>
        <button
          onClick={createInvite}
          disabled={creating}
          className="px-4 py-2 bg-amber-500 text-slate-950 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Create invite link
        </button>

        {inviteUrl && (
          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">Copy now — this link will not be shown again.</p>
            <div className="flex gap-2">
              <input readOnly value={inviteUrl} className="flex-1 min-w-0 px-3 py-2 rounded bg-white dark:bg-slate-950 border border-neutral-200 dark:border-slate-700 text-sm font-mono" />
              <button onClick={copyInvite} className="px-3 py-2 rounded bg-slate-800 text-white" aria-label="Copy invite link">
                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>

      <div className="p-5 rounded-xl bg-white dark:bg-slate-900/80 border border-neutral-200 dark:border-slate-700/50">
        <h3 className="font-semibold text-neutral-900 dark:text-white mb-4">People and pending invites</h3>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-500">Only you have access.</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-slate-800">
            {rows.map((row) => (
              <div key={row.id} className="py-3 flex items-center gap-3">
                <UserRound className="h-5 w-5 text-blue-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {row.status === "active" ? row.display_name || `User ${row.user_id?.slice(0, 8)}` : "Invite link"}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {row.status === "active" ? "Editor" : `${row.status} · expires ${new Date(row.invite_expires_at).toLocaleString()}`}
                  </p>
                </div>
                <button onClick={() => remove(row.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded" aria-label="Remove access">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
