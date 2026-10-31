import { isSecretExpired } from "./secret-expiry";

/** Only call after secrets:read is authorized. No decryption or crypto fields. */
export function secretCapabilities(secret: { allow_api_key_reveal?: boolean; expires_at?: string | null }) {
  const expired = isSecretExpired(secret.expires_at);
  const revealReason = !secret.allow_api_key_reveal ? "proxy_only" : expired ? "expired" : null;
  return {
    proxy: { allowed: !expired, reason: expired ? "expired" : null },
    reveal: {
      supported: true,
      allowed: revealReason === null,
      reason: revealReason,
      next_steps: revealReason === "proxy_only"
        ? ["Ask the owner or an editor to enable Allow API keys to reveal the raw value for this secret, only if raw access is needed. Server-side proxy use does not require reveal."]
        : revealReason === "expired"
          ? ["Ask the owner or an editor to renew or clear expires_at."] : [],
    },
  };
}
