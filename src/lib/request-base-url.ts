import { headers } from "next/headers";

function getFallbackBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.CF_PAGES_URL ||
    ""
  );
}

function parseUrlHost(urlValue: string | undefined): string | null {
  if (!urlValue) return null;

  try {
    return new URL(urlValue).host.toLowerCase();
  } catch {
    return null;
  }
}

function getAllowedHosts(): Set<string> {
  return new Set(
    [
      parseUrlHost(process.env.NEXT_PUBLIC_SITE_URL),
      parseUrlHost(process.env.SITE_URL),
      parseUrlHost(process.env.CF_PAGES_URL),
    ].filter((host): host is string => Boolean(host))
  );
}

export function buildSafeBaseUrl(protoHeader: string | null, hostHeader: string | null): string {
  const fallbackBaseUrl = getFallbackBaseUrl();
  const host = hostHeader?.trim().toLowerCase();
  const proto = protoHeader === "http" ? "http" : "https";

  if (host) {
    const isHostSyntaxValid = /^[a-z0-9.-]+(?::\d{1,5})?$/.test(host);
    if (!isHostSyntaxValid) {
      return fallbackBaseUrl;
    }

    const allowedHosts = getAllowedHosts();
    if (allowedHosts.size === 0 || allowedHosts.has(host)) {
      return `${proto}://${host}`;
    }
  }

  return fallbackBaseUrl;
}

export async function getRequestBaseUrl() {
  const headerStore = await headers();
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");

  return buildSafeBaseUrl(proto, host);
}
