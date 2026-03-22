/**
 * AES-256-GCM encryption/decryption for secrets storage.
 *
 * Each user gets a UNIQUE encryption key derived via HKDF:
 *   user_key = HKDF(master_key, salt=user_id, info="agentplaybooks-secrets")
 *
 * This means:
 * - Compromising one user's data doesn't expose other users' secrets
 * - The master key alone can't decrypt without knowing the user_id
 * - Each secret also gets a unique random IV per encrypt operation
 *
 * Trade-off: decryption happens server-side because agents need to read
 * secrets via MCP/API. The server must be able to decrypt.
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for GCM
const HKDF_INFO = "agentplaybooks-secrets-v1";

function getMasterKeyHex(): string {
  const key = process.env.SECRETS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY environment variable is not set. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  if (key.length !== 64) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return key;
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derive a per-user AES-256 key using HKDF.
 * master_key + user_id -> unique 256-bit key for that user.
 */
async function deriveUserKey(userId: string): Promise<CryptoKey> {
  const masterKeyHex = getMasterKeyHex();
  const masterKeyBuffer = hexToBuffer(masterKeyHex);

  // Import master key as HKDF base material
  const baseKey = await crypto.subtle.importKey(
    "raw",
    masterKeyBuffer,
    "HKDF",
    false,
    ["deriveKey"]
  );

  const encoder = new TextEncoder();

  // Derive a unique AES-256-GCM key per user
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(userId),
      info: encoder.encode(HKDF_INFO),
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

export type EncryptedData = {
  encrypted_value: string; // base64 ciphertext
  iv: string;              // base64 IV
  auth_tag: string;        // base64 auth tag (appended by WebCrypto in GCM mode)
};

/**
 * Encrypt a plaintext secret value using AES-256-GCM with a per-user derived key.
 * @param plaintext - The secret value to encrypt
 * @param userId - The owner's user ID (used to derive their unique encryption key)
 */
export async function encryptSecret(plaintext: string, userId: string): Promise<EncryptedData> {
  const key = await deriveUserKey(userId);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  // WebCrypto AES-GCM appends the 16-byte auth tag to the ciphertext
  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: 128 },
    key,
    encoded
  );

  const fullBytes = new Uint8Array(ciphertextWithTag);
  // Last 16 bytes = auth tag
  const ciphertext = fullBytes.slice(0, fullBytes.length - 16);
  const authTag = fullBytes.slice(fullBytes.length - 16);

  return {
    encrypted_value: bufferToBase64(ciphertext.buffer),
    iv: bufferToBase64(iv.buffer),
    auth_tag: bufferToBase64(authTag.buffer),
  };
}

/**
 * Decrypt an AES-256-GCM encrypted secret using the owner's derived key.
 * @param data - The encrypted data (ciphertext, IV, auth tag)
 * @param userId - The owner's user ID (must match the ID used during encryption)
 */
export async function decryptSecret(data: EncryptedData, userId: string): Promise<string> {
  const key = await deriveUserKey(userId);
  const iv = new Uint8Array(base64ToBuffer(data.iv));
  const ciphertext = new Uint8Array(base64ToBuffer(data.encrypted_value));
  const authTag = new Uint8Array(base64ToBuffer(data.auth_tag));

  // WebCrypto expects ciphertext + authTag concatenated
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: 128 },
    key,
    combined.buffer
  );

  return new TextDecoder().decode(decrypted);
}
