import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PORTABLE_SNAPSHOT_FORMAT, validatePortableSnapshot } from "@/lib/portable-snapshot";

function file(path: string, value: string | Buffer) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return { path, content: bytes.toString("base64"), sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
}

function snapshot(...files: ReturnType<typeof file>[]) {
  return { format: PORTABLE_SNAPSHOT_FORMAT, files: [file("agentplaybook.json", "{}"), ...files] };
}

describe("portable backup validation", () => {
  it("accepts a complete portable snapshot with binary assets and reference-only MCP", () => {
    const value = snapshot(
      file(".agents/skills/release/SKILL.md", "---\nname: release\ndescription: Release\n---\n"),
      file(".agents/skills/release/assets/logo.bin", Buffer.from([0, 255, 1])),
      file(".agents/mcp.json", JSON.stringify({ mcpServers: { docs: { url: "https://example.com/mcp", headers: { Authorization: "Bearer ${DOCS_TOKEN}" } } } })),
    );
    expect(validatePortableSnapshot(value).digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects traversal, duplicate paths, and tampered contents", () => {
    expect(() => validatePortableSnapshot(snapshot(file(".agents/skills/x/../escape", "bad")))).toThrow(/Unsafe/);
    expect(() => validatePortableSnapshot(snapshot(file("AGENTS.md", "ok"), file("AGENTS.md", "again")))).toThrow(/duplicate/);
    const tampered = snapshot(file("AGENTS.md", "ok"));
    tampered.files[1].content = Buffer.from("changed").toString("base64");
    expect(() => validatePortableSnapshot(tampered)).toThrow(/Checksum/);
  });

  it("rejects literal credential values even when a client bypasses the CLI", () => {
    expect(() => validatePortableSnapshot(snapshot(file("AGENTS.md", 'api_key = "sk-ABCDEFGHIJKLMNOPQRSTUVWX1234"')))).toThrow(/credential/);
    const mcp = JSON.stringify({ mcpServers: { docs: { headers: { Authorization: "Bearer actual-token" } } } });
    expect(() => validatePortableSnapshot(snapshot(file(".agents/mcp.json", mcp)))).toThrow(/credential/);
  });
});
