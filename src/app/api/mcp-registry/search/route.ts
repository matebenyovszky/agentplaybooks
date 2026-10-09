// @worker-native
import { normalizeRegistryResponse, type OfficialRegistryResponse } from "@/lib/mcp-registry";
import { cachedSingleFlight, type SingleFlightEntry } from "@/lib/cache/single-flight";

const REGISTRY_SERVERS_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";
const searches = new Map<string, SingleFlightEntry<string>>();
const MAX_BYTES = 2 * 1024 * 1024;

async function loadSearch(url: string): Promise<string> {
  // Native fetch has no Next revalidation cache. Retain only successful public
  // registry data, bounded to eight entries, and share simultaneous searches.
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Official MCP Registry returned HTTP ${response.status}.`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Official MCP Registry returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("Official MCP Registry response exceeds 2 MiB.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as OfficialRegistryResponse;
  const result = JSON.stringify(normalizeRegistryResponse(payload));
  if (new TextEncoder().encode(result).byteLength > MAX_BYTES) throw new Error("Normalized MCP Registry response exceeds 2 MiB.");
  return result;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const search = params.get("q")?.trim() ?? "";
  if (search.length > 512) return Response.json({ error: "Search is too long." }, { status: 400 });
  const requestedLimit = Number(params.get("limit") ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
    : 50;
  const registryUrl = new URL(REGISTRY_SERVERS_URL);
  registryUrl.searchParams.set("version", "latest");
  registryUrl.searchParams.set("limit", String(limit));
  if (search) registryUrl.searchParams.set("search", search);

  try {
    const key = registryUrl.toString();
    const body = await cachedSingleFlight(searches, key, 300_000, 8, () => loadSearch(key));
    return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
  } catch {
    return Response.json(
      { error: "The Official MCP Registry is temporarily unavailable." },
      { status: 502 },
    );
  }
}
