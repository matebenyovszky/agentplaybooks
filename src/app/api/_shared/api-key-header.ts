/**
 * Finding the API key in a request, and saying precisely what is wrong when it
 * is not there.
 *
 * Three forms arrive in practice, and all three are the same intent:
 *
 *   Authorization: Bearer apb_…    the documented one
 *   Authorization: apb_…           what a client writes when its config maps a
 *                                  header name to a value, with no place to put
 *                                  a scheme — Hermes Agent's `headers:` map does
 *                                  exactly this
 *   X-API-Key: apb_…               for a client that reserves `Authorization`
 *                                  for its own authentication handling and drops
 *                                  or overwrites whatever we put there
 *
 * Demanding the `Bearer` prefix bought nothing: our keys carry an unmistakable
 * `apb_` prefix, so there is no ambiguity to resolve. What it cost was a whole
 * class of silent failure — the key arrives, we do not recognise it, and the
 * operator is told a permission is missing.
 *
 * Which is the second half of this file. A refusal has to name what actually
 * happened, because none of these are visible from the client side: a listing
 * comes back empty and a refresh fails, whatever the cause. "This key lacks
 * memory:read" sends someone to edit permissions that were never the problem.
 */

const KEY_PREFIX = "apb_";
const BEARER = /^Bearer\s+/i;
const CREDENTIAL_HEADERS = ["Authorization", "X-API-Key"] as const;

/** An `${APBKS_KEY_X}` / `$APBKS_KEY_X` the client passed through literally. */
const UNEXPANDED_REFERENCE = /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/;

function headerValue(request: Request, name: string): string | null {
  const raw = request.headers.get(name)?.trim();
  return raw ? raw : null;
}

function withoutScheme(value: string): string {
  return BEARER.test(value) ? value.replace(BEARER, "").trim() : value;
}

/**
 * The AgentPlaybooks key this request carries, from either header, with or
 * without the `Bearer` scheme. Anything that is not one of our keys — a Supabase
 * session token arrives in `Authorization` too — yields null.
 */
export function presentedApiKey(request: Request): string | null {
  for (const name of CREDENTIAL_HEADERS) {
    const raw = headerValue(request, name);
    if (!raw) continue;
    const value = withoutScheme(raw);
    if (value.startsWith(KEY_PREFIX)) return value;
  }
  return null;
}

/** Which header carried something, so a refusal can name it. */
export function credentialHeaderName(request: Request): string | null {
  return CREDENTIAL_HEADERS.find((name) => headerValue(request, name)) ?? null;
}

/**
 * Why a presented credential could not be used — never the value itself, and
 * never a guess. The placeholder case is worth its own message: a client that
 * sent `${VAR}` verbatim did not expand it, which almost always means the
 * variable was set after the client started and is invisible to it.
 */
export function credentialProblem(request: Request): { headerName: string; message: string } | null {
  const headerName = credentialHeaderName(request);
  if (!headerName) return null;
  if (presentedApiKey(request)) return null;

  const raw = withoutScheme(headerValue(request, headerName) ?? "");
  if (UNEXPANDED_REFERENCE.test(raw)) {
    return {
      headerName,
      message: `The ${headerName} header carries an unexpanded variable reference instead of a key — the client sent the placeholder literally. Set the variable before starting the client: one added afterwards is invisible to a process already running.`,
    };
  }

  return {
    headerName,
    message: `The ${headerName} header does not carry an AgentPlaybooks key. Send the key itself, which starts with \`${KEY_PREFIX}\`; the \`Bearer \` prefix is optional.`,
  };
}
