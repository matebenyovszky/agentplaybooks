"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  buildOAuthConsentReturnPath,
  formatOAuthScope,
  getOAuthClientHost,
} from "@/lib/oauth-consent";

type AuthorizationDetails = {
  authorization_id: string;
  redirect_uri: string;
  client: {
    id: string;
    name: string;
    uri: string;
    logo_uri: string;
  };
  user: {
    id: string;
    email: string;
  };
  scope: string;
};

function ConsentCard() {
  const searchParams = useSearchParams();
  const authorizationId = searchParams.get("authorization_id")?.trim() ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redirectToClient = useCallback((redirectUrl: string) => {
    window.location.assign(redirectUrl);
  }, []);

  useEffect(() => {
    let active = true;

    const loadAuthorization = async () => {
      if (!authorizationId) {
        setError("This authorization request is missing its authorization ID.");
        setLoading(false);
        return;
      }

      const supabase = createBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();

      if (!active) return;

      if (!sessionData.session) {
        const returnPath = buildOAuthConsentReturnPath(authorizationId);
        window.location.replace(`/login?next=${encodeURIComponent(returnPath)}`);
        return;
      }

      const { data, error: authorizationError } =
        await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

      if (!active) return;

      if (authorizationError || !data) {
        setError(authorizationError?.message ?? "The authorization request is no longer valid.");
        setLoading(false);
        return;
      }

      if ("redirect_url" in data) {
        redirectToClient(data.redirect_url);
        return;
      }

      setDetails(data);
      setLoading(false);
    };

    void loadAuthorization();

    return () => {
      active = false;
    };
  }, [authorizationId, redirectToClient]);

  const decide = async (decision: "approve" | "deny") => {
    if (!details || submitting) return;

    setSubmitting(decision);
    setError(null);
    const supabase = createBrowserClient();
    const action =
      decision === "approve"
        ? supabase.auth.oauth.approveAuthorization.bind(supabase.auth.oauth)
        : supabase.auth.oauth.denyAuthorization.bind(supabase.auth.oauth);
    const { data, error: decisionError } = await action(details.authorization_id, {
      skipBrowserRedirect: true,
    });

    if (decisionError || !data) {
      setError(decisionError?.message ?? "Could not complete the authorization request.");
      setSubmitting(null);
      return;
    }

    redirectToClient(data.redirect_url);
  };

  const clientHost = details ? getOAuthClientHost(details.client.uri) : null;
  const scopes = details?.scope.split(/\s+/).filter(Boolean) ?? [];

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-12 text-foreground">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-transparent to-amber-500/10" />
      <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-6rem)] max-w-md items-center">
        <section className="w-full rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-blue-900/50 dark:bg-blue-950/30">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
            <ShieldCheck className="h-7 w-7" />
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-3 text-neutral-600 dark:text-slate-300">
              <Loader2 className="h-5 w-5 animate-spin" />
              Checking authorization request…
            </div>
          ) : details ? (
            <>
              <h1 className="text-2xl font-bold">Authorize {details.client.name}</h1>
              <p className="mt-2 text-sm text-neutral-600 dark:text-slate-400">
                {clientHost ? `${clientHost} is` : "This application is"} requesting access to your
                AgentPlaybooks account as <span className="font-medium text-foreground">{details.user.email}</span>.
              </p>

              <div className="my-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-blue-900/50 dark:bg-slate-950/40">
                <p className="mb-3 text-sm font-semibold">This application will be able to:</p>
                <ul className="space-y-3">
                  {scopes.map((scope) => (
                    <li key={scope} className="flex gap-3 text-sm text-neutral-700 dark:text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      {formatOAuthScope(scope)}
                    </li>
                  ))}
                </ul>
              </div>

              {error && (
                <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => void decide("deny")}
                  disabled={submitting !== null}
                  className="flex items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-3 font-semibold transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-blue-800/60 dark:hover:bg-blue-900/30"
                >
                  {submitting === "deny" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  Deny
                </button>
                <button
                  type="button"
                  onClick={() => void decide("approve")}
                  disabled={submitting !== null}
                  className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-400 px-4 py-3 font-semibold text-slate-900 shadow-lg shadow-amber-500/20 transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submitting === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Authorize
                </button>
              </div>

              <p className="mt-5 text-center text-xs text-neutral-500 dark:text-slate-500">
                You can revoke this connection later from your account settings.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">Authorization unavailable</h1>
              <p className="mt-3 text-sm text-neutral-600 dark:text-slate-400">
                {error ?? "This authorization request could not be loaded."}
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default function OAuthConsentPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </main>
      }
    >
      <ConsentCard />
    </Suspense>
  );
}
