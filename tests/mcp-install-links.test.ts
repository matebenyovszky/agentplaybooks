import { describe, expect, it } from "vitest";
import {
  claudeCodeAddCommand,
  cursorInstallLink,
  httpServerDefinition,
  mcpEntryName,
  vscodeInstallLink,
} from "@/lib/mcp-install-links";

// A deeplink fails by opening the editor's install dialog with nothing usable in
// it, and nothing reports why. So the encodings are asserted, not eyeballed.

const ENDPOINT = "https://agentplaybooks.ai/api/mcp/011d8a7fa0ec4016";

describe("mcpEntryName", () => {
  it("keeps the short prefix Cursor's 60-character limit needs", () => {
    expect(mcpEntryName("My Team Playbook")).toBe("apb-my-team-playbook");
  });

  it("truncates a long name and never leaves a dangling separator", () => {
    expect(mcpEntryName("a".repeat(60))).toBe(`apb-${"a".repeat(30)}`);
    expect(mcpEntryName("Release notes!")).toBe("apb-release-notes");
    expect(mcpEntryName("!!!")).toBe("apb-playbook");
    expect(mcpEntryName(null)).toBe("apb-playbook");
  });
});

describe("httpServerDefinition", () => {
  it("carries the URL and no credential — the endpoint signs the user in with OAuth", () => {
    expect(httpServerDefinition(ENDPOINT)).toEqual({ type: "http", url: ENDPOINT });
  });
});

describe("cursorInstallLink", () => {
  it("carries the definition as base64 the deeplink can round-trip", () => {
    const definition = httpServerDefinition(ENDPOINT);
    const link = cursorInstallLink("apb-dev", definition);

    expect(link.startsWith("cursor://anysphere.cursor-deeplink/mcp/install?")).toBe(true);
    const params = new URL(link).searchParams;
    expect(params.get("name")).toBe("apb-dev");
    expect(JSON.parse(Buffer.from(params.get("config") ?? "", "base64").toString("utf8"))).toEqual(definition);
  });
});

describe("vscodeInstallLink", () => {
  it("puts the entry name inside the encoded object, as VS Code expects", () => {
    const definition = httpServerDefinition(ENDPOINT);
    const link = vscodeInstallLink("apb-dev", definition);

    expect(link.startsWith("vscode:mcp/install?")).toBe(true);
    expect(JSON.parse(decodeURIComponent(link.slice("vscode:mcp/install?".length)))).toEqual({
      name: "apb-dev",
      ...definition,
    });
  });

  it("encodes the payload so a URL parser cannot split it into parameters", () => {
    const link = vscodeInstallLink("apb-dev", httpServerDefinition(ENDPOINT));
    expect(link).not.toContain("&");
    expect(link).not.toContain('"');
  });
});

describe("claudeCodeAddCommand", () => {
  it("names the HTTP transport, which Claude Code does not infer from a URL", () => {
    expect(claudeCodeAddCommand("apb-dev", ENDPOINT)).toBe(`claude mcp add --transport http apb-dev ${ENDPOINT}`);
  });
});
