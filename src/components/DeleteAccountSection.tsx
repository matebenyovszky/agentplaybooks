"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Self-service account deletion.
 *
 * Kept deliberately slow to reach: the section starts collapsed, says exactly
 * what goes and what stays, and the button stays disabled until the account's
 * email is typed. The server checks that email again — the button state is a
 * convenience, not the safeguard (see DELETE /api/user/account).
 */
export function DeleteAccountSection({ email }: { email: string | undefined }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = Boolean(email) && typed.trim().toLowerCase() === email?.trim().toLowerCase();

  const handleDelete = async () => {
    if (!matches) return;
    setDeleting(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/user/account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ confirm_email: typed }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "The account could not be deleted. Nothing was removed.");
        setDeleting(false);
        return;
      }
      // The account no longer exists, so the stored session is dead weight.
      await supabase.auth.signOut().catch(() => undefined);
      router.replace("/");
    } catch {
      setError("The account could not be deleted. Nothing was removed.");
      setDeleting(false);
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-red-950/10 p-6">
      <h2 className="text-xl font-semibold flex items-center gap-2 text-neutral-900 dark:text-white">
        <AlertTriangle className="h-5 w-5 text-red-500" />
        Delete account
      </h2>

      {!open ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-600 dark:text-slate-400">
            Permanently delete your account and everything it owns. This cannot be undone.
          </p>
          <button
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors"
          >
            Delete account…
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-4 text-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-medium text-neutral-800 dark:text-slate-200 mb-1">Deleted immediately</p>
              <ul className="list-disc list-inside space-y-0.5 text-neutral-600 dark:text-slate-400">
                <li>every playbook you own, with its skills, memory and history, canvas, runs, connected servers, keys, and secrets</li>
                <li>your portable backups</li>
                <li>your user API keys, and every sign-in your connected apps (Claude, Cursor…) hold</li>
                <li>your profile, stars, and memberships in other people&apos;s playbooks</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-neutral-800 dark:text-slate-200 mb-1">Not affected</p>
              <ul className="list-disc list-inside space-y-0.5 text-neutral-600 dark:text-slate-400">
                <li>playbooks other people own, including ones shared with you</li>
                <li>what you changed in those: it stays in their history, no longer linked to an account</li>
              </ul>
              <p className="mt-2 text-neutral-500 dark:text-slate-500">
                People you shared a playbook with lose access to it. To keep a copy, export it first
                (playbook → <em>Export as Agent Plugin</em>, or <code className="text-xs">apb pull</code>).
              </p>
            </div>
          </div>

          <label className="block">
            <span className="text-neutral-700 dark:text-slate-300">
              Type <strong className="font-mono">{email}</strong> to confirm
            </span>
            <input
              type="email"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
            />
          </label>

          {error && <p className="text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => void handleDelete()}
              disabled={!matches || deleting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? "Deleting…" : "Permanently delete my account"}
            </button>
            <button
              onClick={() => { setOpen(false); setTyped(""); setError(null); }}
              disabled={deleting}
              className="px-4 py-2 rounded-lg text-neutral-600 dark:text-slate-400 hover:text-neutral-900 dark:hover:text-white"
            >
              Cancel
            </button>
            <Link href="/privacy" className="ml-auto text-xs text-neutral-500 dark:text-slate-500 hover:underline">
              What happens to your data
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
