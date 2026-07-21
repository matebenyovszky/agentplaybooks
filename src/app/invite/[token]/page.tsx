"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, UsersRound } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/auth-fetch";

export default function CollaborationInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [playbookName, setPlaybookName] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [preview, auth] = await Promise.all([
        fetch(`/api/collaboration-invites/${token}`, { cache: "no-store" }),
        createBrowserClient().auth.getUser(),
      ]);
      const data = await preview.json().catch(() => null);
      if (preview.ok) setPlaybookName(data.playbook_name);
      else setError(typeof data?.error === "string" ? data.error : "Invite is invalid or expired");
      setSignedIn(Boolean(auth.data.user));
      setLoading(false);
    };
    void load();
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    const response = await authFetch(`/api/collaboration-invites/${token}`, { method: "POST" });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.playbook_id) {
      window.location.href = `/dashboard/playbook/${data.playbook_id}`;
      return;
    }
    setError(typeof data?.error === "string" ? data.error : "Could not accept invite");
    setAccepting(false);
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white dark:bg-blue-950/30 border border-neutral-200 dark:border-blue-900/50 text-center">
        <UsersRound className="h-12 w-12 mx-auto mb-4 text-amber-500" />
        {loading ? (
          <Loader2 className="h-6 w-6 mx-auto animate-spin" />
        ) : error ? (
          <>
            <h1 className="text-xl font-semibold mb-2">Invite unavailable</h1>
            <p className="text-sm text-red-500 mb-5">{error}</p>
            <Link href="/dashboard" className="text-amber-500 hover:underline">Go to dashboard</Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">Join “{playbookName}”</h1>
            <p className="text-sm text-neutral-600 dark:text-slate-400 mb-6">
              You will be able to edit its content. The owner keeps control of secrets, API keys, visibility, sharing, and deletion.
            </p>
            {signedIn ? (
              <button onClick={accept} disabled={accepting} className="w-full py-3 bg-amber-500 text-slate-950 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {accepting && <Loader2 className="h-4 w-4 animate-spin" />}
                Accept invitation
              </button>
            ) : (
              <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="block w-full py-3 bg-amber-500 text-slate-950 rounded-lg font-semibold">
                Sign in to accept
              </Link>
            )}
          </>
        )}
      </div>
    </main>
  );
}
