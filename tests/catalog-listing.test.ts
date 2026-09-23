import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

  it("lists canonical privacy and terms URLs in the sitemap", () => {
    expect(LEGAL_CANONICAL_PATHS).toEqual(["/privacy", "/terms"]);
    expect(source("src/app/sitemap.ts")).toContain("LEGAL_CANONICAL_PATHS");
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
    const codex = JSON.parse(source("packages/cli/.codex-plugin/plugin.json")) as {
      name: string;
      version: string;
      license: string;
    };

    expect(cursor.name).toBe("agentplaybooks");
    expect(cursor.name).toBe(claude.name);
    const cli = JSON.parse(source("packages/cli/package.json")) as { version: string };
    expect(cursor.version).toBe(cli.version);
    expect(cursor.version).toBe(claude.version);
    expect(codex.version).toBe(claude.version);
    expect(codex.license).toBe("MIT");
    expect(cursor.license).toBe("MIT");
    expect(cursor.description).toBe(claude.description);
    expect(cursor.skills).toBe("./skills");
    expect(cursor.commands).toBe("./commands");
  });

  it("resolves the marketplace source to packages/cli", () => {
    const marketplace = JSON.parse(source(".cursor-plugin/marketplace.json")) as {
      plugins: Array<{ source: string; license: string; version: string }>;
    };
    const claudeMarketplace = JSON.parse(source(".claude-plugin/marketplace.json")) as {
      plugins: Array<{ source: string; license: string; version: string }>;
    };
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0].source).toBe("./packages/cli");
    expect(marketplace.plugins[0].license).toBe("MIT");
    const cli = JSON.parse(source("packages/cli/package.json")) as { version: string };
    expect(marketplace.plugins[0].version).toBe(cli.version);
    expect(claudeMarketplace.plugins[0]).toMatchObject({
      source: marketplace.plugins[0].source,
      license: marketplace.plugins[0].license,
      version: marketplace.plugins[0].version,
    });
  });

  it("keeps portable plugin and MCP Registry versions aligned with the CLI", () => {
    const cli = JSON.parse(source("packages/cli/package.json")) as { version: string };
    const portable = JSON.parse(source("packages/cli/plugin.json")) as { version: string };
    const registry = JSON.parse(source("server.json")) as { version: string };
    expect(portable.version).toBe(cli.version);
    expect(registry.version).toBe(cli.version);
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
