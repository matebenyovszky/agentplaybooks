import { createHash } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type MtlsMode = "cloudflare" | "proxy" | "off";

const SHA256_HEX = /^[a-f0-9]{64}$/;
const MAX_PROXY_CERT_DER = 16 * 1024;

type TrustedProxyRange = { bytes: Uint8Array; prefix: number };

/** Empty / unset keeps Cloudflare as the production default. Unknown values fail closed. */
export function resolveMtlsMode(value = process.env.MTLS_MODE): MtlsMode {
  const mode = value?.trim().toLowerCase();
  if (!mode || mode === "cloudflare") return "cloudflare";
  if (mode === "proxy" || mode === "off") return mode;
  return "off";
}

export function normalizeCertificateFingerprint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/:/g, "").trim().toLowerCase();
  return SHA256_HEX.test(normalized) ? normalized : null;
}

/**
 * Accept a SHA-256 hex fingerprint (colon/no-colon, any case) or a proxy-forwarded
 * PEM / URI-escaped PEM. The digest is SHA-256 of the DER, matching
 * `openssl x509 -fingerprint -sha256`.
 */
export function fingerprintFromCertificateHeader(value: unknown): string | null {
  const hex = normalizeCertificateFingerprint(value);
  if (hex) return hex;
  if (typeof value !== "string") return null;
  const der = derFromCertificateHeader(value);
  if (!der) return null;
  return createHash("sha256").update(der).digest("hex");
}

/** Only the per-request platform context is trusted, never HTTP headers.
 * Outside Cloudflare (including next dev), certificate authentication fails closed
 * unless MTLS_MODE=proxy and the request came from a trusted TLS terminator.
 */
export function verifiedClientFingerprint(request?: Request): string | null {
  switch (resolveMtlsMode()) {
    case "off":
      return null;
    case "proxy":
      return proxyClientFingerprint(request);
    default:
      return cloudflareClientFingerprint();
  }
}

/**
 * Immediate connection peer used to authorize proxy-injected mTLS headers.
 * Next.js `Request.ip` is the TCP peer and wins over X-Forwarded-For, so a client
 * that spoofs the forwarding header while connecting directly is rejected.
 */
export function requestPeerAddress(request: Request): string | null {
  const ipProp = (request as Request & { ip?: unknown }).ip;
  if (typeof ipProp === "string") {
    const fromSocket = canonicalizeIp(ipProp);
    if (fromSocket) return fromSocket;
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",");
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = canonicalizeIp(hops[i]);
      if (hop) return hop;
    }
  }
  return canonicalizeIp(request.headers.get("x-real-ip") ?? "");
}

function cloudflareClientFingerprint(): string | null {
  try {
    const cert = getCloudflareContext().cf?.tlsClientAuth;
    if (!cert || cert.certPresented !== "1" || cert.certVerified !== "SUCCESS"
      || cert.certRevoked !== "0") return null;
    return normalizeCertificateFingerprint(cert.certFingerprintSHA256);
  } catch {
    return null;
  }
}

function proxyClientFingerprint(request?: Request): string | null {
  if (!request) return null;
  const headerName = process.env.MTLS_PROXY_FINGERPRINT_HEADER?.trim();
  const proxies = parseTrustedProxies(process.env.MTLS_TRUSTED_PROXIES);
  if (!headerName || !proxies) return null;
  const peer = requestPeerAddress(request);
  if (!peer || !ipMatchesTrustedProxies(peer, proxies)) return null;
  const verifyHeader = process.env.MTLS_PROXY_VERIFY_HEADER?.trim();
  if (verifyHeader && request.headers.get(verifyHeader)?.trim() !== "SUCCESS") return null;
  return fingerprintFromCertificateHeader(request.headers.get(headerName));
}

function parseTrustedProxies(value: string | undefined): TrustedProxyRange[] | null {
  const entries = value?.split(",").map(entry => entry.trim()).filter(Boolean) ?? [];
  if (entries.length === 0) return null;
  const ranges: TrustedProxyRange[] = [];
  for (const entry of entries) {
    const range = parseCidr(entry);
    if (!range) return null;
    ranges.push(range);
  }
  return ranges;
}

function ipMatchesTrustedProxies(ip: string, ranges: TrustedProxyRange[]): boolean {
  const bytes = parseIpBytes(ip);
  if (!bytes) return false;
  return ranges.some(range => matchRange(bytes, range));
}

