import { getCloudflareContext } from "@opennextjs/cloudflare";

export function normalizeCertificateFingerprint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/:/g, "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

/** Only the per-request platform context is trusted, never HTTP headers.
 * Outside Cloudflare (including next dev), certificate authentication fails closed.
 */
export function verifiedClientFingerprint(): string | null {
  try {
    const cert = getCloudflareContext().cf?.tlsClientAuth;
    if (!cert || cert.certPresented !== "1" || cert.certVerified !== "SUCCESS"
      || cert.certRevoked !== "0") return null;
    return normalizeCertificateFingerprint(cert.certFingerprintSHA256);
  } catch {
    return null;
  }
}
