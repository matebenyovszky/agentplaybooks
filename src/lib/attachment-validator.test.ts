/**
 * The upload rules have to agree with what `/.well-known/skills/` serves and
 * with the CHECK constraints on `skill_attachments`. These tests pin the two
 * halves together: anything `isSafeSkillFile` will serve must be something
 * `validateFilename` will accept, and nothing else may get through.
 */
import { describe, expect, it } from "vitest";

import { validateAttachment, validateContent, validateFilename } from "./attachment-validator";
import { isSafeSkillFile, SKILL_FILE_DIRECTORIES } from "./skill-markdown";
import { ATTACHMENT_LIMITS } from "./supabase/types";

describe("validateFilename", () => {
  it("accepts a plain filename", () => {
    const result = validateFilename("office.py");
    expect(result.valid).toBe(true);
    expect(result.sanitizedFilename).toBe("office.py");
    expect(result.detectedType).toBe("python");
  });

  it("accepts one level of a standard skill directory", () => {
    for (const directory of SKILL_FILE_DIRECTORIES) {
      const result = validateFilename(`${directory}/helper.py`);
      expect(result.valid, `${directory}/helper.py`).toBe(true);
      expect(result.sanitizedFilename).toBe(`${directory}/helper.py`);
    }
  });

  it("treats a Windows separator as a path separator", () => {
    const result = validateFilename("scripts\\office.py");
    expect(result.valid).toBe(true);
    expect(result.sanitizedFilename).toBe("scripts/office.py");
  });

  it("rejects a directory that is not part of the convention", () => {
    const result = validateFilename("secrets/office.py");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("secrets");
  });

  it("rejects traversal, absolute paths and deeper nesting", () => {
    for (const name of [
      "../office.py",
      "scripts/../../office.py",
      "/etc/passwd",
      "scripts/nested/office.py",
      "..",
    ]) {
      expect(validateFilename(name).valid, name).toBe(false);
    }
  });

  it("rejects an unknown extension rather than guessing a type", () => {
    const result = validateFilename("office.exe");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("exe");
  });

  it("repairs a name that only has unusable characters in it", () => {
    const result = validateFilename("my report (final).md");
    expect(result.sanitizedFilename).toBe("my_report__final_.md");
    expect(result.valid).toBe(true);
  });

  it("measures the length limit against the whole path", () => {
    const name = `scripts/${"a".repeat(ATTACHMENT_LIMITS.MAX_FILENAME_LENGTH)}.py`;
    expect(validateFilename(name).valid).toBe(false);
  });

  it("agrees with the rule the well-known server serves by", () => {
    const names = [
      "office.py",
      "scripts/office.py",
      "references/api.md",
      "assets/logo.svg",
      "secrets/key.txt",
      "../escape.py",
      "scripts/nested/deep.py",
    ];
    for (const name of names) {
      const uploadable = validateFilename(name).valid;
      const servable = isSafeSkillFile(name);
      // An unsupported extension is an upload-time rule only: `logo.svg` is a
      // safe path that this project does not store. Everything that fails for
      // a *path* reason has to fail on both sides.
      if (name === "assets/logo.svg") {
        expect(uploadable).toBe(false);
        expect(servable).toBe(true);
        continue;
      }
      expect(uploadable, name).toBe(servable);
    }
  });
});

describe("validateContent", () => {
  it("accepts a file at the documented ceiling", () => {
    expect(validateContent("x".repeat(ATTACHMENT_LIMITS.MAX_FILE_SIZE)).valid).toBe(true);
  });

  it("rejects one byte more", () => {
    const result = validateContent("x".repeat(ATTACHMENT_LIMITS.MAX_FILE_SIZE + 1));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("too large");
  });

  it("has room for a real thin wrapper", () => {
    // The Office COM layer this limit was raised for is a little under 50 KB
    // and was one function away from being unstorable.
    expect(ATTACHMENT_LIMITS.MAX_FILE_SIZE).toBeGreaterThan(51200);
  });

  it("still refuses binary and control characters", () => {
    expect(validateContent("a\0b").valid).toBe(false);
    expect(validateContent("a\x07b").valid).toBe(false);
    expect(validateContent("").valid).toBe(false);
  });
});

describe("validateAttachment", () => {
  it("passes a python script under scripts/", () => {
    const result = validateAttachment("scripts/office.py", "print('hello')\n");
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("python");
  });
});
