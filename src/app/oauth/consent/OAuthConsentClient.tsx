"use client";

import { useEffect, useState } from "react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { ArrowRight, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

const scopeLabels: Record<string, string> = {
  openid: "Identify your AgentPlaybooks account",
  email: "Read your account email address",
  profile: "Read your basic account profile",
};

export default function OAuthConsentClient({ authorizationId }: { authorizationId?: string }) {
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<"approve" | "deny" | "switch" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!authorizationId) {
        setError("This authorization request is missing its authorization ID.");
        setLoading(false);
        return;
      }

      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      const { data, error: requestError } =
        await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

      if (cancelled) return;
      if (requestError || !data) {
        setError(requestError?.message || "This authorization request is invalid or has expired.");
        setLoading(false);
        return;
      }

      if (!("authorization_id" in data)) {
        window.location.replace(data.redirect_url);
        return;
      }

      setDetails(data);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  async function decide(decision: "approve" | "deny") {
    if (!authorizationId || deciding) return;
    setDeciding(decision);
    setError(null);

    const oauth = createBrowserClient().auth.oauth;
    const { data, error: decisionError } = decision === "approve"
      ? await oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

    if (decisionError || !data) {
      setError(decisionError?.message || "AgentPlaybooks could not save your decision.");
      setDeciding(null);
      return;
    }

    window.location.replace(data.redirect_url);
  }

  async function switchAccount() {
    if (!authorizationId || deciding) return;
    setDeciding("switch");
    const { error: signOutError } = await createBrowserClient().auth.signOut({ scope: "local" });
    if (signOutError) {
      setError("Could not switch accounts. Please try again.");
      setDeciding(null);
      return;
    }
    const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
  }

  const scopes = details?.scope.split(/\s+/).filter(Boolean) ?? [];

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-transparent to-amber-500/10" />
      <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />

      <section className="relative z-10 w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 shadow-2xl dark:border-blue-900/50 dark:bg-blue-950/40">
        <div className="mb-7 flex items-start gap-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-500">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-amber-600 dark:text-amber-400">AgentPlaybooks OAuth</p>
            <h1 className="text-2xl font-bold">
              {details ? `Connect ${details.client.name}` : "Authorize this connection"}
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-slate-400">
              Review what this AI client can do before connecting your account.
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex min-h-56 items-center justify-center gap-3 text-neutral-600 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading authorization request…
          </div>
        )}

        {!loading && error && !details && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {details && (
          <>
            <div className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-blue-900/50 dark:bg-slate-950/30">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                <div>
                  <h2 className="font-semibold">Account access</h2>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-slate-400">
                    Manage your playbooks, skills, memory, canvas, workflows, and connected MCP/OpenAPI tools.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <h2 className="font-semibold">Vault-backed API calls</h2>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-slate-400">
                    Use and manage encrypted secrets, including proxying read and write requests. Secret values stay hidden from the AI client.
                  </p>
                </div>
              </div>
            </div>

            {scopes.length > 0 && (
              <div className="mt-5">
                <h2 className="mb-2 text-sm font-semibold">Identity permissions</h2>
                <ul className="space-y-1 text-sm text-neutral-600 dark:text-slate-400">
                  {scopes.map((scope) => (
                    <li key={scope}>• {scopeLabels[scope] || scope}</li>
                  ))}
                </ul>
              </div>
            )}

            <dl className="mt-5 space-y-2 border-t border-neutral-200 pt-5 text-xs dark:border-blue-900/50">
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 text-neutral-500 dark:text-slate-500">Signed in as</dt>
                <dd className="break-all text-neutral-700 dark:text-slate-300">
                  {details.user.email}
                  <button type="button" disabled={Boolean(deciding)} onClick={() => void switchAccount()}
                    className="ml-3 text-blue-600 underline disabled:opacity-50 dark:text-blue-400">
                    {deciding === "switch" ? "Switching…" : "Use another account"}
                  </button>
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 text-neutral-500 dark:text-slate-500">Returns to</dt>
                <dd className="break-all text-neutral-700 dark:text-slate-300">{details.redirect_uri}</dd>
              </div>
            </dl>

            {error && (
              <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={Boolean(deciding)}
                onClick={() => void decide("deny")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 px-5 py-3 font-medium transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-blue-800 dark:hover:bg-blue-900/40"
              >
                {deciding === "deny" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Deny
              </button>
              <button
                type="button"
                disabled={Boolean(deciding)}
                onClick={() => void decide("approve")}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-400 px-5 py-3 font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {deciding === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Connect
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

