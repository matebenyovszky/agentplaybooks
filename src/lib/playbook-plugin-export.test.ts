import { describe, expect, it } from "vitest";
import type { Playbook, Skill, SkillAttachment } from "@/lib/supabase/types";
import { buildPlaybookPluginZip } from "@/lib/playbook-plugin-export";

const playbook = {
  guid: "11111111-2222-3333-4444-555555555555",
  name: "Release Bridge",
  description: "Portable release process",
  visibility: "private",
  persona_system_prompt: "You are a release assistant.",
  instructions: "Review each store before publishing.",
} as Playbook;

const skill = {
  id: "skill-1",
  name: "release-check",
  description: "Check a release.",
  content: "Review the release state.",
  licence: "MIT",
} as Skill;

describe("playbook Agent Plugin export", () => {
  it("packages a valid portable manifest, MCP connection, complete skill tree, and no backup data", async () => {
    const attachments = new Map<string, SkillAttachment[]>([["skill-1", [{
      filename: "references/checklist.md",
      content: "# Checklist\n",
    } as SkillAttachment]]]);
    const zip = buildPlaybookPluginZip(playbook, [skill], attachments, new Date("2026-09-24T12:00:00Z"));
    const manifest = JSON.parse(await zip.file("plugin.json")!.async("string"));
    const mcp = JSON.parse(await zip.file("mcp.json")!.async("string"));
    expect(manifest.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(manifest.name).toBe("release-bridge-11111111");
    expect(manifest.extensions["ai.agentplaybooks"].playbookGuid).toBe(playbook.guid);
    expect(mcp.mcpServers["agentplaybooks-account"].type).toBe("streamable-http");
    expect(await zip.file("skills/release-check/SKILL.md")!.async("string")).toContain("name: release-check");
    expect(await zip.file("skills/release-check/references/checklist.md")!.async("string")).toBe("# Checklist\n");
    expect(zip.file("memories.json")).toBeNull();
    expect(zip.file("runs.json")).toBeNull();
    expect(zip.file("secrets.json")).toBeNull();
  });

  it("refuses likely literal credentials in skill content", () => {
    const unsafe = { ...skill, content: 'api_key = "sk-ABCDEFGHIJKLMNOPQRSTUVWX1234"' };
    expect(() => buildPlaybookPluginZip(playbook, [unsafe], new Map())).toThrow(/titok/);
  });

  it("refuses missing skill attachments instead of silently producing a partial package", () => {
    const unsafe = new Map<string, SkillAttachment[]>([["skill-1", [{ filename: "../leak.txt", content: "x" } as SkillAttachment]]]);
    expect(() => buildPlaybookPluginZip(playbook, [skill], unsafe)).toThrow(/melléklet/);
  });
});
