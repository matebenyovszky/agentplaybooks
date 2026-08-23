import { describe, expect, it } from "vitest";
import { buildAgentGuide, exampleArgumentsFor } from "@/app/api/_shared/llms-guide";
import { PLAYBOOK_TOOLS } from "@/app/api/_shared/playbook-tools";
import type { MCPServer } from "@/lib/supabase/types";

/**
 * The one-fetch guide exists so a code-executing agent can go from a bare URL
 * to a working call in a single read. The properties that matter: the calling
 * convention appears with runnable examples, every tool gets a one-shot body
 * derived from its own schema, and nothing secret-shaped leaks into a page
 * that public playbooks serve unauthenticated.
 */

const SERVER: MCPServer = {
  id: "12345678-1234-1234-1234-123456789abc",
  playbook_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  publisher_id: null,
  name: "Supabase",
  description: null,
  tools: [{ name: "execute_sql", description: "Run SQL", inputSchema: { type: "object" } }],
  resources: [],
  transport_type: "http",
  transport_config: { url: "https://mcp.example.com/rpc", auth: { type: "bearer", token_secret: "SUPABASE_TOKEN" } },
  created_at: "2026-08-01T00:00:00.000Z",
};

function guide() {
  return buildAgentGuide({
    baseUrl: "https://agentplaybooks.ai",
    guid: "abc123",
    playbookName: "Demo",
    description: "A demo playbook",
    tools: PLAYBOOK_TOOLS,
    servers: [SERVER],
  });
}

describe("one-shot examples from schemas", () => {
  it("fills exactly the required properties", () => {
    const readMemory = PLAYBOOK_TOOLS.find((tool) => tool.name === "read_memory")!;
    expect(exampleArgumentsFor(readMemory)).toEqual({ key: "example-key" });
  });

  it("prefers an enum's first value over a placeholder", () => {
    const example = exampleArgumentsFor({
      name: "x",
      description: "",
      inputSchema: {
        type: "object",
        properties: { tier: { type: "string", enum: ["working", "longterm"] } },
        required: ["tier"],
      },
    });
    expect(example).toEqual({ tier: "working" });
  });

  it("shapes placeholders by type", () => {
    const example = exampleArgumentsFor({
      name: "x",
      description: "",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          tags: { type: "array", items: { type: "string" } },
          dry_run: { type: "boolean" },
        },
        required: ["limit", "tags", "dry_run"],
      },
    });
    expect(example).toEqual({ limit: 10, tags: ["example-tags"], dry_run: true });
  });
});

describe("the guide itself", () => {
  it("leads with the calling convention and runnable examples", () => {
    const text = guide();
    expect(text).toContain("POST https://agentplaybooks.ai/api/mcp/abc123/tools/TOOL_NAME");
    expect(text).toContain("curl -s -X POST");
    expect(text).toContain("import os, requests");
    // The key comes from the environment in both examples, never inline.
    expect(text).toContain("$APBKS_KEY");
    expect(text).toContain("os.environ[\"APBKS_KEY\"]");
  });

  it("gives every built-in tool a one-shot example body", () => {
    const text = guide();
    for (const tool of PLAYBOOK_TOOLS) {
      expect(text, tool.name).toContain(`### ${tool.name}`);
    }
    // One fenced example per tool, plus the curl/python/json/text blocks up top.
    expect((text.match(/```json/g) || []).length).toBe(PLAYBOOK_TOOLS.length);
  });

  it("names federated tools under their readable prefix", () => {
    expect(guide()).toContain("supabase__execute_sql");
  });

  it("mentions both credential headers and the toolset views", () => {
    const text = guide();
    expect(text).toContain("X-API-Key");
    expect(text).toContain("Authorization");
    expect(text).toContain("?toolset=runtime|memory|admin");
    expect(text).toContain("find_tools");
  });

  it("does not leak secret names or transport internals", () => {
    const text = guide();
    expect(text).not.toContain("SUPABASE_TOKEN");
    expect(text).not.toContain("mcp.example.com");
  });
});
