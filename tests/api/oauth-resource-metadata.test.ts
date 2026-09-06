import { describe, expect, it } from "vitest";
import { GET as getRootMetadata } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as getManageMetadata } from "@/app/.well-known/oauth-protected-resource/api/mcp/manage/route";

describe("OAuth protected resource metadata", () => {
  it.each([getRootMetadata, getManageMetadata])("advertises Supabase OAuth for the management MCP", async (handler) => {
    const response = await handler(new Request("https://agentplaybooks.ai/.well-known/oauth-protected-resource"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(payload).toEqual(expect.objectContaining({
      resource: "https://agentplaybooks.ai/api/mcp/manage",
      resource_name: "AgentPlaybooks Management",
      authorization_servers: ["https://mock.supabase.co/auth/v1"],
      scopes_supported: ["openid", "email", "profile"],
      bearer_methods_supported: ["header"],
    }));
  });
});
