import { describe, expect, it } from "vitest";
import {
  DEMONSTRATION_LIMITS,
  demonstrationUrl,
  episodeTimeBound,
  formatTimestamp,
  normalizeYouTubeRef,
  parseDemonstrations,
  prepareMemoryMetadata,
  readMemoryRecording,
  readSkillDemonstrations,
  renderDemonstrationsMarkdown,
  skillDemonstrationsMarkdown,
} from "@/lib/demonstrations";

function skill(frontmatter: string, body = "## Procedure\n\n1. Stand clear.\n"): string {
  return `---\n${frontmatter}\n---\n\n${body}`;
}

describe("YouTube reference normalization", () => {
  it("keeps a bare video id", () => {
    expect(normalizeYouTubeRef("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from every shape a browser hands you", () => {
    const cases = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=134s",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?t=134",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    ];
    for (const value of cases) {
      expect(normalizeYouTubeRef(value), value).toBe("dQw4w9WgXcQ");
    }
  });

  it("leaves an unrelated URL alone so validation can reject it", () => {
    expect(normalizeYouTubeRef("https://vimeo.com/12345")).toBe("https://vimeo.com/12345");
  });
});

describe("parsing demonstrations", () => {
  it("fills in the defaults a plain video entry omits", () => {
    const { demonstrations, errors } = parseDemonstrations([
      { provider: "youtube", ref: "dQw4w9WgXcQ" },
    ]);
    expect(errors).toEqual([]);
    expect(demonstrations).toEqual([
      { provider: "youtube", ref: "dQw4w9WgXcQ", fidelity: "video", role: "demonstration", segments: [] },
    ]);
  });

  it("defaults a dataset reference to sensorimotor fidelity", () => {
    const { demonstrations } = parseDemonstrations([
      { provider: "hf_dataset", ref: "example-lab/fire-door-push@a1b2c3d" },
    ]);
    expect(demonstrations[0].fidelity).toBe("sensorimotor");
  });

  it("accepts an explicit fidelity that contradicts the provider default", () => {
    const { demonstrations, errors } = parseDemonstrations([
      { provider: "hf_dataset", ref: "example-lab/fire-door-push", fidelity: "video" },
    ]);
    expect(errors).toEqual([]);
    expect(demonstrations[0].fidelity).toBe("video");
  });

  it("normalizes a pasted watch URL into an id", () => {
    const { demonstrations } = parseDemonstrations([
      { provider: "youtube", ref: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s" },
    ]);
    expect(demonstrations[0].ref).toBe("dQw4w9WgXcQ");
  });

  it("orders segments by start time regardless of how they were written", () => {
    const { demonstrations } = parseDemonstrations([
      {
        provider: "youtube",
        ref: "dQw4w9WgXcQ",
        segments: [{ start: 158 }, { start: 12 }, { start: 134, end: 158 }],
      },
    ]);
    expect(demonstrations[0].segments.map((s) => s.start)).toEqual([12, 134, 158]);
  });

  it("treats a single object as a one-entry list", () => {
    const { demonstrations } = parseDemonstrations({ provider: "youtube", ref: "dQw4w9WgXcQ" });
    expect(demonstrations).toHaveLength(1);
  });

  it("reads seconds written as a string", () => {
    const { demonstrations, errors } = parseDemonstrations([
      { provider: "youtube", ref: "dQw4w9WgXcQ", segments: [{ start: "134", end: "158" }] },
    ]);
    expect(errors).toEqual([]);
    expect(demonstrations[0].segments[0]).toEqual({ start: 134, end: 158 });
  });

  it("collapses whitespace in labels and comments", () => {
    const { demonstrations } = parseDemonstrations([
      {
        provider: "youtube",
        ref: "dQw4w9WgXcQ",
        segments: [{ start: 1, label: "  grip   the\nhandle  ", comment: " from\tbelow " }],
      },
    ]);
    expect(demonstrations[0].segments[0].label).toBe("grip the handle");
    expect(demonstrations[0].segments[0].comment).toBe("from below");
  });

  it("returns nothing for an absent block", () => {
    expect(parseDemonstrations(undefined)).toEqual({ demonstrations: [], errors: [] });
    expect(parseDemonstrations(null)).toEqual({ demonstrations: [], errors: [] });
  });
});

describe("rejecting malformed demonstrations", () => {
  it("names the unknown provider", () => {
    const { demonstrations, errors } = parseDemonstrations([{ provider: "vimeo", ref: "12345" }]);
    expect(demonstrations).toEqual([]);
    expect(errors[0]).toContain("unknown provider");
    expect(errors[0]).toContain("vimeo");
  });

  it("rejects a YouTube ref that is not an id or a watch URL", () => {
    const { errors } = parseDemonstrations([{ provider: "youtube", ref: "https://vimeo.com/12345" }]);
    expect(errors[0]).toContain("not a YouTube video id");
  });

  it("rejects a plain http recording URL", () => {
    const { errors } = parseDemonstrations([{ provider: "url", ref: "http://example.com/demo.mp4" }]);
    expect(errors[0]).toContain("https");
  });

  it("rejects a dataset ref that is not owner/name", () => {
    const { errors } = parseDemonstrations([{ provider: "hf_dataset", ref: "just-a-name" }]);
    expect(errors[0]).toContain("owner/name");
  });

  it("requires a ref", () => {
    const { errors } = parseDemonstrations([{ provider: "youtube" }]);
    expect(errors[0]).toContain("ref: required");
  });

  it("rejects a segment whose end precedes its start", () => {
    const { errors } = parseDemonstrations([
      { provider: "youtube", ref: "dQw4w9WgXcQ", segments: [{ start: 158, end: 134 }] },
    ]);
    expect(errors[0]).toContain("must come after start");
  });

  it("reports an empty start rather than dropping the segment in silence", () => {
    // `start:` with nothing after it is YAML null, not a missing key. Both
    // spellings have to be reported, or the write path accepts the loss.
    const { demonstrations, errors } = parseDemonstrations([
      { provider: "youtube", ref: "dQw4w9WgXcQ", segments: [{ start: null, label: "grip" }] },
    ]);
    expect(errors).toContain("demonstrations[0].segments[0].start: required");
    expect(demonstrations[0].segments).toEqual([]);
  });

  it("rejects a negative start", () => {
    const { errors } = parseDemonstrations([
      { provider: "youtube", ref: "dQw4w9WgXcQ", segments: [{ start: -1 }] },
    ]);
    expect(errors[0]).toContain("cannot be negative");
  });

  it("rejects an unknown role and an unknown fidelity", () => {
    expect(parseDemonstrations([{ provider: "youtube", ref: "dQw4w9WgXcQ", role: "hint" }]).errors[0])
      .toContain("role");
    expect(parseDemonstrations([{ provider: "youtube", ref: "dQw4w9WgXcQ", fidelity: "audio" }]).errors[0])
      .toContain("fidelity");
  });

  it("caps the number of entries and the number of segments", () => {
    const many = Array.from({ length: DEMONSTRATION_LIMITS.MAX_PER_SKILL + 1 }, () => ({
      provider: "youtube",
      ref: "dQw4w9WgXcQ",
    }));
    expect(parseDemonstrations(many).errors[0]).toContain("more than");

    const segments = Array.from({ length: DEMONSTRATION_LIMITS.MAX_SEGMENTS + 1 }, (_, i) => ({ start: i }));
    expect(parseDemonstrations([{ provider: "youtube", ref: "dQw4w9WgXcQ", segments }]).errors[0])
      .toContain("segments");
  });

  it("keeps the entries that validated alongside the errors", () => {
    const { demonstrations, errors } = parseDemonstrations([
      { provider: "youtube", ref: "dQw4w9WgXcQ" },
      { provider: "vimeo", ref: "12345" },
      { provider: "url", ref: "https://example.com/demo.mp4" },
    ]);
    expect(demonstrations).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("demonstrations[1]");
  });
});

describe("pinning a recording by its digest", () => {
  const HEX = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
  const RECORDING = "https://example.com/demo.mp4";

  it("keeps a sha256 on a url reference, lowercased", () => {
    const { demonstrations, errors } = parseDemonstrations([
      { provider: "url", ref: RECORDING, sha256: `  ${HEX.toUpperCase()} ` },
    ]);
    expect(errors).toEqual([]);
    expect(demonstrations[0].sha256).toBe(HEX);
  });

  it("leaves the field off when the author gave none", () => {
    const { demonstrations } = parseDemonstrations([{ provider: "url", ref: RECORDING }]);
    expect(demonstrations[0]).not.toHaveProperty("sha256");
  });

  it("rejects a digest that is not 64 hex characters", () => {
    const { demonstrations, errors } = parseDemonstrations([
      { provider: "url", ref: RECORDING, sha256: "abc123" },
    ]);
    expect(demonstrations).toEqual([]);
    expect(errors[0]).toContain("sha256: expected 64 hexadecimal characters");
  });

  it("refuses a digest on a reference with no stable bytes to hash", () => {
    const youtube = parseDemonstrations([{ provider: "youtube", ref: "dQw4w9WgXcQ", sha256: HEX }]);
    expect(youtube.errors[0]).toContain("YouTube re-encodes");
    const dataset = parseDemonstrations([{ provider: "hf_dataset", ref: "example-lab/fire-door-push", sha256: HEX }]);
    expect(dataset.errors[0]).toContain("owner/name@revision");
  });

  it("prints the digest for a text-only reader", () => {
    const { demonstrations } = parseDemonstrations([{ provider: "url", ref: RECORDING, sha256: HEX }]);
    expect(renderDemonstrationsMarkdown(demonstrations)).toContain("SHA-256: `" + HEX + "`");
  });
});

describe("reading demonstrations out of a SKILL.md", () => {
  it("reads the block an author wrote", () => {
    const content = skill([
      "name: open-fire-door",
      "description: Opening a fire door by its handle",
      "demonstrations:",
      "  - provider: youtube",
      "    ref: dQw4w9WgXcQ",
      "    title: Two-handed open",
      "    segments:",
      "      - { start: 134, end: 158, label: grip the handle, comment: from below }",
    ].join("\n"));

    const { demonstrations, errors } = readSkillDemonstrations(content);
    expect(errors).toEqual([]);
    expect(demonstrations).toHaveLength(1);
    expect(demonstrations[0].title).toBe("Two-handed open");
    expect(demonstrations[0].segments[0].label).toBe("grip the handle");
  });

  it("reads a block written with CRLF line endings", () => {
    const content = "---\r\nname: x\r\ndemonstrations:\r\n  - provider: youtube\r\n    ref: dQw4w9WgXcQ\r\n---\r\n\r\nBody\r\n";
    expect(readSkillDemonstrations(content).demonstrations).toHaveLength(1);
  });

  it("returns nothing for a skill without frontmatter or without the key", () => {
    expect(readSkillDemonstrations("Just a body").demonstrations).toEqual([]);
    expect(readSkillDemonstrations(skill("name: x")).demonstrations).toEqual([]);
    expect(readSkillDemonstrations(null).demonstrations).toEqual([]);
    expect(readSkillDemonstrations("").demonstrations).toEqual([]);
  });

  it("stays quiet when the frontmatter is not YAML this parser understands", () => {
    const content = skill("name: x\n  : broken: [unclosed");
    expect(readSkillDemonstrations(content)).toEqual({ demonstrations: [], errors: [] });
  });

  it("reports errors for a block that is present but wrong", () => {
    const content = skill("name: x\ndemonstrations:\n  - provider: vimeo\n    ref: '12345'");
    expect(readSkillDemonstrations(content).errors).toHaveLength(1);
  });
});

describe("reading a recording off a memory", () => {
  it("reads metadata.recording with the same shape", () => {
    const { demonstrations } = readMemoryRecording({
      episode: { task: "fire-door", outcome: "completed" },
      recording: [{ provider: "youtube", ref: "dQw4w9WgXcQ", role: "reference" }],
    });
    expect(demonstrations[0].role).toBe("reference");
  });

  it("returns nothing when metadata is absent or has no recording", () => {
    expect(readMemoryRecording(null).demonstrations).toEqual([]);
    expect(readMemoryRecording({ episode: {} }).demonstrations).toEqual([]);
  });
});

describe("episodic memory metadata", () => {
  it("canonicalizes a stored time so the text comparison matches the calendar", () => {
    const { metadata, error } = prepareMemoryMetadata({
      episode: { time: "2026-08-20T14:32:00Z", location: "building-B/floor-2" },
    });
    expect(error).toBeNull();
    expect((metadata as { episode: { time: string } }).episode.time).toBe("2026-08-20T14:32:00.000Z");
  });

  it("brings an offset timestamp onto the same scale as a UTC bound", () => {
    const { metadata } = prepareMemoryMetadata({ episode: { time: "2026-08-20T16:32:00+02:00" } });
    expect((metadata as { episode: { time: string } }).episode.time).toBe("2026-08-20T14:32:00.000Z");
  });

  it("orders a canonicalized value against a canonicalized bound correctly", () => {
    // The bug this guards: as raw text "…00.500Z" sorts before "…00Z", so a
    // memory half a second after the bound was excluded from the window.
    const { metadata } = prepareMemoryMetadata({ episode: { time: "2026-08-20T14:32:00.500Z" } });
    const stored = (metadata as { episode: { time: string } }).episode.time;
    expect(stored >= episodeTimeBound("2026-08-20T14:32:00Z", "since")).toBe(true);
    expect(stored <= episodeTimeBound("2026-08-20T14:32:01Z", "until")).toBe(true);
  });

  it("refuses a time it cannot compare", () => {
    const { error } = prepareMemoryMetadata({ episode: { time: "last tuesday" } });
    expect(error).toContain("ISO 8601");
    expect(() => episodeTimeBound("last tuesday", "since")).toThrow("ISO 8601");
  });

  it("leaves the rest of metadata alone", () => {
    const original = { episode: { task: "open-fire-door" }, threads: [1, 2], anything: { nested: true } };
    const { metadata, error } = prepareMemoryMetadata(original);
    expect(error).toBeNull();
    expect(metadata).toEqual(original);
  });

  it("still rejects a malformed recording", () => {
    const { error } = prepareMemoryMetadata({ recording: [{ provider: "vimeo", ref: "12345" }] });
    expect(error).toContain("metadata.recording");
  });

  it("passes non-object metadata straight through", () => {
    expect(prepareMemoryMetadata(null)).toEqual({ metadata: null, error: null });
  });
});

describe("links and timestamps", () => {
  it("formats timestamps as minutes and hours", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(9)).toBe("0:09");
    expect(formatTimestamp(134)).toBe("2:14");
    expect(formatTimestamp(3832)).toBe("1:03:52");
  });

  it("seeks a YouTube link to the segment start", () => {
    const [ref] = parseDemonstrations([{ provider: "youtube", ref: "dQw4w9WgXcQ" }]).demonstrations;
    expect(demonstrationUrl(ref)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(demonstrationUrl(ref, 134)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=134s");
  });

  it("seeks a plain recording with a media fragment", () => {
    const [ref] = parseDemonstrations([{ provider: "url", ref: "https://example.com/demo.mp4" }]).demonstrations;
    expect(demonstrationUrl(ref, 134)).toBe("https://example.com/demo.mp4#t=134");
  });

  it("replaces a fragment the URL already carried instead of appending a second one", () => {
    const [ref] = parseDemonstrations([
      { provider: "url", ref: "https://example.com/demo.mp4#chapter-2" },
    ]).demonstrations;
    expect(demonstrationUrl(ref, 134)).toBe("https://example.com/demo.mp4#t=134");
    expect(demonstrationUrl(ref)).toBe("https://example.com/demo.mp4#chapter-2");
  });

  it("links a dataset to its revision when one is pinned", () => {
    const [pinned] = parseDemonstrations([{ provider: "hf_dataset", ref: "example-lab/door@a1b2c3d" }]).demonstrations;
    const [floating] = parseDemonstrations([{ provider: "hf_dataset", ref: "example-lab/door" }]).demonstrations;
    expect(demonstrationUrl(pinned)).toBe("https://huggingface.co/datasets/example-lab/door/tree/a1b2c3d");
    expect(demonstrationUrl(floating)).toBe("https://huggingface.co/datasets/example-lab/door");
  });
});

describe("rendering for text-only readers", () => {
  it("renders nothing when there is nothing to render", () => {
    expect(renderDemonstrationsMarkdown([])).toBe("");
    expect(skillDemonstrationsMarkdown(skill("name: x"))).toBe("");
  });

  it("renders a timestamped list a text-only agent can follow", () => {
    const rendered = skillDemonstrationsMarkdown(skill([
      "name: open-fire-door",
      "demonstrations:",
      "  - provider: youtube",
      "    ref: dQw4w9WgXcQ",
      "    title: Two-handed open",
      "    segments:",
      "      - { start: 134, end: 158, label: grip the handle, comment: from below }",
    ].join("\n")));

    expect(rendered).toContain("### Demonstrations");
    expect(rendered).toContain("**Two-handed open**");
    expect(rendered).toContain("[2:14–2:38](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=134s)");
    expect(rendered).toContain("**grip the handle**");
    expect(rendered).toContain("from below");
  });

  it("says the order matters once there is more than one", () => {
    const one = renderDemonstrationsMarkdown(
      parseDemonstrations([{ provider: "youtube", ref: "dQw4w9WgXcQ" }]).demonstrations,
    );
    const two = renderDemonstrationsMarkdown(
      parseDemonstrations([
        { provider: "youtube", ref: "dQw4w9WgXcQ" },
        { provider: "youtube", ref: "oHg5SJYRHA0" },
      ]).demonstrations,
    );
    expect(one).not.toContain("in the order listed");
    expect(two).toContain("Performed in the order listed.");
    expect(two).toContain("1. ");
    expect(two).toContain("2. ");
  });

  it("marks a warning recording as something not to repeat", () => {
    const rendered = renderDemonstrationsMarkdown(
      parseDemonstrations([{ provider: "youtube", ref: "dQw4w9WgXcQ", role: "warning" }]).demonstrations,
    );
    expect(rendered).toContain("Do not reproduce it");
  });

  it("honours the requested heading level and text", () => {
    const rendered = renderDemonstrationsMarkdown(
      parseDemonstrations([{ provider: "youtube", ref: "dQw4w9WgXcQ" }]).demonstrations,
      { heading: "Recording", headingLevel: 5 },
    );
    expect(rendered.startsWith("##### Recording")).toBe(true);
  });
});
