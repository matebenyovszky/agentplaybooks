import { describe, expect, it } from "vitest";
import {
  HEADER_MISMATCH,
  UNSUPPORTED_PROTOCOL_VERSION,
  decodeHeaderValue,
  discoverResult,
  isModernRequest,
  readModernMeta,
  validateModernEnvelope,
} from "@/app/api/_shared/mcp-modern";

const VERSION = "2026-07-28";
const META_VERSION = "io.modelcontextprotocol/protocolVersion";

function modernParams(extra: Record<string, unknown> = {}, version = VERSION) {
  return { ...extra, _meta: { [META_VERSION]: version } };
}

function post(headers: Record<string, string>) {
  return new Request("http://localhost/api/mcp/guid", { method: "POST", headers });
}

describe("modern era detection", () => {
  it("treats per-request metadata as modern and its absence as legacy", () => {
    expect(isModernRequest("tools/list", modernParams())).toBe(true);
    expect(isModernRequest("tools/list", {})).toBe(false);
    expect(isModernRequest("initialize", { protocolVersion: VERSION })).toBe(false);
  });

  it("treats server/discover as modern even with no metadata", () => {
    // It has no legacy counterpart, so a client sending it can only be modern.
    expect(isModernRequest("server/discover", undefined)).toBe(true);
  });

  it("reads the metadata keys the spec defines", () => {
    const meta = readModernMeta({
      _meta: {
        [META_VERSION]: VERSION,
        "io.modelcontextprotocol/clientInfo": { name: "c", version: "1" },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    });
    expect(meta?.protocolVersion).toBe(VERSION);
    expect(meta?.clientInfo).toEqual({ name: "c", version: "1" });
  });
});

describe("modern envelope validation", () => {
  const ok = { "MCP-Protocol-Version": VERSION, "Mcp-Method": "tools/list" };

  it("accepts headers that agree with the body", () => {
    expect(validateModernEnvelope(post(ok), { method: "tools/list", params: modernParams() })).toBeNull();
  });

  it("rejects a missing or disagreeing protocol version header", () => {
    expect(validateModernEnvelope(post({ "Mcp-Method": "tools/list" }), { method: "tools/list", params: modernParams() }))
      .toMatchObject({ code: HEADER_MISMATCH, status: 400 });

    expect(validateModernEnvelope(
      post({ ...ok, "MCP-Protocol-Version": "2025-11-25" }),
      { method: "tools/list", params: modernParams() },
    )).toMatchObject({ code: HEADER_MISMATCH });
  });

  it("rejects a method header that does not mirror the body", () => {
    expect(validateModernEnvelope(
      post({ ...ok, "Mcp-Method": "tools/call" }),
      { method: "tools/list", params: modernParams() },
    )).toMatchObject({ code: HEADER_MISMATCH });
  });

  it("requires Mcp-Name only for the methods that mirror one, and matches it", () => {
    const body = { method: "tools/call", params: modernParams({ name: "get_weather" }) };
    const headers = { "MCP-Protocol-Version": VERSION, "Mcp-Method": "tools/call" };

    expect(validateModernEnvelope(post(headers), body)).toMatchObject({ code: HEADER_MISMATCH });
    expect(validateModernEnvelope(post({ ...headers, "Mcp-Name": "other" }), body)).toMatchObject({ code: HEADER_MISMATCH });
    expect(validateModernEnvelope(post({ ...headers, "Mcp-Name": "get_weather" }), body)).toBeNull();
  });

  it("decodes the base64 sentinel before comparing a name", () => {
    // A resource URI or a non-ASCII name arrives wrapped; comparing the wrapper
    // against the body would reject every one of them.
    const encoded = `=?base64?${Buffer.from("Hello, 世界", "utf8").toString("base64")}?=`;
    expect(decodeHeaderValue(encoded)).toBe("Hello, 世界");

    expect(validateModernEnvelope(
      post({ "MCP-Protocol-Version": VERSION, "Mcp-Method": "resources/read", "Mcp-Name": encoded }),
      { method: "resources/read", params: modernParams({ uri: "Hello, 世界" }) },
    )).toBeNull();
  });

  it("answers an unknown version with a list to retry against", () => {
    const problem = validateModernEnvelope(
      post({ "MCP-Protocol-Version": "1900-01-01", "Mcp-Method": "tools/list" }),
      { method: "tools/list", params: modernParams({}, "1900-01-01") },
    );

    // The list is the whole point: a 400 without it leaves the client stranded,
    // which is exactly how the connector used to fail.
    expect(problem).toMatchObject({ code: UNSUPPORTED_PROTOCOL_VERSION, status: 400 });
    expect((problem?.data as { supported: string[] }).supported.length).toBeGreaterThan(0);
    expect((problem?.data as { requested: string }).requested).toBe("1900-01-01");
  });
});

describe("server/discover result", () => {
  it("reports versions newest first, with identity under the meta key", () => {
    const result = discoverResult({ name: "Playbook", version: "1.0.0" }, { instructions: "Use the tools." });

    expect(result.resultType).toBe("complete");
    expect(result.supportedVersions[0]).toBe(
      [...result.supportedVersions].sort().reverse()[0],
    );
    expect(result._meta["io.modelcontextprotocol/serverInfo"]).toEqual({ name: "Playbook", version: "1.0.0" });
    expect(result.instructions).toBe("Use the tools.");
  });

  it("omits instructions rather than sending an empty one", () => {
    expect(discoverResult({ name: "P", version: "1" })).not.toHaveProperty("instructions");
  });
});
