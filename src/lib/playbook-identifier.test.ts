import { describe, expect, it } from "vitest";
import { matchesPlaybook, playbookIdentifierColumn } from "./playbook-identifier";

const playbook = { id: "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b", guid: "a1b2c3d4e5f60718" };

describe("playbook identifiers", () => {
  it("routes a UUID to the id column and anything else to guid", () => {
    expect(playbookIdentifierColumn(playbook.id)).toBe("id");
    expect(playbookIdentifierColumn(playbook.id.toUpperCase())).toBe("id");
    expect(playbookIdentifierColumn(playbook.guid)).toBe("guid");
    // Some playbooks carry a readable GUID rather than hex.
    expect(playbookIdentifierColumn("office-skills")).toBe("guid");
  });

  it("matches a playbook by either identifier and nothing else", () => {
    expect(matchesPlaybook(playbook, playbook.guid)).toBe(true);
    expect(matchesPlaybook(playbook, playbook.id)).toBe(true);
    expect(matchesPlaybook(playbook, "f0e1d2c3b4a59687")).toBe(false);
    expect(matchesPlaybook(playbook, undefined)).toBe(false);
    expect(matchesPlaybook(null, playbook.guid)).toBe(false);
  });
});
