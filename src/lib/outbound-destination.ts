/**
 * Where the server may send a request that carries a credential.
 *
 * `use_secret`, the secrets proxy and federated MCP/OpenAPI calls all make
 * outbound requests to a URL that someone other than the operator chose. On a
 * self-hosted instance the server sits inside the organisation's network, so a
 * URL naming an internal address would turn the vault into a way to reach — and
 * hand credentials to — internal services. These checks refuse that.
 *
 * Two layers:
 *
 * 1. `blockedDestinationReason` looks at the URL alone: loopback, private,
 *    link-local, carrier-grade NAT, benchmark, multicast and reserved
 *    addresses in any IPv4 or IPv6 spelling (including IPv4-mapped and NAT64
 *    forms), and names that only resolve inside a network — `localhost`,
 *    `*.local`, `*.internal`, `*.home.arpa`, and single-label names such as a
 *    Docker service (`db`, `kong`).
 * 2. `assertPublicDestination` also resolves the name and refuses it when any
 *    address it resolves to is internal, so a public name pointing at an
 *    internal address is caught too. This runs where the server is a Node
 *    process. On Cloudflare Workers the runtime itself refuses non-public
 *    destinations (`global_fetch_strictly_public`), and Node's resolver is not
 *    available there.
 *
 * What this does not cover: a name whose DNS answer changes between this check
 * and the connection (DNS rebinding with a near-zero TTL). Network egress
 * policy — the application container without a route to internal networks — is
 * the control for that; see public/docs/self-hosting.md.
 */

export class UnsafeDestinationError extends Error {
  constructor(readonly reason: string) {
    super(`Requests to private/internal addresses are not allowed (${reason})`);
    this.name = "UnsafeDestinationError";
  }
}

function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return bytes.every((byte) => byte >= 0 && byte <= 255) ? bytes : null;
}

function parseIpv6(host: string): number[] | null {
  if (!host.includes(":")) return null;
  let address = host.split("%")[0];
  let tail: number[] = [];
  const lastColon = address.lastIndexOf(":");
  const dotted = address.slice(lastColon + 1);
  if (dotted.includes(".")) {
    const v4 = parseIpv4(dotted);
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    address = address.slice(0, lastColon + 1) + "0:0";
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const read = (part: string) => (part ? part.split(":") : []);
  const head = read(halves[0]);
  const rest = halves.length === 2 ? read(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const words = groups.map((group) => (/^[0-9a-f]{1,4}$/i.test(group) ? parseInt(group, 16) : NaN));
  if (words.some(Number.isNaN)) return null;
  if (tail.length) words.splice(6, 2, ...tail);
  return words;
}

function ipv4Reason([a, b, c]: number[]): string | null {
  if (a === 0) return "unspecified";
  if (a === 10) return "private";
  if (a === 100 && b >= 64 && b <= 127) return "carrier_nat";
  if (a === 127) return "loopback";
  if (a === 169 && b === 254) return "link_local";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 0 && c === 0) return "reserved";
  if (a === 192 && b === 168) return "private";
  if (a === 198 && (b === 18 || b === 19)) return "benchmark";
  if (a >= 224) return "multicast_or_reserved";
  return null;
}

function ipv6Reason(words: number[]): string | null {
  const [w0, w1, w2, w3, w4, w5, w6, w7] = words;
  const embeddedV4 = [w6 >> 8, w6 & 255, w7 >> 8, w7 & 255];
  if (words.every((word) => word === 0)) return "unspecified";
  if (words.slice(0, 7).every((word) => word === 0) && w7 === 1) return "loopback";
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible) reach the IPv4 address.
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && (w5 === 0xffff || w5 === 0)) {
    return ipv4Reason(embeddedV4) ?? (w5 === 0 ? "reserved" : null);
  }
  // NAT64 well-known prefix 64:ff9b::/96 carries an IPv4 address too.
  if (w0 === 0x64 && w1 === 0xff9b && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) return ipv4Reason(embeddedV4);
  // 6to4 2002::/16 embeds the IPv4 address in the next 32 bits.
  if (w0 === 0x2002) return ipv4Reason([w1 >> 8, w1 & 255, w2 >> 8, w2 & 255]);
  if ((w0 & 0xfe00) === 0xfc00) return "unique_local";
  if ((w0 & 0xffc0) === 0xfe80) return "link_local";
  if ((w0 & 0xffc0) === 0xfec0) return "site_local";
  if ((w0 & 0xff00) === 0xff00) return "multicast";
  return null;
}

