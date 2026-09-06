import { describe, expect, it } from "vitest";
import { parseCreatePlaybookInput } from "@/lib/repositories/playbooks";

describe("canonical playbook create input", () => {
  it("normalizes the fields shared by REST and MCP", () => {
    expect(parseCreatePlaybookInput({
      name: "  RoboHorizon  ",
      is_public: true,
      tags: ["robotics", 42, "ai"],
      config: { model: "minimax" },
      persona_metadata: { language: "hu" },
      instructions: "Be precise.",
    })).toEqual({
      input: {
        name: "RoboHorizon",
        description: null,
        visibility: "public",
        config: { model: "minimax" },
        tags: ["robotics", "ai"],
        persona_name: null,
        persona_system_prompt: null,
        persona_metadata: { language: "hu" },
        instructions: "Be precise.",
      },
    });
  });

  it.each([
    [{ name: "" }, "Name is required"],
    [{ name: "x", visibility: "secret" }, "Invalid visibility"],
    [{ name: "x", instructions: 123 }, "Invalid instructions"],
  ])("rejects invalid input %#", (body, error) => {
    expect(parseCreatePlaybookInput(body)).toEqual({ error });
  });
});
