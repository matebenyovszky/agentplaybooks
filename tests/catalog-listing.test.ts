import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PRIVACY_CONTACT_URL,
  PRIVACY_SECTIONS,
  TERMS_PARAGRAPHS,
} from "@/lib/legal-copy";
import { LEGAL_CANONICAL_PATHS, LEGAL_REDIRECTS } from "@/lib/legal-routes";
import { ACCOUNT_TOOLS } from "@/app/api/_shared/account-tools";
import { PLAYBOOK_TOOLS } from "@/app/api/_shared/playbook-tools";

// The privacy notice was a locked four-paragraph copy until the Claude
// directory submission needed a complete one. Two rules of that lock survive:
// no compliance claim we cannot back, and no email address of any kind — the
// owner's decision; contact goes through the public repository.
const EMAIL_ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
const FORBIDDEN = [
  "PolyForm",
  "SOC 2",
  "SOC2",
  "ISO 27001",
  "compliant",
  "certified",
  "outlook.com",
  "hello@",
  "apb_live_",
];

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const privacyText = PRIVACY_SECTIONS.flatMap((section) => [
  section.heading ?? "",
  ...section.blocks.flatMap((block) => (typeof block === "string" ? [block] : [...block])),
]).join("\n");

describe("catalog legal pages", () => {
  it("covers what the Claude directory requires of a privacy policy", () => {
    // https://claude.com/docs/connectors/building/submission — data collection,
    // usage and storage, third-party sharing, data retention, contact.
    const headings = PRIVACY_SECTIONS.map((section) => section.heading ?? "");
    for (const heading of ["Who is responsible", "What we collect", "Why we use it", "Who else sees it", "How long we keep it", "Your rights"]) {
      expect(headings, heading).toContain(heading);
    }
    expect(PRIVACY_CONTACT_URL).toMatch(/^https:\/\/github\.com\/matebenyovszky\/agentplaybooks\//);
    expect(privacyText).toContain(PRIVACY_CONTACT_URL);
  });

  it("names every processor the service actually uses, and the account deletion it offers", () => {
    expect(privacyText).toContain("Supabase");
    expect(privacyText).toContain("Cloudflare");
    expect(privacyText).toContain("Settings → Delete account");
  });

  it("keeps the terms copy", () => {
    expect(TERMS_PARAGRAPHS).toEqual([
      "The software is provided \u201cas is\u201d, without warranty of any kind, express or implied.",
      "You use AgentPlaybooks at your own risk. The maintainers accept no liability for any loss or damage arising from use of the software or the site.",
      "The MIT license in the repository is the agreement. What is in the code is what you get.",
    ]);
  });

  it("does not invent compliance claims or publish an email address", () => {
    const legal = [
      source("src/lib/legal-copy.ts"),
      source("src/app/privacy/page.tsx"),
      source("src/app/terms/page.tsx"),
    ].join("\n");

    for (const term of FORBIDDEN) {
      expect(legal, term).not.toContain(term);
    }
    expect(legal).not.toMatch(EMAIL_ADDRESS);
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
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0].source).toBe("./packages/cli");
    expect(marketplace.plugins[0].license).toBe("MIT");
    const cli = JSON.parse(source("packages/cli/package.json")) as { version: string };
    expect(marketplace.plugins[0].version).toBe(cli.version);
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
  it("documents both auth modes, the live tool surface, and that this is not a listing", () => {
    const notes = source("docs/chatgpt-directory-notes.md");
    expect(notes).toMatch(/Streamable HTTP/i);
    expect(notes).toContain("https://agentplaybooks.ai/api/mcp/manage");
    // OAuth is the default since the endpoint started answering with a
    // resource_metadata challenge; the API key stays for automation. The notes
    // once said "not OAuth", which reviewers would have found to be false.
    expect(notes).toMatch(/OAuth 2\.1/);
    expect(notes).toContain("resource_metadata");
    expect(notes).toContain("Authorization: Bearer");
    expect(notes).toContain("use_secret_write");
    expect(notes).toContain("find_tools");
    expect(notes).toMatch(/does \*\*not\*\* claim a listing/i);
    expect(notes).not.toContain("outlook.com");
  });

  it("states the tool count the server actually advertises", () => {
    // Derived rather than pinned: a hard-coded "49" here outlived the tool that
    // made it 50, and a reviewer counting tools/list would have seen the gap.
    const notes = source("docs/chatgpt-directory-notes.md");
    const total = ACCOUNT_TOOLS.length + PLAYBOOK_TOOLS.length;
    expect(notes).toContain(`**${total}** tools`);
    expect(notes).toContain(`${ACCOUNT_TOOLS.length} account tools`);
    expect(notes).toContain(`${PLAYBOOK_TOOLS.length} playbook tools`);
  });
});

/**
 * The Claude marketplace points somewhere else on purpose. claude.ai chat and
 * Cowork refuse a plugin that has a top-level `bin/` directory, which the CLI
 * package has, so Claude gets the lean `plugins/agentplaybooks` folder instead —
 * and that folder is also what Anthropic's directory reads.
 * See https://claude.com/docs/plugins/platform-support
 */
describe("Claude plugin catalog manifests", () => {
  const pluginRoot = "plugins/agentplaybooks";

  it("resolves the Claude marketplace to the lean plugin, at the CLI's version", () => {
    const claudeMarketplace = JSON.parse(source(".claude-plugin/marketplace.json")) as {
      plugins: Array<{ name: string; source: string; license: string; version: string }>;
    };
    const cli = JSON.parse(source("packages/cli/package.json")) as { version: string };
    expect(claudeMarketplace.plugins).toHaveLength(1);
    expect(claudeMarketplace.plugins[0]).toMatchObject({
      name: "agentplaybooks",
      source: `./${pluginRoot}`,
      license: "MIT",
      version: cli.version,
    });
  });

  it("keeps the folder installable on every Claude surface", () => {
    const entries = readdirSync(path.join(process.cwd(), pluginRoot));
    expect(entries, "a top-level bin/ makes claude.ai and Cowork refuse the plugin").not.toContain("bin");
    expect(entries, "a lockfile is held for manual directory review").not.toContain("package-lock.json");
    expect(entries).toContain("README.md");
    expect(entries).toContain("LICENSE");
  });

  it("bundles the account connector as a remote server with no credential in it", () => {
    const plugin = JSON.parse(source(`${pluginRoot}/.claude-plugin/plugin.json`)) as {
      name: string;
      mcpServers: Record<string, { type: string; url: string; headers?: unknown }>;
    };
    const server = plugin.mcpServers["agentplaybooks-account"];
    expect(plugin.name).toBe("agentplaybooks");
    expect(server).toEqual({ type: "http", url: "https://agentplaybooks.ai/api/mcp/manage" });
  });
});
