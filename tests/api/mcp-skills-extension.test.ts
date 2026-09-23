import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/[guid]/route";
import { getSupabase, getServiceSupabase } from "@/app/api/_shared/supabase";

vi.mock("@/app/api/_shared/supabase", () => ({ getSupabase: vi.fn(), getServiceSupabase: vi.fn() }));

const playbook = { id: "pb-1", name: "Review", description: "Review code" };
const skill = { id: "s-1", name: "review-code", description: "Review code safely", content: "# Review\nCheck code.", licence: null };
const attachment = { skill_id: "s-1", filename: "references/checklist.md", content: "# Checklist\n" };

function client() {
  return {
    from(table: string) {
      const builder = {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        async maybeSingle() { return { data: playbook, error: null }; },
        async order() {
          return { data: table === "skills" ? [skill] : table === "skill_attachments" ? [attachment] : [], error: null };
        },
      };
      return builder;
    },
  };
}

async function request(method: string, params: Record<string, unknown> = {}) {
  const uri = params.uri as string | undefined;
  const response = await POST(new Request("http://localhost/api/mcp/review-guid", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
      ...(method === "resources/read" && uri ? { "Mcp-Name": uri } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method,
      params: { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } },
    }),
  }));
  return response.json();
}

describe("playbook MCP Skills extension", () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReturnValue(client() as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(getServiceSupabase).mockReturnValue(client() as unknown as ReturnType<typeof getServiceSupabase>);
  });

  it("advertises the extension and lists complete skill manifests", async () => {
    const discovery = await request("server/discover");
    expect(discovery.result.capabilities.extensions["io.modelcontextprotocol/skills"]).toEqual({});
    const listed = await request("skills/list");
    expect(listed.result.resultType).toBe("complete");
    expect(listed.result.skills).toHaveLength(1);
    expect(listed.result.skills[0].resources).toHaveLength(2);
    expect(listed.result.skills[0].frontmatter.name).toBe("review-code");
  });

  it("gets exactly one skill and reads bytes matching its manifest", async () => {
    const uri = "skill://review-guid/review-code/SKILL.md";
    const got = await request("skills/get", { uri });
    expect(got.result.skill.uri).toBe(uri);
    const read = await request("resources/read", { uri });
    const content = read.result.contents[0].text as string;
    const bytes = new TextEncoder().encode(content);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const digest = `sha256:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")}`;
    expect(got.result.skill.resources[0]).toMatchObject({ uri, digest, size: bytes.length });
    expect((await request("skills/get", { uri: "skill://review-guid/missing/SKILL.md" })).error.code).toBe(-32602);
  });
});
