export type DocSection = "guides" | "concepts" | "reference";

export type DocEntry = {
  slug: string;
  title: string;
  description: string;
  section: DocSection;
};

export const docsEntries: DocEntry[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "First steps with AgentPlaybooks",
    section: "guides",
  },
  {
    slug: "platform-integrations",
    title: "Platform Integrations",
    description: "Connect to ChatGPT, Claude, Gemini & more",
    section: "guides",
  },
  {
    slug: "architecture",
    title: "Architecture",
    description: "System design and components",
    section: "guides",
  },
  {
    slug: "playbooks",
    title: "Playbooks",
    description: "Complete agent operating environment",
    section: "concepts",
  },
  {
    slug: "skills",
    title: "Skills",
    description: "Structured capability definitions",
    section: "concepts",
  },
  {
    slug: "memory",
    title: "Memory",
    description: "Persistent key-value storage",
    section: "concepts",
  },
  {
    slug: "mcp-integration",
    title: "MCP Integration",
    description: "Model Context Protocol guide",
    section: "concepts",
  },
  {
    slug: "api-reference",
    title: "API Reference",
    description: "Complete API documentation",
    section: "reference",
  },
  {
    slug: "developer-guide",
    title: "Developer Guide",
    description: "Contributing and development",
    section: "reference",
  },
  {
    slug: "self-hosting",
    title: "Self-Hosting",
    description: "Deploy your own instance",
    section: "reference",
  },
  {
    slug: "environment-setup",
    title: "Environment Setup",
    description: "OAuth & environment configuration",
    section: "reference",
  },
  {
    slug: "ROADMAP",
    title: "Roadmap",
    description: "Development roadmap and future plans",
    section: "reference",
  },
];

export function normalizeDocSlug(slug: string) {
  return slug.replace(/\.md$/i, "").toLowerCase();
}

export function getDocTitle(slug: string) {
  const normalized = normalizeDocSlug(slug);

  if (normalized === "readme" || normalized === "") {
    return "Documentation";
  }

  const match = docsEntries.find(
    (entry) => normalizeDocSlug(entry.slug) === normalized
  );

  if (match) {
    return match.title;
  }

  return normalized
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
