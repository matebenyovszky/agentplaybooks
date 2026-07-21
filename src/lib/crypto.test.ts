import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

const originalKey = process.env.SECRETS_ENCRYPTION_KEY;
const validKey = "0123456789abcdef".repeat(4);
const context = { playbookId: "playbook-1", secretName: "API_KEY" };

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.SECRETS_ENCRYPTION_KEY;
  } else {
    process.env.SECRETS_ENCRYPTION_KEY = originalKey;
  }
});

describe("secret encryption configuration", () => {
  it("rejects a 64-character value that is not hexadecimal", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = "z".repeat(64);

    await expect(encryptSecret("secret", "user-1", context)).rejects.toThrow(
      "64-character hex string"
    );
  });

  it("round-trips a secret for its owner", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = validKey;

    const encrypted = await encryptSecret("secret", "user-1", context);

    expect(encrypted.encrypted_value).toMatch(/^v2:/);
    await expect(decryptSecret(encrypted, "user-1", context)).resolves.toBe("secret");
    await expect(decryptSecret(encrypted, "user-2", context)).rejects.toThrow();
    await expect(
      decryptSecret(encrypted, "user-1", { ...context, secretName: "OTHER_KEY" })
    ).rejects.toThrow();
  });

  it("still decrypts existing v1 ciphertext", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = validKey;

    await expect(decryptSecret({
      encrypted_value: "dRypj/+XclJ/WSGFrg==",
      iv: "AAECAwQFBgcICQoL",
      auth_tag: "6Fw4cgcGK6IhGUJSuKkEWw==",
    }, "user-1")).resolves.toBe("legacy-secret");
  });
});
