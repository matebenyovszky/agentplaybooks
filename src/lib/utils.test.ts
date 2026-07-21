import { describe, expect, it } from "vitest";
import { generateInviteToken, hashToken } from "./utils";

describe("collaboration invite tokens", () => {
  it("generates distinct 256-bit URL-safe tokens and hashes them for storage", async () => {
    const first = generateInviteToken();
    const second = generateInviteToken();

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
    expect(await hashToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashToken(first)).not.toBe(first);
  });
});
