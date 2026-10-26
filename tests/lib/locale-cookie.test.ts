import { describe, expect, it } from "vitest";
import { localeCookie } from "@/lib/locale-cookie";

describe("localeCookie", () => {
  it("sets SameSite=Lax and omits Secure on http so self-host :3000 still works", () => {
    expect(localeCookie("hu", false)).toBe(
      "NEXT_LOCALE=hu;path=/;max-age=31536000;SameSite=Lax",
    );
  });

  it("adds Secure on https", () => {
    expect(localeCookie("en", true)).toBe(
      "NEXT_LOCALE=en;path=/;max-age=31536000;SameSite=Lax;Secure",
    );
  });
});
