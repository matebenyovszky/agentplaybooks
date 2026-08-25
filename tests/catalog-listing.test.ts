import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import {
  PRIVACY_PARAGRAPHS,
  TERMS_PARAGRAPHS,
} from "@/lib/legal-copy";
import { LEGAL_CANONICAL_PATHS, LEGAL_REDIRECTS } from "@/lib/legal-routes";

const FORBIDDEN = [
  "PolyForm",
  "SOC 2",
  "SOC2",
  "ISO 27001",
  "GDPR",
  "OAuth",
  "outlook.com",
  "hello@",
  "apb_live_",
];

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("catalog legal pages", () => {
  it("keeps the CoS-locked privacy and terms copy", () => {
    expect(PRIVACY_PARAGRAPHS).toEqual([
      "AgentPlaybooks is open-source software licensed under MIT. The product is the code in the public repository.",
      "The CLI and editor plugins run on your machine. Local use does not send us your playbooks, skills, instructions, or secrets.",
      "If you use agentplaybooks.ai or the hosted API, we process only what is required to run that service (for example an account email or API key). We do not sell personal data.",
      "To ask about this page, contact the maintainers via the public repository: https://github.com/matebenyovszky/agentplaybooks",
    ]);
    expect(TERMS_PARAGRAPHS).toEqual([
      "The software is provided \u201cas is\u201d, without warranty of any kind, express or implied.",
      "You use AgentPlaybooks at your own risk. The maintainers accept no liability for any loss or damage arising from use of the software or the site.",
      "The MIT license in the repository is the agreement. What is in the code is what you get.",
    ]);
  });

  it("does not invent compliance claims, OAuth, emails, or marketplace listings", () => {
    const legal = [
      source("src/lib/legal-copy.ts"),
      source("src/app/privacy/page.tsx"),
      source("src/app/terms/page.tsx"),
    ].join("\n");

    for (const term of FORBIDDEN) {
      expect(legal, term).not.toContain(term);
    }
  });

  it("exports privacy and terms page modules with canonical metadata", () => {
    for (const route of LEGAL_CANONICAL_PATHS) {
      const page = source(`src/app${route}/page.tsx`);
      expect(page).toContain("export const metadata");
      expect(page).toMatch(/export default function/);
      expect(page).toContain(`absoluteUrl("${route}")`);
    }
  });

  it("lists canonical privacy and terms URLs in the sitemap", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain("https://agentplaybooks.ai/privacy");
    expect(urls).toContain("https://agentplaybooks.ai/terms");
  });

  it("301-aliases the directory lookup paths onto the canonicals", () => {
    expect(LEGAL_REDIRECTS).toEqual([
      { source: "/privacy-policy", destination: "/privacy", statusCode: 301 },
      { source: "/legal", destination: "/privacy", statusCode: 301 },
      { source: "/legal/privacy", destination: "/privacy", statusCode: 301 },
      { source: "/terms-of-service", destination: "/terms", statusCode: 301 },
    ]);
    expect(source("next.config.ts")).toContain("LEGAL_REDIRECTS");
  });
});

describe("Cursor plugin catalog manifests", () => {
  it("mirrors the Claude plugin identity and points at existing skills and commands", () => {
    const claude = JSON.parse(source("packages/cli/.claude-plugin/plugin.json")) as {
      name: string;
      version: string;
      license: string;
      description: string;
    };
    const cursor = JSON.parse(source("packages/cli/.cursor-plugin/plugin.json")) as {
      name: string;
      version: string;
      license: string;
      description: string;
      skills: string;
      commands: string;
    };

    expect(cursor.name).toBe("agentplaybooks");
    expect(cursor.name).toBe(claude.name);
    expect(cursor.version).toBe("0.3.0-beta.0");
    expect(cursor.version).toBe(claude.version);
    expect(cursor.license).toBe("MIT");
    expect(cursor.description).toBe(claude.description);
    expect(cursor.skills).toBe("./skills");
    expect(cursor.commands).toBe("./commands");
  });

  it("resolves the marketplace source to packages/cli", () => {
    const marketplace = JSON.parse(source(".cursor-plugin/marketplace.json")) as {
      plugins: Array<{ source: string; license: string; version: string }>;
    };
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0].source).toBe("./packages/cli");
    expect(marketplace.plugins[0].license).toBe("MIT");
    expect(marketplace.plugins[0].version).toBe("0.3.0-beta.0");
  });

  it("does not bump the CLI package version", () => {
    const cli = JSON.parse(source("packages/cli/package.json")) as { version: string };
    expect(cli.version).toBe("0.3.0-beta.0");
  });
});

describe("ChatGPT directory reviewer notes", () => {
  it("documents Bearer auth, the 49-tool surface, and that this is not OAuth or a listing", () => {
    const notes = source("docs/chatgpt-directory-notes.md");
    expect(notes).toMatch(/Streamable HTTP/i);
    expect(notes).toContain("https://agentplaybooks.ai/api/mcp/manage");
    expect(notes).toContain("Authorization: Bearer");
    expect(notes).toContain("49");
    expect(notes).toContain("use_secret_write");
    expect(notes).toContain("find_tools");
    expect(notes).toMatch(/not.*OAuth/i);
    expect(notes).toMatch(/does \*\*not\*\* claim a listing/i);
    expect(notes).not.toContain("outlook.com");
  });
});
