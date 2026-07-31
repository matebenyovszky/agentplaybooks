const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type EncryptedSecretPayload = {
  encryptedPayload: string;
  iv: string;
};

export async function encryptMcpSecrets(
  secrets: Record<string, unknown>,
  encryptionKey = process.env.MCP_SECRET_ENCRYPTION_KEY,
): Promise<EncryptedSecretPayload> {
  const key = await importEncryptionKey(encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(secrets)),
  );
  return { encryptedPayload: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

export async function decryptMcpSecrets(
  encryptedPayload: string,
  iv: string,
  encryptionKey = process.env.MCP_SECRET_ENCRYPTION_KEY,
): Promise<Record<string, unknown>> {
  const key = await importEncryptionKey(encryptionKey);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(encryptedPayload),
  );
  const value: unknown = JSON.parse(decoder.decode(decrypted));
  if (!isRecord(value)) throw new Error("Decrypted MCP secret payload is invalid");
  return value;
}

async function importEncryptionKey(value?: string) {
  if (!value || value.length < 32) {
    throw new Error("MCP_SECRET_ENCRYPTION_KEY must contain at least 32 characters");
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
