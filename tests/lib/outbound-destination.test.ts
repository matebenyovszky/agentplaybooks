import { describe, expect, it, vi } from "vitest";
import {
  assertPublicDestination,
  blockedDestinationReason,
  internalAddressReason,
  UnsafeDestinationError,
} from "@/lib/outbound-destination";
import { narrowsAllowedHosts, checkSecretDestination } from "@/lib/secret-destinations";
import { anonymousMayCall, serverDestinations } from "@/app/api/_shared/federation-secrets";
import { publicTransportConfig } from "@/lib/mcp/public-transport-config";
import { callFederatedTool, federatedToolName } from "@/lib/mcp/federation";
import type { MCPServer } from "@/lib/supabase/types";

describe("outbound destinations", () => {
  it.each([
    "http://127.0.0.2/",
    "http://0.0.0.0/",
    "http://100.64.0.1/",
    "http://198.18.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[::ffff:a00:1]/",
    "http://[64:ff9b::a00:1]/",
    "http://[2002:c0a8:0101::1]/",
    "http://[fe80::1]/",
    "http://[fd12::1]/",
    "http://kong:8000/rest/v1/",
    "http://db/",
    "https://supabase.internal/",
    "https://printer.local/",
    "https://router.home.arpa/",
    "http://2130706433/",
    "http://0x7f.1/",
    "https://user:pass@example.org/",
    "ftp://example.org/",
  ])("refuses %s", (url) => {
    expect(blockedDestinationReason(url)).not.toBeNull();
  });

  it.each(["https://api.example.org/v1", "http://93.184.216.34/", "https://[2606:4700::1111]/", "http://echo.airgap/"])("allows %s", (url) => {
    expect(blockedDestinationReason(url)).toBeNull();
  });

  it("refuses a public name that resolves to an internal address", async () => {
    const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }]);
    await expect(assertPublicDestination("https://rebind.example.org/", { lookup }))
      .rejects.toThrow(UnsafeDestinationError);
    await expect(assertPublicDestination("https://rebind.example.org/", { lookup }))
      .rejects.toMatchObject({ reason: "resolves_to_private" });
  });

  it("refuses a name that does not resolve, and allows one that resolves publicly", async () => {
    await expect(assertPublicDestination("https://nowhere.example.org/", { lookup: async () => { throw new Error("ENOTFOUND"); } }))
      .rejects.toMatchObject({ reason: "unresolvable_host" });
    await expect(assertPublicDestination("https://api.example.org/", { lookup: async () => [{ address: "2606:4700::1111", family: 6 }] }))
      .resolves.toBeUndefined();
  });

  it("classifies addresses the resolver returns", () => {
    expect(internalAddressReason("::1")).toBe("loopback");
    expect(internalAddressReason("::ffff:192.168.1.20")).toBe("private");
    expect(internalAddressReason("8.8.8.8")).toBeNull();
  });
});

describe("where a secret may go", () => {
  it("lets a key narrow an allow-list but not widen or clear it", () => {
    expect(narrowsAllowedHosts(["api.example.org", "auth.example.org"], ["api.example.org"])).toBe(true);
    expect(narrowsAllowedHosts([], ["api.example.org"])).toBe(true);
    expect(narrowsAllowedHosts(["api.example.org"], ["api.example.org", "evil.example.net"])).toBe(false);
    expect(narrowsAllowedHosts(["api.example.org"], null)).toBe(false);
    expect(narrowsAllowedHosts(["api.example.org"], [])).toBe(false);
  });

  it("counts the OAuth token endpoint and an unnamed OpenAPI base as destinations", () => {
    const pinned = ["mcp.example.org"];
    const withToken = serverDestinations({ url: "https://mcp.example.org/rpc", auth: { token_url: "https://evil.example.net/token" } });
    expect(withToken.some((url) => !checkSecretDestination(url, pinned, { requireAllowList: false }).allowed)).toBe(true);
    const fromSpec = serverDestinations({ spec_url: "https://mcp.example.org/openapi.json" });
    expect(fromSpec.some((url) => !checkSecretDestination(url, pinned, { requireAllowList: false }).allowed)).toBe(true);
    const inline = serverDestinations({ openapi: { servers: [{ url: "https://mcp.example.org/v1" }] } });
    expect(inline.every((url) => checkSecretDestination(url, pinned, { requireAllowList: false }).allowed)).toBe(true);
  });

  it("offers a public server to anonymous callers only without vault credentials", () => {
    expect(anonymousMayCall({ transport_config: { access: "public", url: "https://mcp.example.org" } })).toBe(true);
    expect(anonymousMayCall({ transport_config: { access: "public", auth: { type: "bearer", token_secret: "OWNER_TOKEN" } } })).toBe(false);
    expect(anonymousMayCall({ transport_config: { url: "https://mcp.example.org" } })).toBe(false);
  });

  it("withholds literal credentials from a published config", () => {
    expect(publicTransportConfig({
      url: "https://mcp.example.org/rpc?api_key=abc123",
      headers: { "X-Api-Key": "abc123" },
      auth: { type: "bearer", token_secret: "TOKEN" },
    })).toEqual({
      url: "https://mcp.example.org/rpc",
      headers: { "X-Api-Key": "<withheld: set your own value>" },
      auth: { type: "bearer", token_secret: "TOKEN" },
    });
  });
});

describe("federated calls", () => {
  const server: MCPServer = {
    id: "12345678-1234-1234-1234-123456789abc",
    playbook_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    publisher_id: null,
    name: "Research",
    description: null,
    tools: [{ name: "search", inputSchema: { type: "object" } }],
    resources: [],
    transport_type: "http",
    transport_config: { url: "https://mcp.example.com/rpc", headers: { "X-Api-Key": "secret" } },
    created_at: "2026-07-30T00:00:00.000Z",
  } as MCPServer;

  it("does not follow a redirect that would carry the server's headers elsewhere", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { Location: "https://evil.example.net/collect" } });
    });
    await expect(callFederatedTool(server, federatedToolName(server, "search"), {}, { fetch: fetchMock as typeof fetch }))
      .rejects.toThrow(/redirected/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
