import { describe, expect, it } from "vitest";
import { PLAYBOOK_TOOLS } from "@/app/api/_shared/playbook-tools";
import { ACCOUNT_TOOLS } from "@/app/api/_shared/account-tools";
import { STRUCTURED_RESULT_KEYS, structuredToolResult } from "@/app/api/_shared/mcp-tool-hints";

/**
 * What every tool definition must hold for a strict client to accept us.
 *
 * Hermes Agent validates the entire ListToolsResult with pydantic: three tools
 * whose outputSchema was a top-level array produced "3 validation errors", the
 * connection parked, and the server offered nothing at all. The MCP spec types
 * `structuredContent` as an object, so an output schema must be `type:
 * "object"` — and a tool that declares one must actually return structured
 * content, because the same client validates call results against the promise.
 */

const ALL_TOOLS = [...PLAYBOOK_TOOLS, ...ACCOUNT_TOOLS];

type SchemaLike = { type?: unknown } | undefined;

describe("tool schema conformance", () => {
  it("declares every input schema as an object", () => {
    for (const tool of ALL_TOOLS) {
      expect((tool.inputSchema as SchemaLike)?.type, tool.name).toBe("object");
    }
  });

  it("declares every output schema as an object, never an array", () => {
    for (const tool of ALL_TOOLS) {
      const schema = (tool as { outputSchema?: SchemaLike }).outputSchema;
      if (!schema) continue;
      expect(schema.type, `${tool.name} outputSchema must be type "object"`).toBe("object");
    }
  });

  it("wraps every list tool's schema under its declared property", () => {
    for (const [toolName, key] of Object.entries(STRUCTURED_RESULT_KEYS)) {
      const tool = ALL_TOOLS.find((candidate) => candidate.name === toolName);
      if (!tool) continue; // a key may outlive a tool; the reverse is the bug
      const schema = (tool as { outputSchema?: { properties?: Record<string, unknown>; required?: string[] } }).outputSchema;
      expect(schema?.properties?.[key], `${toolName} schema must wrap rows under "${key}"`).toBeDefined();
      expect(schema?.required, toolName).toContain(key);
    }
  });
});

describe("structured results honour the declared schema", () => {
  it("wraps a list result under its property", () => {
    const rows = [{ id: "1", name: "a" }];
    expect(structuredToolResult(PLAYBOOK_TOOLS, "list_skills", rows)).toEqual({ skills: rows });
  });

  it("passes an object result through", () => {
    const record = { key: "k", value: "v" };
    expect(structuredToolResult(PLAYBOOK_TOOLS, "read_memory", record)).toEqual(record);
  });

  it("returns null for a tool with no output schema, so no structuredContent is sent", () => {
    expect(structuredToolResult(PLAYBOOK_TOOLS, "delete_memory", { success: true })).toBeNull();
  });

  it("refuses to emit a value the declared object schema would refute", () => {
    // A non-object result under an object schema is worse than none at all.
    expect(structuredToolResult(PLAYBOOK_TOOLS, "read_memory", "just text")).toBeNull();
  });
});

/**
 * What the Claude Connectors Directory checks, encoded so tool number 49
 * cannot slip through without it.
 *
 * The submission portal syncs the tool list from the live server and flags any
 * tool missing a title or annotations; those have to be fixed on the server
 * before a connector can be submitted at all. Its review criteria also cap tool
 * names at 64 characters.
 *
 * See https://claude.com/docs/connectors/building/review-criteria
 */
describe("connectors directory requirements", () => {
  it("gives every tool a human-readable title", () => {
    for (const tool of ALL_TOOLS) {
      const title = (tool as { title?: string }).title;
      expect(title, `${tool.name} needs a title`).toBeTruthy();
      expect(title, `${tool.name}'s title should read as a label, not repeat the name`).not.toBe(tool.name);
    }
  });

  it("declares both hints on every tool, so the applicable one is never absent", () => {
    // A reviewer reads "the applicable hint" off the annotations, and an absent
    // boolean is not the same claim as `false`: MCP defaults `destructiveHint`
    // to *true*, so a write tool that says nothing is read as destructive.
    for (const tool of ALL_TOOLS) {
      expect(typeof tool.annotations?.readOnlyHint, `${tool.name} readOnlyHint`).toBe("boolean");
      expect(typeof tool.annotations?.destructiveHint, `${tool.name} destructiveHint`).toBe("boolean");
    }
  });

  it("never marks a tool both read-only and destructive", () => {
    for (const tool of ALL_TOOLS) {
      const { readOnlyHint, destructiveHint } = tool.annotations ?? {};
      expect(readOnlyHint && destructiveHint, `${tool.name} claims both`).toBeFalsy();
    }
  });

  it("keeps every tool name within the 64-character limit", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name.length, `${tool.name} is ${tool.name.length} characters`).toBeLessThanOrEqual(64);
    }
  });
});

/**
 * The read/write split on the secret proxy.
 *
 * "A single tool that accepts both safe HTTP methods (GET, HEAD, OPTIONS) and
 * unsafe methods (POST, PUT, PATCH, DELETE) is rejected. Do not ship a
 * catch-all `api_request` tool with a `method` parameter." Documenting the
 * difference in the description explicitly does not satisfy it, which is what
 * the single `use_secret` used to do.
 */
describe("secret proxy read/write split", () => {
  const SAFE = ["GET", "HEAD", "OPTIONS"];

  function methodsOf(name: string): string[] {
    const tool = ALL_TOOLS.find((candidate) => candidate.name === name);
    expect(tool, `${name} must exist`).toBeDefined();
    const schema = tool!.inputSchema as { properties?: { method?: { enum?: string[] } } };
    return schema.properties?.method?.enum ?? [];
  }

  it("offers only safe methods on the read tool", () => {
    const methods = methodsOf("use_secret");
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) expect(SAFE, `use_secret offers ${method}`).toContain(method);
  });

  it("offers only unsafe methods on the write tool", () => {
    const methods = methodsOf("use_secret_write");
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) expect(SAFE, `use_secret_write offers ${method}`).not.toContain(method);
  });

  it("shares no method between the two, so neither is a catch-all", () => {
    const overlap = methodsOf("use_secret").filter((method) => methodsOf("use_secret_write").includes(method));
    expect(overlap).toEqual([]);
  });

  it("annotates the read as read-only and the write as destructive", () => {
    const read = ALL_TOOLS.find((tool) => tool.name === "use_secret")!;
    const write = ALL_TOOLS.find((tool) => tool.name === "use_secret_write")!;
    expect(read.annotations?.readOnlyHint).toBe(true);
    expect(read.annotations?.destructiveHint).toBe(false);
    expect(write.annotations?.readOnlyHint).toBe(false);
    expect(write.annotations?.destructiveHint).toBe(true);
    // Both reach the open internet; that is orthogonal to whether they mutate.
    expect(read.annotations?.openWorldHint).toBe(true);
    expect(write.annotations?.openWorldHint).toBe(true);
  });
});