function parseCidr(entry: string): TrustedProxyRange | null {
  const slash = entry.lastIndexOf("/");
  const ipPart = slash === -1 ? entry : entry.slice(0, slash);
  const bytes = parseIpBytes(ipPart);
  if (!bytes) return null;
  const maxPrefix = bytes.length * 8;
  let prefix = maxPrefix;
  if (slash !== -1) {
    const raw = entry.slice(slash + 1);
    if (!/^\d{1,3}$/.test(raw)) return null;
    prefix = Number(raw);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) return null;
  }
  return { bytes, prefix };
}

function matchRange(ip: Uint8Array, range: TrustedProxyRange): boolean {
  if (ip.length !== range.bytes.length) return false;
  const fullBytes = Math.floor(range.prefix / 8);
  const rem = range.prefix % 8;
  for (let i = 0; i < fullBytes; i++) {
    if (ip[i] !== range.bytes[i]) return false;
  }
  if (rem) {
    const mask = (0xff << (8 - rem)) & 0xff;
    if ((ip[fullBytes] & mask) !== (range.bytes[fullBytes] & mask)) return false;
  }
  return true;
}

function canonicalizeIp(value: string): string | null {
  const bytes = parseIpBytes(stripIpWrapper(value));
  if (!bytes) return null;
  if (bytes.length === 4) return Array.from(bytes).join(".");
  const groups = [];
  for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  return groups.join(":");
}

function stripIpWrapper(value: string): string {
  const ip = value.trim();
  if (!ip) return "";
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]");
    return end === -1 ? "" : ip.slice(1, end);
  }
  const colon = ip.lastIndexOf(":");
  if (colon > 0 && ip.includes(".") && ip.indexOf(":") === colon) return ip.slice(0, colon);
  return ip;
}

function parseIpBytes(ip: string): Uint8Array | null {
  if (!ip) return null;
  const lowered = ip.toLowerCase();
  if (lowered.startsWith("::ffff:") && lowered.includes(".")) return parseIpv4(ip.slice(7));
  if (ip.includes(".") && !ip.includes(":")) return parseIpv4(ip);
  return parseIpv6(lowered);
}

function parseIpv4(ip: string): Uint8Array | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parts[i]) || (parts[i].length > 1 && parts[i].startsWith("0"))) return null;
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    bytes[i] = n;
  }
  return bytes;
}

function parseIpv6(ip: string): Uint8Array | null {
  if (ip.includes(":::")) return null;
  const sides = ip.split("::");
  if (sides.length > 2) return null;
  const parseGroups = (side: string): number[] | null => {
    if (!side) return [];
    const out: number[] = [];
    for (const group of side.split(":")) {
      if (group.includes(".")) {
        const v4 = parseIpv4(group);
        if (!v4) return null;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };
  const left = parseGroups(sides[0]);
  const right = sides.length === 1 ? [] : parseGroups(sides[1] ?? "");
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if (sides.length === 1) {
    if (left.length !== 8) return null;
  } else if (missing < 0) return null;
  const groups = sides.length === 1 ? left : [...left, ...Array(Math.max(missing, 0)).fill(0), ...right];
  if (groups.length !== 8) return null;
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0
    && groups[4] === 0 && groups[5] === 0xffff) {
    return Uint8Array.of(groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff);
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    bytes[i * 2] = groups[i] >> 8;
    bytes[i * 2 + 1] = groups[i] & 0xff;
  }
  return bytes;
}

function derFromCertificateHeader(value: string): Buffer | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let decoded = trimmed;
  if (trimmed.includes("%")) {
    try {
      decoded = decodeURIComponent(trimmed);
    } catch {
      return null;
    }
  }
  decoded = decoded.replace(/\\n/g, "\n");
  if (!/BEGIN [A-Z0-9 ]*CERTIFICATE/.test(decoded)) return null;
  const body = decoded
    .replace(/-----BEGIN [A-Z0-9 ]*CERTIFICATE-----/g, "")
    .replace(/-----END [A-Z0-9 ]*CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
  if (!body) return null;
  const der = Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (der.byteLength === 0 || der.byteLength > MAX_PROXY_CERT_DER) return null;
  return der;
}
