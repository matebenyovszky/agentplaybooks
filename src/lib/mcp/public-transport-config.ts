/**
 * The part of an MCP server's transport config that may be shown to anyone.
 *
 * Public listings let people copy a shared server into their own playbook, so
 * the config is published. Its `auth` block holds vault secret *names*, which
 * are fine to publish. Two places can hold a literal credential instead:
 * free-form `headers`, and a query string in one of the URLs
 * (`?api_key=...`). Header values and query strings are therefore withheld;
 * the names stay, so a copy still shows what it needs.
 */

const WITHHELD = "<withheld: set your own value>";
const URL_KEYS = ["url", "spec_url", "base_url"] as const;

function withoutQuery(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    if (!url.search && !url.username && !url.password) return value;
    url.username = "";
    url.password = "";
    url.search = "";
    return url.toString();
  } catch {
    return value;
  }
}

export function publicTransportConfig(config: unknown): unknown {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  const copy: Record<string, unknown> = { ...(config as Record<string, unknown>) };
  if (copy.headers && typeof copy.headers === "object" && !Array.isArray(copy.headers)) {
    copy.headers = Object.fromEntries(Object.keys(copy.headers as Record<string, unknown>).map((name) => [name, WITHHELD]));
  }
  for (const key of URL_KEYS) copy[key] = withoutQuery(copy[key]);
  for (const key of URL_KEYS) if (copy[key] === undefined) delete copy[key];
  return copy;
}
