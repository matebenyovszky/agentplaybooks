import { beforeEach, describe, expect, it, vi } from "vitest";

const { context } = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: context }));
import { normalizeCertificateFingerprint, verifiedClientFingerprint } from "./mtls";

const valid = { certPresented: "1", certVerified: "SUCCESS", certRevoked: "0", certFingerprintSHA256: "ab".repeat(32) };
beforeEach(() => context.mockReset());
describe("trusted mTLS identity", () => {
  it("uses only the verified platform TLS context", () => {
    context.mockReturnValue({ cf: { tlsClientAuth: valid } });
    expect(verifiedClientFingerprint()).toBe(valid.certFingerprintSHA256);
    expect(normalizeCertificateFingerprint(Array(32).fill("AB").join(":"))).toBe(valid.certFingerprintSHA256);
  });
  it.each([
    { certPresented: "0" }, { certVerified: "FAILED:self signed certificate" },
    { certRevoked: "1" }, { certRevoked: undefined }, { certFingerprintSHA256: "invalid" },
  ])("rejects unverified/revoked certificates: %j", change => {
    context.mockReturnValue({ cf: { tlsClientAuth: { ...valid, ...change } } });
    expect(verifiedClientFingerprint()).toBeNull();
  });
  it("fails closed outside the platform, including spoofed HTTP headers", () => {
    context.mockImplementation(() => { throw new Error("No runtime context"); });
    expect(verifiedClientFingerprint()).toBeNull();
    context.mockReturnValue({});
    expect(verifiedClientFingerprint()).toBeNull();
  });
});
