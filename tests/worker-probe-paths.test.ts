import { describe, expect, it } from "vitest";
import { rejectProbeRequest } from "@/worker/probe-paths";

describe("unused probe paths", () => {
  it.each(["/_ignition/execute-solution", "/_profiler/phpinfo", "/_debugbar/open", "/phpinfo", "/phpinfo.php", "/.env", "/.env.production.local", "/.git/config", "/%2eenv", "/.aws/credentials", "/vendor/composer/installed.json", "/wp-content/debug.log", "/credentials.json", "/config.yaml", "/database.sql", "/ENV.TXT"])('cheaply refuses %s', async (path) => {
    const response = rejectProbeRequest(new Request(`https://example.com${path}?scan=1`, { method: "POST" }));
    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Not Found");
    expect(response?.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it.each(["/", "/api/mcp/manage", "/api/mcp/.env", "/api/playbooks/id/canvas/phpinfo.php", "/api/playbooks/id/memory/config.yaml", "/.well-known/oauth-protected-resource/api/mcp/id", "/.well-known/skills", "/docs/worker-api-performance", "/_next/static/chunk.js", "/vendor/valid.json", "/config.yaml/document"])('preserves legitimate routes and arbitrary API identifiers at %s', (path) => {
    expect(rejectProbeRequest(new Request(`https://example.com${path}`))).toBeNull();
  });
  it("returns no body for HEAD", () => {
    expect(rejectProbeRequest(new Request("https://example.com/.env", { method: "HEAD" }))?.body).toBeNull();
  });
});
