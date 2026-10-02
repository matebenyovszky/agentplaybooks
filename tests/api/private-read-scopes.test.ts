import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actorMayRead, type PrivatePlaybookActor } from "@/app/api/_shared/auth";
import { PLAYBOOK_TOOLS } from "@/app/api/_shared/playbook-tools";
import {
  NO_DATA_TOOLS,
  READ_TOOL_PERMISSIONS,
  readPermissionForResource,
} from "@/app/api/_shared/private-read-scopes";

const key = (permissions: string[], role = "coworker"): PrivatePlaybookActor => ({ kind: "playbook_key", role, permissions });

describe("actorMayRead", () => {
  it("lets public playbooks, owners and editors, admin and full keys read everything", () => {
    for (const actor of [null, { kind: "member" } as const, key([], "admin"), key(["full"])]) {
      expect(actorMayRead(actor, "memory:read")).toBe(true);
      expect(actorMayRead(actor, "skills:read")).toBe(true);
    }
  });

  it("keeps a memory:read key's old access to every private read", () => {
    const legacy = key(["memory:read", "memory:write"]);
    for (const permission of ["memory:read", "skills:read", "canvas:read", "playbooks:read", "personas:read"]) {
      expect(actorMayRead(legacy, permission)).toBe(true);
    }
  });

  it("gives a write-only key no reads, and a scoped key only its scope", () => {
    for (const writeOnly of [key(["memory:write"]), key(["skills:write"]), key(["proposals:write"], "proposer"), key(["secrets:read"])]) {
      expect(actorMayRead(writeOnly, "memory:read")).toBe(false);
      expect(actorMayRead(writeOnly, "skills:read")).toBe(false);
    }
    const skillsOnly = key(["skills:read", "skills:write"]);
    expect(actorMayRead(skillsOnly, "skills:read")).toBe(true);
    expect(actorMayRead(skillsOnly, "memory:read")).toBe(false);
    expect(actorMayRead(skillsOnly, "canvas:read")).toBe(false);
  });
});

describe("read scope table", () => {
  // The tools/call switch of the playbook MCP endpoint, case by case. A case
  // with no body falls through to the next one and shares its body.
  function toolCases(): Map<string, string> {
    const source = readFileSync("src/app/api/mcp/[guid]/route.ts", "utf8");
    const section = source.slice(source.indexOf("switch (toolName) {"));
    const parts = section.split(/\n\s*case "([a-z_]+)":/);
    const cases = new Map<string, string>();
    let pending: string[] = [];
    for (let i = 1; i < parts.length; i += 2) {
      const name = parts[i];
      const body = parts[i + 1] ?? "";
      if (body.trim() === "") { pending.push(name); continue; }
      for (const label of [...pending, name]) cases.set(label, body);
      pending = [];
    }
    return cases;
  }

  it("checks every playbook tool: in its own case, or through the read scope table", () => {
    const cases = toolCases();
    const unchecked = PLAYBOOK_TOOLS.map((tool) => tool.name).filter((name) => {
      if (name in READ_TOOL_PERMISSIONS || NO_DATA_TOOLS.has(name)) return false;
      const body = cases.get(name);
      return !body || !/validateApiKey\(|validatePlaybookCredential\(/.test(body);
    });
    expect(unchecked).toEqual([]);
  });

  it("names only real tools", () => {
    for (const name of [...Object.keys(READ_TOOL_PERMISSIONS), ...NO_DATA_TOOLS]) {
      expect(PLAYBOOK_TOOLS.some((tool) => tool.name === name), name).toBe(true);
    }
  });
});

describe("readPermissionForResource", () => {
  it("maps every data resource the way resources/read matches it, whatever the prefix", () => {
    expect(readPermissionForResource("skill://guid/release/SKILL.md")).toBe("skills:read");
    expect(readPermissionForResource("playbook://guid/memory")).toBe("memory:read");
    expect(readPermissionForResource("playbook://another-guid/memory")).toBe("memory:read");
    expect(readPermissionForResource("playbook://guid/personas")).toBe("personas:read");
    expect(readPermissionForResource("playbook://guid/skills")).toBe("skills:read");
    expect(readPermissionForResource("playbook://guid/skills/s1/attachments/a1")).toBe("skills:read");
    expect(readPermissionForResource("playbook://guid/canvas")).toBe("canvas:read");
    expect(readPermissionForResource("playbook://guid/canvas/doc-1")).toBe("canvas:read");
    expect(readPermissionForResource("playbook://guid/guide")).toBeNull();
  });
});
