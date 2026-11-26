// Native Request/Response handler: shared by Next.js and the Worker dispatcher.
// @worker-native
import { accountIsActive } from "@/app/api/_shared/account-status";
import { entraConfig, idTokenMatches, publicEntraConfig, unverifiedJwtClaims } from "@/lib/entra-sso";

/**
 * Microsoft Entra ID sign-in for desktop agents (see src/lib/entra-sso.ts).
 *
 *   GET  /api/auth/entra   whether it is enabled, and the tenant/client ids
 *   POST /api/auth/entra   { id_token, nonce? } -> { access_token, expires_at, user }
 *
 * The POST hands the ID token to Supabase Auth's id_token grant, which verifies
 * it and issues a session. Only the access token is returned: the client renews
 * by signing in to Entra ID again (silently, with its Entra refresh token), so
 * an account disabled in Entra loses access when the access token expires
 * instead of living on through a Supabase refresh token.
 */

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
const MAX_ID_TOKEN_LENGTH = 16_384;

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

export async function GET() {
  return reply(publicEntraConfig(entraConfig()));
}

export async function POST(request: Request) {
  const config = entraConfig();
  if (!config) return reply({ error: "Microsoft Entra ID sign-in is not enabled on this instance." }, 404);

  const body = await request.json().catch(() => null) as { id_token?: unknown; nonce?: unknown } | null;
  const idToken = body?.id_token;
  const nonce = body?.nonce;
  if (typeof idToken !== "string" || !idToken || idToken.length > MAX_ID_TOKEN_LENGTH
    || (nonce !== undefined && (typeof nonce !== "string" || nonce.length > 256))) {
    return reply({ error: "Provide an Entra ID token (id_token) and optionally its nonce." }, 400);
  }
  if (!idTokenMatches(unverifiedJwtClaims(idToken), config)) {
    return reply({ error: "This ID token was not issued to this instance's tenant and application." }, 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return reply({ error: "Sign-in is not configured on this instance." }, 503);

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=id_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify({ provider: "azure", id_token: idToken, ...(nonce ? { nonce } : {}) }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return reply({ error: "The sign-in service did not answer." }, 502);
  }

  const session = await response.json().catch(() => null) as {
    access_token?: unknown; expires_at?: unknown; expires_in?: unknown;
    user?: { id?: unknown; email?: unknown };
    msg?: unknown; error_description?: unknown; error_code?: unknown;
  } | null;
  if (!response.ok || typeof session?.access_token !== "string" || typeof session.user?.id !== "string") {
    // Supabase Auth's own explanation (provider disabled, audience, nonce...)
    // carries no credential and is what an operator needs to fix the setup.
    const detail = session?.msg ?? session?.error_description ?? session?.error_code;
    return reply({
      error: "Supabase Auth refused the Entra ID token.",
      ...(typeof detail === "string" ? { detail: detail.slice(0, 300) } : {}),
    }, 401);
  }
  if (!await accountIsActive(request, session.user.id)) {
    return reply({ error: "This account is disabled." }, 403);
  }

  const expiresAt = typeof session.expires_at === "number"
    ? session.expires_at
    : Math.floor(Date.now() / 1000) + (typeof session.expires_in === "number" ? session.expires_in : 3600);
  return reply({
    token_type: "bearer",
    access_token: session.access_token,
    expires_at: expiresAt,
    user: { id: session.user.id, email: typeof session.user.email === "string" ? session.user.email : null },
  });
}