/** Why an IP address literal is not a public destination, or null when it is. */
export function internalAddressReason(address: string): string | null {
  const host = address.toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = parseIpv4(host);
  if (v4) return ipv4Reason(v4);
  const v6 = parseIpv6(host);
  if (v6) return ipv6Reason(v6);
  return null;
}

function isIpLiteral(host: string): boolean {
  return parseIpv4(host) !== null || parseIpv6(host) !== null;
}

/** Why a hostname (or IP literal) is not a public destination, or null. */
export function blockedHostnameReason(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return "empty_host";
  if (isIpLiteral(host)) return internalAddressReason(host);
  // Numeric forms the URL parser did not normalise (e.g. "0x7f.1").
  if (/^[0-9x.]+$/i.test(host)) return "ambiguous_numeric_host";
  if (!/^[a-z0-9.-]+$/.test(host)) return "invalid_host";
  if (host === "localhost" || host.endsWith(".localhost")) return "loopback";
  if (/\.(local|internal|intranet|lan|home\.arpa|localdomain)$/.test(host)) return "internal_name";
  if (host === "metadata.google.internal" || host === "metadata") return "metadata";
  if (!host.includes(".")) return "single_label_name";
  return null;
}

/** Why a URL is not a safe outbound destination, or null when it is. */
export function blockedDestinationReason(
  value: string,
  options: { allowInsecureHttp?: boolean } = {},
): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "invalid_url";
  }
  const httpAllowed = options.allowInsecureHttp ?? true;
  if (url.protocol !== "https:" && !(httpAllowed && url.protocol === "http:")) return "unsupported_protocol";
  if (url.username || url.password) return "credentials_in_url";
  return blockedHostnameReason(url.hostname);
}

type LookupResult = { address: string; family: number };
export type Lookup = (hostname: string) => Promise<LookupResult[]>;

function runsOnWorkers(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

async function systemLookup(hostname: string): Promise<LookupResult[]> {
  const dns = await import("node:dns");
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}

/**
 * Should names be resolved before connecting? On by default in a Node process;
 * the test suite turns it off (it has no network), and OUTBOUND_DNS_CHECK=false
 * does the same for an operator who enforces egress at the network layer.
 */
export function resolvesBeforeConnecting(configured = process.env["OUTBOUND_DNS_CHECK"]): boolean {
  if (runsOnWorkers()) return false;
  return configured?.trim().toLowerCase() !== "false";
}

/**
 * Refuse a destination that is, or resolves to, an internal address.
 * Throws UnsafeDestinationError with a short reason code.
 */
export async function assertPublicDestination(
  value: string,
  options: { allowInsecureHttp?: boolean; lookup?: Lookup; resolve?: boolean } = {},
): Promise<void> {
  const reason = blockedDestinationReason(value, options);
  if (reason) throw new UnsafeDestinationError(reason);
  const shouldResolve = options.resolve ?? (options.lookup ? true : resolvesBeforeConnecting());
  if (!shouldResolve) return;
  const hostname = new URL(value).hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(hostname)) return;
  let addresses: LookupResult[];
  try {
    addresses = await (options.lookup ?? systemLookup)(hostname);
  } catch {
    throw new UnsafeDestinationError("unresolvable_host");
  }
  if (addresses.length === 0) throw new UnsafeDestinationError("unresolvable_host");
  for (const { address } of addresses) {
    const internal = internalAddressReason(address);
    if (internal) throw new UnsafeDestinationError(`resolves_to_${internal}`);
  }
}
