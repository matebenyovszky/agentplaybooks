"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { FloatingNav } from "@/components/ui/floating-navbar";
import { docsEntries, getDocTitle, normalizeDocSlug } from "./docs-data";
import {
  BookOpen,
  Globe,
  ChevronRight,
  FileText,
  Rocket,
  Layers,
  Code,
  Server,
  HardDrive,
  Github,
  ExternalLink,
  Settings
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "getting-started": Rocket,
  "platform-integrations": Globe,
  architecture: Layers,
  playbooks: FileText,
  skills: Code,
  memory: HardDrive,
  "mcp-integration": Server,
  "api-reference": Code,
  "developer-guide": Code,
  "self-hosting": HardDrive,
  "environment-setup": Settings,
  roadmap: Rocket,
};

type DocsPageClientProps = {
  initialSlug?: string;
  initialContent?: string;
};

export default function DocsPageClient({ initialSlug = "readme", initialContent }: DocsPageClientProps) {
  const searchParams = useSearchParams();
  const pageParam = searchParams.get("page");
  const page = useMemo(
    () => normalizeDocSlug(pageParam || initialSlug),
    [pageParam, initialSlug]
  );
  const [content, setContent] = useState<string>(initialContent || "");
  const [loading, setLoading] = useState(!initialContent);

  const docsGuides = docsEntries
    .filter((entry) => entry.section === "guides")
    .map((entry) => ({
      ...entry,
      icon: iconMap[normalizeDocSlug(entry.slug)] ?? FileText,
    }));

  const docsConcepts = docsEntries
    .filter((entry) => entry.section === "concepts")
    .map((entry) => ({
      ...entry,
      icon: iconMap[normalizeDocSlug(entry.slug)] ?? FileText,
    }));

  const docsReference = docsEntries
    .filter((entry) => entry.section === "reference")
    .map((entry) => ({
      ...entry,
      icon: iconMap[normalizeDocSlug(entry.slug)] ?? FileText,
    }));

  // Scroll to anchor after content loads
  const scrollToAnchor = useCallback(() => {
    const hash = window.location.hash;
    if (hash) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        const element = document.querySelector(hash);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    }
  }, []);

  useEffect(() => {
    if (initialContent) {
      setContent(initialContent);
      setLoading(false);
    } else {
      loadContent(page);
    }
  }, [page, initialContent]);

  // Handle hash changes for anchor links
  useEffect(() => {
    if (!loading) {
      scrollToAnchor();
    }

    // Listen for hash changes
    const handleHashChange = () => scrollToAnchor();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [loading, scrollToAnchor]);

  const loadContent = async (slug: string) => {
    setLoading(true);
    try {
      // Map slug to filename
      const normalizedSlug = normalizeDocSlug(slug);
      const filename = normalizedSlug === "readme" ? "README.md" : `${normalizedSlug}.md`;

      // Fetch from static /docs folder in public directory
      const response = await fetch(`/docs/${filename}`);

      if (response.ok) {
        const text = await response.text();
        setContent(text);
      } else {
        setContent("# Documentation not found\n\nThe requested documentation page could not be loaded.");
      }
    } catch {
      setContent("# Error loading documentation\n\nPlease try again later.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <FloatingNav />

      <div className="flex pt-20">
        {/* Sidebar */}
        <aside className="w-64 fixed left-0 top-20 bottom-0 border-r border-neutral-200 dark:border-neutral-800 p-6 overflow-y-auto hidden lg:block">
          <div className="mb-8">
            <Link href="/docs" className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
              <BookOpen className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Documentation
            </Link>
          </div>

          <nav className="space-y-1">
            <Link
              href="/docs"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${page === "readme"
                ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
            >
              <FileText className="h-4 w-4" />
              Overview
            </Link>

            <div className="pt-4 pb-2">
              <span className="px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Getting Started
              </span>
            </div>

            {docsGuides.map((doc) => (
              <Link
                key={doc.slug}
                href={`/docs/${normalizeDocSlug(doc.slug)}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${page === normalizeDocSlug(doc.slug)
                  ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
              >
                <doc.icon className="h-4 w-4" />
                {doc.title}
              </Link>
            ))}

            <div className="pt-4 pb-2">
              <span className="px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Core Concepts
              </span>
            </div>

            {docsConcepts.map((doc) => (
              <Link
                key={doc.slug}
                href={`/docs/${normalizeDocSlug(doc.slug)}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${page === normalizeDocSlug(doc.slug)
                  ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
              >
                <doc.icon className="h-4 w-4" />
                {doc.title}
              </Link>
            ))}

            <div className="pt-4 pb-2">
              <span className="px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Reference
              </span>
            </div>

            {docsReference.map((doc) => (
              <Link
                key={doc.slug}
                href={`/docs/${normalizeDocSlug(doc.slug)}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${page === normalizeDocSlug(doc.slug)
                  ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
              >
                <doc.icon className="h-4 w-4" />
                {doc.title}
              </Link>
            ))}
          </nav>

          <div className="mt-8 pt-8 border-t border-neutral-200 dark:border-neutral-800">
            <a
              href="https://github.com/matebenyovszky/agentplaybooks"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              <Github className="h-4 w-4" />
              View on GitHub
              <ExternalLink className="h-3 w-3 ml-auto" />
            </a>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 lg:ml-64 px-6 lg:px-12 py-8 max-w-4xl">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-neutral-500 mb-8">
            <Link href="/docs" className="hover:text-neutral-900 dark:hover:text-white transition-colors">
              Docs
            </Link>
            {page !== "readme" && (
              <>
                <ChevronRight className="h-4 w-4" />
                <span className="text-neutral-900 dark:text-neutral-300">
                  {getDocTitle(page)}
                </span>
              </>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <motion.article
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="prose prose-neutral dark:prose-invert max-w-none"
            >
              <MarkdownRenderer content={content} />
            </motion.article>
          )}

          {/* Edit on GitHub */}
          <div className="mt-12 pt-8 border-t border-neutral-200 dark:border-neutral-800">
            <a
              href={`https://github.com/matebenyovszky/agentplaybooks/edit/main/docs/${page === "readme" ? "README.md" : `${page}.md`}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              <Github className="h-4 w-4" />
              Edit this page on GitHub
            </a>
          </div>
        </main>

        {/* Right sidebar - Table of Contents */}
        <aside className="w-56 fixed right-0 top-20 bottom-0 p-6 hidden xl:block">
          <div className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">
            On this page
          </div>
          <TableOfContents content={content} />
        </aside>
      </div>
    </div>
  );
}

// Simple Markdown renderer
function MarkdownRenderer({ content }: { content: string }) {
  // Parse and render markdown
  const html = parseMarkdown(content);

  return (
    <div
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Table of Contents extractor
function TableOfContents({ content }: { content: string }) {
  const headings = content
    .split("\n")
    .filter(line => /^#{2,3}\s/.test(line))
    .map(line => {
      const level = line.match(/^#+/)?.[0].length || 2;
      const text = line.replace(/^#+\s/, "").replace(/`/g, "");
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return { level, text, id };
    });

  if (headings.length === 0) return null;

  return (
    <nav className="space-y-2 text-sm">
      {headings.map((heading, i) => (
        <a
          key={i}
          href={`#${heading.id}`}
          className={`block text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors ${heading.level === 3 ? "pl-4" : ""
            }`}
        >
          {heading.text}
        </a>
      ))}
    </nav>
  );
}

// Simple markdown parser (for basic rendering without MDX)
function parseMarkdown(md: string): string {
  let html = md
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre class="bg-neutral-900 border border-neutral-800 rounded-lg p-4 overflow-x-auto mb-6 text-sm"><code class="language-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-neutral-800 text-indigo-300 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    // Headers
    .replace(/^#### (.*$)/gm, '<h4 id="$1" class="text-lg font-semibold mt-6 mb-2 text-neutral-200">$1</h4>')
    .replace(/^### (.*$)/gm, '<h3 id="$1" class="text-xl font-semibold mt-8 mb-3 text-white">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 id="$1" class="text-2xl font-bold mt-10 mb-4 text-white border-b border-neutral-800 pb-2">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 id="$1" class="text-4xl font-bold mt-6 mb-6 gradient-text">$1</h1>')
    // Bold and italic
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="italic text-neutral-200">$1</em>')
    // Links - convert relative .md links to /docs/<slug> format
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      let href = url;
      // Convert ./something.md or something.md to /docs/something
      if (url.match(/^\.?\/?([a-z0-9-]+)\.md$/i)) {
        const slug = url.replace(/^\.?\/?/, '').replace(/\.md$/, '');
        href = `/docs/${normalizeDocSlug(slug)}`;
      }
      return `<a href="${href}" class="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">${text}</a>`;
    })
    // Lists
    .replace(/^\- (.*$)/gm, '<li class="ml-4">$1</li>')
    .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4">$2</li>')
    // Blockquotes
    .replace(/^> (.*$)/gm, '<blockquote class="border-l-4 border-indigo-500 pl-4 my-4 text-neutral-400 italic">$1</blockquote>')
    // Tables (basic)
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c.trim()))) return ''; // Header separator
      const isHeader = cells.some(c => c.includes('---'));
      const tag = isHeader ? 'th' : 'td';
      const cellClass = isHeader
        ? 'px-4 py-3 text-left text-sm font-semibold text-neutral-200 bg-neutral-900'
        : 'px-4 py-3 text-sm text-neutral-300';
      return `<tr>${cells.map(c => `<${tag} class="${cellClass}">${c.trim()}</${tag}>`).join('')}</tr>`;
    })
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="border-neutral-800 my-8" />')
    // Paragraphs
    .replace(/\n\n/g, '</p><p class="text-neutral-300 leading-relaxed mb-4">');

  // Wrap in paragraph tags if needed
  if (!html.startsWith('<')) {
    html = `<p class="text-neutral-300 leading-relaxed mb-4">${html}</p>`;
  }

  // Fix header IDs (make them url-friendly)
  html = html.replace(/id="([^"]+)"/g, (_, id) => {
    const cleanId = id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `id="${cleanId}"`;
  });

  // Wrap lists
  html = html.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, (match) => {
    return `<ul class="list-disc list-inside mb-4 space-y-2 text-neutral-300">${match}</ul>`;
  });

  // Wrap tables
  html = html.replace(/(<tr>.*?<\/tr>\n?)+/g, (match) => {
    return `<div class="overflow-x-auto mb-6"><table class="w-full border-collapse">${match}</table></div>`;
  });

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
