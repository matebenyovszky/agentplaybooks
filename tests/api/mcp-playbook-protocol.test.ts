import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/mcp/[guid]/route";
import { privateAccessRefusal } from "@/app/api/_shared/mcp-protocol";

/**
 * Transport-level conformance for the playbook MCP endpoint — the one people
 * paste into a client as a connector. These are the rules a conforming client
 * checks before it will talk to the server at all, and getting one wrong makes
 * the whole endpoint look unreachable even though every tool works.
 */

const GUID = "playbook-guid";

function mcpRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/mcp/${GUID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", ...body }),
  });
}

describe("AgentPlaybooks playbook MCP transport", () => {
  it("declines a server-to-client stream with 405 instead of serving the manifest", async () => {
    const response = await GET(new Request(`http://localhost/api/mcp/${GUID}`, {
      headers: { Accept: "text/event-stream" },
    }));

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(await response.text()).toBe("");
  });

  it("answers a notification with 202 and no body", async () => {
    const response = await POST(mcpRequest({ method: "notifications/initialized" }));

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("treats any notifications/* method as a notification, id or not", async () => {
    const response = await POST(mcpRequest({ method: "notifications/cancelled", params: {} }));

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("still answers a request that carries an explicit null id", async () => {
    // The spec forbids `id: null` in a request, but a client sending it is
    // waiting for an answer, so it must not be silently swallowed as a
    // notification.
    const response = await POST(mcpRequest({ id: null, method: "ping" }));

    expect(response.status).not.toBe(202);
  });

  it("rejects a protocol revision it cannot speak", async () => {
    const response = await POST(
      mcpRequest({ id: 1, method: "initialize", params: {} }, { "MCP-Protocol-Version": "1999-01-01" }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Unsupported MCP protocol version");
  });
});

/**
 * A private playbook has to be distinguishable from a missing one. 404 tells a
 * client "nothing here", so a connector reports the server as unreachable
 * instead of asking for a credential — and a client probes the URL before it
 * applies any header. The route wiring needs a database, so the decision itself
 * is covered here and the wiring is verified against the deployed endpoint.
 */
describe("private playbook refusal", () => {
  it("challenges a caller that sent no credential", () => {
    const refusal = privateAccessRefusal(new Request("http://localhost/api/mcp/x"));

    expect(refusal.status).toBe(401);
    expect(refusal.headers["WWW-Authenticate"]).toContain("Bearer");
    expect(refusal.message).toContain("private");
  });

  it("tells a rejected credential which permission it lacks, without a challenge", () => {
    const refusal = privateAccessRefusal(new Request("http://localhost/api/mcp/x", {
      headers: { Authorization: "Bearer apb_wrong" },
    }));

    // 401 would invite the client to retry the same key forever.
    expect(refusal.status).toBe(403);
    expect(refusal.headers["WWW-Authenticate"]).toBeUndefined();
    expect(refusal.message).toContain("memory:read");
    expect(refusal.message).toContain("playbooks:read");
  });
});
