import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { context } = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: context }));
import {
  fingerprintFromCertificateHeader,
  normalizeCertificateFingerprint,
  authenticatedProxyAddress,
  resolveMtlsMode,
  verifiedClientFingerprint,
} from "./mtls";

const ENV_KEYS = [
  "MTLS_PROXY_SHARED_SECRET", "MTLS_MODE", "MTLS_PROXY_FINGERPRINT_HEADER", "MTLS_PROXY_VERIFY_HEADER", "MTLS_TRUSTED_PROXIES",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

const valid = {
  certPresented: "1", certVerified: "SUCCESS", certRevoked: "0",
  certFingerprintSHA256: "ab".repeat(32),
};
const fingerprint = valid.certFingerprintSHA256;
const trustedProxy = "172.28.0.10";
const attacker = "203.0.113.8";

const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUVMCNoDlY+M9j8c+fZdTppb3RC20wDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbXRscy10ZXN0MB4XDTI2MTAyNDIzMzgyNloXDTI2MTAy
NTIzMzgyNlowFDESMBAGA1UEAwwJbXRscy10ZXN0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAjghzSpJ1Bici/migShApuKC1XkuL5VmgY7jlKMwTnDwk
O3Bu1sEQHR1us8N5wzpIkV7pffX/KgiiUQ3xohKEipmh6Vp+IXAsBg6l1HeJOcbj
1kxwL5dq7h6oDWi17nCEo8ugWwrmzQroegYLxO+Zm0uL0tmRCVx0oOX6M9qINP8l
a/HvfkrH47co1A3t/jANofREGfvlfA/mzlFXT7kMs6JcDaOsCL2hiT3ePaWSu7RF
tZEjLBNwa6IzoIy9u9oxsIk7MCcgP/YTHFQWbz7lDrQV84u0SqtUWPBpXHP2gmi7
2sOyDBdw56rQiRosFmVkEfQtmfmMk+AGcPXTxY+fVQIDAQABo1MwUTAdBgNVHQ4E
FgQUKXDZYdwlEoPvNB2uXSO6WfkVVFAwHwYDVR0jBBgwFoAUKXDZYdwlEoPvNB2u
XSO6WfkVVFAwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAPsuC
3ltab11Xg2tALok6VhdOxuq4lNUrscYqSXehAITOFXezv3vYcA673tuBPNEUBlEv
cpgduCAAZuuXhxyHEh91GRLZAK4OeQMN8MqcI93gWfJbrG1pOD83EFek79N7aTCe
bxHpAuPtIPB2qGnXYhbZO/+HsPeL62M9b/0r1AwHaOcg+APhayqe80Je5p3FqRJU
tB5MWKDvGjQqpn1Ov7NRFAYXt2j15zp6VNsR1Ai6Uze/Fo2LVv5Yx4fdJav4Uc6I
t5ovJQU43rdLDqkTBnM4kQta5+dZZlwzTudupNHb/cSI+Vn3eiLTYXGa6+aVErNK
uAaiE0iMfixguy8FsA==
-----END CERTIFICATE-----`;
const TEST_CERT_SHA256 = "7ee8b9c2b850741312a6b2396ed4b3211ccae1e60d8b35fe8760171b419d7588";

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
}

function proxyRequest(
  headers: Record<string, string>,
  ip?: string,
): Request & { ip?: string } {
  const request = new Request("https://app.internal/api/playbooks/guid/secrets/resolve", { headers: { "x-apb-proxy-token": "a".repeat(64), "x-apb-proxy-address": ip ?? trustedProxy, ...headers } });
  if (ip !== undefined) Object.defineProperty(request, "ip", { value: ip });
  return request as Request & { ip?: string };
}

function enableProxy(overrides: Record<string, string> = {}) {
  process.env.MTLS_PROXY_SHARED_SECRET = "a".repeat(64);
  process.env.MTLS_MODE = "proxy";
  process.env.MTLS_PROXY_FINGERPRINT_HEADER = "X-SSL-Client-Fingerprint";
  process.env.MTLS_PROXY_VERIFY_HEADER = "X-SSL-Client-Verify";
  process.env.MTLS_TRUSTED_PROXIES = `${trustedProxy}/32,127.0.0.1,::1`;
  Object.assign(process.env, overrides);
}

beforeEach(() => {
  context.mockReset();
  restoreEnv();
});
afterEach(restoreEnv);

describe("trusted mTLS identity", () => {
  it("uses only the verified platform TLS context", () => {
    context.mockReturnValue({ cf: { tlsClientAuth: valid } });
    expect(verifiedClientFingerprint()).toBe(valid.certFingerprintSHA256);
    expect(normalizeCertificateFingerprint(Array(32).fill("AB").join(":")))
      .toBe(valid.certFingerprintSHA256);
  });
  it.each([
    { certPresented: "0" }, { certVerified: "FAILED:self signed certificate" },
    { certRevoked: "1" }, { certRevoked: undefined }, { certFingerprintSHA256: "invalid" },
  ])("rejects unverified/revoked certificates: %j", change => {
    context.mockReturnValue({ cf: { tlsClientAuth: { ...valid, ...change } } });
    expect(verifiedClientFingerprint()).toBeNull();
  });
  it("fails closed outside the platform, including spoofed HTTP headers", () => {
    const spoofed = proxyRequest({
      "Client-Cert": "spoof", "Cf-Cert-Verified": "SUCCESS",
      "X-SSL-Client-Fingerprint": fingerprint, "X-SSL-Client-Verify": "SUCCESS",
      "x-forwarded-for": trustedProxy,
    }, trustedProxy);
    context.mockImplementation(() => { throw new Error("No runtime context"); });
    expect(verifiedClientFingerprint(spoofed)).toBeNull();
    context.mockReturnValue({});
    expect(verifiedClientFingerprint(spoofed)).toBeNull();
  });
  it("keeps Cloudflare mode as the default and ignores proxy configuration", () => {
    enableProxy();
    process.env.MTLS_MODE = "cloudflare";
    context.mockReturnValue({ cf: { tlsClientAuth: valid } });
    expect(resolveMtlsMode()).toBe("cloudflare");
    expect(verifiedClientFingerprint(proxyRequest({
      "X-SSL-Client-Fingerprint": "cd".repeat(32), "X-SSL-Client-Verify": "SUCCESS",
    }, trustedProxy))).toBe(fingerprint);
  });
});

describe("fingerprint normalization", () => {
  it("accepts colon-separated, bare, and mixed-case SHA-256 hex", () => {
    const colon = Array.from({ length: 32 }, (_, i) => fingerprint.slice(i * 2, i * 2 + 2)).join(":");
    expect(normalizeCertificateFingerprint(colon.toUpperCase())).toBe(fingerprint);
    expect(normalizeCertificateFingerprint(`  ${fingerprint.toUpperCase()}  `)).toBe(fingerprint);
    expect(fingerprintFromCertificateHeader(colon)).toBe(fingerprint);
  });
  it("rejects SHA-1, truncated, and non-hex values", () => {
    expect(normalizeCertificateFingerprint("ab".repeat(20))).toBeNull();
    expect(normalizeCertificateFingerprint("ab".repeat(31))).toBeNull();
    expect(normalizeCertificateFingerprint("gz".repeat(32))).toBeNull();
    expect(normalizeCertificateFingerprint("")).toBeNull();
    expect(normalizeCertificateFingerprint(null)).toBeNull();
  });
  it("hashes a proxy-forwarded PEM to the openssl SHA-256 fingerprint", () => {
    expect(fingerprintFromCertificateHeader(TEST_CERT_PEM)).toBe(TEST_CERT_SHA256);
    expect(fingerprintFromCertificateHeader(encodeURIComponent(TEST_CERT_PEM)))
      .toBe(TEST_CERT_SHA256);
  });
  it("accepts Traefik's delimiter-free leaf and chain representation", () => {
    const bare = TEST_CERT_PEM.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
    expect(fingerprintFromCertificateHeader(bare)).toBe(TEST_CERT_SHA256);
    expect(fingerprintFromCertificateHeader(`${bare},${bare}`)).toBe(TEST_CERT_SHA256);
    expect(fingerprintFromCertificateHeader(Buffer.from("not a certificate").toString("base64"))).toBeNull();
  });
});

describe("proxy mTLS mode", () => {
  beforeEach(() => {
    context.mockImplementation(() => { throw new Error("No runtime context"); });
    enableProxy();
  });

  it("accepts a verified fingerprint from a trusted proxy", () => {
    const request = proxyRequest({
      "X-SSL-Client-Fingerprint": Array(32).fill("AB").join(":"),
      "X-SSL-Client-Verify": "SUCCESS",
      "x-forwarded-for": `198.51.100.10, ${trustedProxy}`,
    });
    expect(verifiedClientFingerprint(request)).toBe(fingerprint);
  });
  it("accepts IPv6-mapped authenticated proxy addresses", () => {
    process.env.MTLS_TRUSTED_PROXIES = "10.0.0.0/8";
    const request = proxyRequest({
      "X-SSL-Client-Fingerprint": fingerprint,
      "X-SSL-Client-Verify": "SUCCESS",
    }, "::ffff:10.1.2.3");
    expect(authenticatedProxyAddress(request)).toBe("10.1.2.3");
    expect(verifiedClientFingerprint(request)).toBe(fingerprint);
  });
  it("rejects a missing or failed verify header", () => {
    const headers = {
      "X-SSL-Client-Fingerprint": fingerprint,
      "x-forwarded-for": trustedProxy,
    };
    expect(verifiedClientFingerprint(proxyRequest(headers))).toBeNull();
    expect(verifiedClientFingerprint(proxyRequest({
      ...headers, "X-SSL-Client-Verify": "FAILED:unable to verify the first certificate",
    }))).toBeNull();
    expect(verifiedClientFingerprint(proxyRequest({
      ...headers, "X-SSL-Client-Verify": "success",
    }))).toBeNull();
    expect(verifiedClientFingerprint(proxyRequest({
      ...headers, "X-SSL-Client-Verify": "NONE",
    }))).toBeNull();
  });
  it("rejects an untrusted source even with valid identity headers", () => {
    expect(verifiedClientFingerprint(proxyRequest({
      "X-SSL-Client-Fingerprint": fingerprint,
      "X-SSL-Client-Verify": "SUCCESS",
      "x-forwarded-for": trustedProxy,
      "x-apb-proxy-address": attacker,
    }))).toBeNull();
  });
  it("rejects spoofed identity headers that did not come from the proxy", () => {
    const spoofed = proxyRequest({
      "X-SSL-Client-Fingerprint": fingerprint,
      "X-SSL-Client-Verify": "SUCCESS",
      "x-forwarded-for": trustedProxy,
      "x-real-ip": trustedProxy,
    }, attacker);
    expect(authenticatedProxyAddress(spoofed)).toBe(attacker);
    expect(verifiedClientFingerprint(spoofed)).toBeNull();
  });
  it.each([undefined, "", "short", "b".repeat(64)])("rejects missing or forged proxy tokens: %s", token => {
    const request = proxyRequest({ "X-SSL-Client-Fingerprint": fingerprint, "X-SSL-Client-Verify": "SUCCESS", "x-forwarded-for": trustedProxy });
    if (token === undefined) request.headers.delete("x-apb-proxy-token");
    else request.headers.set("x-apb-proxy-token", token);
    expect(verifiedClientFingerprint(request)).toBeNull();
  });
  it("fails closed when proxy configuration is missing or invalid", () => {
    const request = proxyRequest({
      "X-SSL-Client-Fingerprint": fingerprint,
      "X-SSL-Client-Verify": "SUCCESS",
      "x-forwarded-for": trustedProxy,
    });
    delete process.env.MTLS_TRUSTED_PROXIES;
    expect(verifiedClientFingerprint(request)).toBeNull();
    enableProxy({ MTLS_TRUSTED_PROXIES: "not-an-ip" });
    expect(verifiedClientFingerprint(request)).toBeNull();
    enableProxy();
    delete process.env.MTLS_PROXY_FINGERPRINT_HEADER;
    expect(verifiedClientFingerprint(request)).toBeNull();
    enableProxy({ MTLS_MODE: "unknown" });
    expect(resolveMtlsMode()).toBe("off");
    expect(verifiedClientFingerprint(request)).toBeNull();
    enableProxy({ MTLS_MODE: "off" });
    expect(verifiedClientFingerprint(request)).toBeNull();
  });
});
