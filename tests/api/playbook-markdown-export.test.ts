import { describe, expect, it } from "vitest";
import { formatAsMarkdown, type PlaybookWithExports } from "@/app/api/_shared/formatters";

/**
 * The markdown export is where a demonstration reaches a reader that cannot
 * watch anything. The document itself carries the same references as YAML
 * frontmatter, which only a client that already knows the key will look at, so
 * this rendered form is what makes the recordings visible to everyone else.
 */

const DOOR_SKILL = [
  "---",
  "name: open-fire-door",
  "description: Opening a fire door by its handle, two-handed",
  "demonstrations:",
  "  - provider: youtube",
  "    ref: https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "    title: Two-handed open",
  "    segments:",
  "      - { start: 134, end: 158, label: grip the handle, comment: from below }",
  "      - { start: 158, label: shift your weight }",
  "  - provider: hf_dataset",
  "    ref: example-lab/fire-door-push@a1b2c3d",
  "---",
  "",
  "## Procedure",
  "",
  "1. Stand 60 cm from the hinge.",
  "",
].join("\n");

function playbook(skills: Array<Record<string, unknown>>): PlaybookWithExports {
  return {
    name: "Facilities robot",
    guid: "facilities-robot",
    description: "Building tasks for a mobile manipulator",
    skills,
    mcp_servers: [],
  } as unknown as PlaybookWithExports;
}

describe("demonstrations in the markdown export", () => {
  it("renders every recording with links a text-only reader can follow", () => {
    const md = formatAsMarkdown(playbook([
      { name: "open-fire-door", description: "Opening a fire door", content: DOOR_SKILL },
    ]));

    expect(md).toContain("#### Demonstrations");
    expect(md).toContain("**Two-handed open**");
    // The pasted watch URL was normalized to an id before the link was built.
    expect(md).toContain("[2:14–2:38](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=134s)");
    expect(md).toContain("**grip the handle**");
    expect(md).toContain("from below");
    expect(md).toContain("https://huggingface.co/datasets/example-lab/fire-door-push/tree/a1b2c3d");
  });

  it("says the recordings are performed in order", () => {
    const md = formatAsMarkdown(playbook([
      { name: "open-fire-door", description: "Opening a fire door", content: DOOR_SKILL },
    ]));

    expect(md).toContain("Performed in the order listed.");
    expect(md.indexOf("1. **Two-handed open**")).toBeLessThan(md.indexOf("2. **Demonstration 2**"));
  });

  it("puts the rendered form above the raw document", () => {
    const md = formatAsMarkdown(playbook([
      { name: "open-fire-door", description: "Opening a fire door", content: DOOR_SKILL },
    ]));

    expect(md.indexOf("#### Demonstrations")).toBeLessThan(md.indexOf("**Content:**"));
  });

  it("leaves a text-only skill exactly as it was", () => {
    const plain = "---\nname: write-report\ndescription: Write it up\n---\n\n# Report\n";
    const md = formatAsMarkdown(playbook([
      { name: "write-report", description: "Write it up", content: plain },
    ]));

    expect(md).not.toContain("Demonstrations");
    expect(md).toContain("**Content:**");
  });

  it("does not let one malformed entry take the export down", () => {
    const broken = [
      "---",
      "name: broken",
      "description: Has one good and one bad reference",
      "demonstrations:",
      "  - provider: vimeo",
      "    ref: '12345'",
      "  - provider: youtube",
      "    ref: dQw4w9WgXcQ",
      "---",
      "",
      "# Broken",
      "",
    ].join("\n");

    const md = formatAsMarkdown(playbook([
      { name: "broken", description: "Has one good and one bad reference", content: broken },
    ]));

    expect(md).toContain("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(md).toContain("# Facilities robot");
    expect(md).toContain("**Content:**");
  });
});
