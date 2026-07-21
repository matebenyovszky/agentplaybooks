import { describe, expect, it } from "vitest";
import { buildPlaybookUpdate } from "./playbook-access";

describe("buildPlaybookUpdate", () => {
  it("allows editors to update content fields only", () => {
    expect(buildPlaybookUpdate({
      name: "Shared name",
      description: "Shared description",
      config: { model: "test" },
      tags: ["team"],
      visibility: "public",
      is_public: true,
      user_id: "attacker",
      guid: "replacement",
    }, "editor")).toEqual({
      name: "Shared name",
      description: "Shared description",
      config: { model: "test" },
      tags: ["team"],
    });
  });

  it("allows owners to change visibility without mass assignment", () => {
    expect(buildPlaybookUpdate({
      visibility: "unlisted",
      user_id: "replacement",
    }, "owner")).toEqual({ visibility: "unlisted" });
  });
});
