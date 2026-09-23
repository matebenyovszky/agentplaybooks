import { describe, expect, it } from "vitest";
import { serveSkill, skillResourceUri } from "./skill-extension";

const skill = {
  name: "review-code",
  description: "Review code changes safely",
  content: "---\nname: review-code\ndescription: Review code changes safely\nmetadata:\n  owner: team\n---\n\n# Review\nCheck the diff.\n",
  licence: null,
};

describe("MCP Skills extension", () => {
  it("serves verbatim frontmatter and SHA-256 manifests matching resource bytes", async () => {
    const served = await serveSkill("my-playbook", skill, [
      { filename: "references/checklist.md", content: "# Checklist\n" },
    ]);
    expect(served).not.toBeNull();
    expect(served!.entry.frontmatter).toEqual({
      name: "review-code", description: "Review code changes safely", metadata: { owner: "team" },
    });
    expect(served!.entry.uri).toBe("skill://my-playbook/review-code/SKILL.md");
    for (let index = 0; index < served!.files.length; index++) {
      const file = served!.files[index];
      const bytes = new TextEncoder().encode(file.content);
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      expect(served!.entry.resources[index]).toEqual({
        uri: file.uri,
        digest: `sha256:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")}`,
        size: bytes.byteLength,
      });
    }
  });

  it("rejects invalid paths and incomplete skills", async () => {
    expect(skillResourceUri("my-playbook", "skill://my-playbook/review-code/references/checklist.md"))
      .toEqual({ name: "review-code", path: "references/checklist.md" });
    expect(skillResourceUri("my-playbook", "skill://other/review-code/SKILL.md")).toBeNull();
    expect(skillResourceUri("my-playbook", "skill://my-playbook/review-code/../SKILL.md")).toBeNull();
    expect(await serveSkill("my-playbook", { ...skill, description: null, content: "# Body" }, [])).toBeNull();
    expect(await serveSkill("my-playbook", skill, [{ filename: "../secret", content: "no" }])).toBeNull();
  });
});
