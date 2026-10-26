import { describe, expect, it } from "vitest";
import {
  SECURITY_HEADERS,
  connectSrcFor,
  contentSecurityPolicy,
  securityHeaders,
} from "@/lib/security-headers";

describe("security headers", () => {
  it("enforces Content-Security-Policy rather than reporting only", () => {
    const keys = SECURITY_HEADERS.map((header) => header.key);
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).not.toContain("Content-Security-Policy-Report-Only");
    expect(SECURITY_HEADERS.find((header) => header.key === "Strict-Transport-Security")?.value)
      .toContain("max-age=31536000");
  });

  it("adds a self-hosted Auth origin to connect-src without dropping the hosted wildcard", () => {
    const connect = connectSrcFor("http://kong:8000");
    expect(connect).toContain("'self'");
    expect(connect).toContain("https://*.supabase.co");
    expect(connect).toContain("http://kong:8000");
    expect(connect).toContain("ws://kong:8000");
    expect(contentSecurityPolicy("https://auth.internal.example")).toContain(
      "https://auth.internal.example",
    );
    expect(contentSecurityPolicy("https://auth.internal.example")).toContain(
      "wss://auth.internal.example",
    );
  });

  it("ignores an unparseable Auth URL", () => {
    expect(connectSrcFor("not a url")).toBe(
      "'self' https://*.supabase.co wss://*.supabase.co https://cloudflareinsights.com",
    );
  });

  it("allows the Cloudflare Web Analytics beacon host in script-src and connect-src", () => {
    const policy = contentSecurityPolicy();
    const scriptSrc = policy.split("; ").find((directive) => directive.startsWith("script-src "));
    const connectSrc = connectSrcFor();
    expect(scriptSrc?.split(" ")).toContain("https://static.cloudflareinsights.com");
    expect(connectSrc.split(" ")).toContain("https://cloudflareinsights.com");
    expect(scriptSrc).not.toMatch(/\*\.cloudflareinsights/);
    expect(connectSrc).not.toMatch(/\*\.cloudflareinsights/);
  });

  it("keeps frame denial and nosniff on every generated list", () => {
    const headers = securityHeaders("https://example.supabase.co");
    expect(headers.find((header) => header.key === "X-Frame-Options")?.value).toBe("DENY");
    expect(headers.find((header) => header.key === "X-Content-Type-Options")?.value).toBe("nosniff");
  });
});
