/**
 * The licence and version a release claims are declared in four places that
 * nothing else keeps in step: the CLI's `package.json`, the Claude Code plugin
 * manifest next to it, this repository's marketplace listing, and the `LICENSE`
 * file `npm pack` ships inside the tarball.
 *
 * They have drifted before, and the failure is silent in both directions: the
 * first two published CLI tarballs (0.2.0-alpha.1 and 0.2.0-alpha.2) still carry
 * `PolyForm-Noncommercial-1.0.0` on the registry, which is not the licence this
 * project is under, and the marketplace listing has advertised a plugin version
 * the package no longer had. Nothing at publish time notices either.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const LICENCE = "MIT";

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

const rootPackage = readJson("package.json");
const cliPackage = readJson("packages/cli/package.json");
const pluginManifest = readJson("packages/cli/.claude-plugin/plugin.json");
const marketplace = readJson(".claude-plugin/marketplace.json") as {
  plugins: Array<{ name: string; version?: string; license?: string }>;
};

describe("package metadata", () => {
  it("declares the same licence everywhere a consumer can read one", () => {
    expect(rootPackage.license).toBe(LICENCE);
    expect(cliPackage.license).toBe(LICENCE);
    expect(pluginManifest.license).toBe(LICENCE);
    for (const plugin of marketplace.plugins) {
      expect(plugin.license, `marketplace plugin '${plugin.name}'`).toBe(LICENCE);
    }
  });

  it("ships a LICENSE file that matches, in both the repository and the tarball", () => {
    for (const file of ["LICENSE", "packages/cli/LICENSE"]) {
      const text = readFileSync(path.join(repoRoot, file), "utf8");
      expect(text.split("\n")[0].trim(), file).toBe("MIT License");
    }
    // Without this entry `npm pack` omits the licence text, and the tarball
    // states a licence it does not carry.
    expect(cliPackage.files).toContain("LICENSE");
  });

  it("advertises one CLI version, not three", () => {
    const version = cliPackage.version;
    expect(typeof version).toBe("string");
    expect(pluginManifest.version).toBe(version);

    const listed = marketplace.plugins.find((plugin) => plugin.name === "agentplaybooks");
    expect(listed, "the marketplace must list the agentplaybooks plugin").toBeDefined();
    expect(listed?.version).toBe(version);
  });
});
