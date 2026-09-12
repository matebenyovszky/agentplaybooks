export type BlogPost = {
    slug: string;
    title: string;
    description: string;
    date: string;
    author?: string;
    content: string;
    locale?: string;
};

const isBlogDebugEnabled =
    typeof process !== 'undefined' && process.env.BLOG_DEBUG?.toLowerCase() === "true";

function blogDebugLog(message: string, meta?: Record<string, unknown>) {
    if (!isBlogDebugEnabled) {
        return;
    }
    if (meta) {
        console.log(`[blog] ${message}`, meta);
    } else {
        console.log(`[blog] ${message}`);
    }
}

// Helper to parse frontmatter without adding a heavy dependency
function parseFrontmatter(fileContent: string): { metadata: Record<string, string>; content: string } {
    // `\r?\n`, not `\n`: a CRLF-served markdown file otherwise misses entirely
    // and the post renders with its slug as the title.
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = fileContent.match(frontmatterRegex);

    if (!match) {
        return { metadata: {}, content: fileContent };
    }

    const frontmatterBlock = match[1];
    const content = match[2];
    const metadata: Record<string, string> = {};

    frontmatterBlock.split("\n").forEach((line) => {
        const [key, ...valueParts] = line.split(":");
        if (key && valueParts.length > 0) {
            metadata[key.trim()] = valueParts.join(":").trim().replace(/^['"](.*)['"]+$/, "$1"); // Remove quotes if present
        }
    });

    return { metadata, content };
}

import fs from "fs";
import path from "path";
import {
    generatedBlogContentIndex,
    generatedBlogIndex,
    generatedLocalizedBlogContentIndex,
    generatedLocalizedBlogIndex,
    knownBlogSlugs,
} from "./blog-slugs.generated";

/**
 * Fetch blog post content from the browser or local filesystem.
 *
 * Production rendering uses the generated content index below. Fetching a
 * missing file through the public site from inside the Worker re-enters the same
 * Worker. A crawler requesting blog URLs could therefore multiply one incoming
 * request into several billable invocations (and, for misses, recursive 404s).
 */
async function fetchBlogContent(filename: string): Promise<string | null> {
    const isBrowser = typeof window !== 'undefined';

    // In Browser, use fetch relative
    if (isBrowser) {
        try {
            const url = `/blog/${filename}`;
            const response = await fetch(url);
            if (!response.ok) {
                return null;
            }
            return await response.text();
        } catch (error) {
            console.error(`Error fetching blog file ${filename} in browser:`, error);
            return null;
        }
    }

    // In Server (Node.js or OpenNext Worker), use fs
    try {
        const filePath = path.join(process.cwd(), 'public', 'blog', filename);
        if (fs.existsSync(filePath)) {
            blogDebugLog("Loaded blog content from filesystem.", { filename, filePath });
            return await fs.promises.readFile(filePath, 'utf-8');
        }
    } catch (error) {
        console.error(`Blog fs access failed for ${filename}:`, error);
    }

    return null;
}

function getGeneratedBlogContent(slug: string, locale: string): string | null {
    const localizedContent = generatedLocalizedBlogContentIndex[locale]?.[slug];
    if (localizedContent) {
        return localizedContent;
    }

    return generatedBlogContentIndex[slug] || null;
}

/**
 * Get a blog post by slug and locale.
 * Works in both build time (SSG) and runtime (Cloudflare Workers).
 */
export async function getBlogPost(slug: string, locale: string = "en", baseUrl: string = ""): Promise<BlogPost | null> {
    void baseUrl;
    // The build embeds every published post. Production Workers must use this
    // copy before touching the filesystem so rendering never fetches the public
    // site recursively.
    let content = getGeneratedBlogContent(slug, locale);

    if (content) {
        const { metadata, content: postContent } = parseFrontmatter(content);
        return {
            slug,
            title: metadata.title || slug,
            description: metadata.description || "",
            date: metadata.date || new Date().toISOString(),
            author: metadata.author,
            content: postContent,
        };
    }

    // Try exact locale first: slug.locale.md
    let filename = `${slug}.${locale}.md`;
    blogDebugLog("Resolving blog post.", { slug, locale, filename, baseUrl });
    content = await fetchBlogContent(filename);

    if (!content) {
        // Try default: slug.md
        filename = `${slug}.md`;
        content = await fetchBlogContent(filename);
    }

    // Handle case where default might be explicitly named slug.en.md
    if (!content && locale !== "en") {
        filename = `${slug}.en.md`;
        content = await fetchBlogContent(filename);
    }

    if (!content) {
        return null;
    }

    const { metadata, content: postContent } = parseFrontmatter(content);

    return {
        slug,
        title: metadata.title || slug,
        description: metadata.description || "",
        date: metadata.date || new Date().toISOString(),
        author: metadata.author,
        content: postContent,
    };
}

/**
 * Get all blog posts for a locale.
 * Works in both build time (SSG) and runtime (Cloudflare Workers).
 */
export async function getBlogPosts(locale: string = "en", baseUrl: string = ""): Promise<BlogPost[]> {
    void baseUrl;
    // Build listing from compile-time metadata so index rendering does not depend on
    // runtime filesystem availability in Cloudflare Workers.
    const localeIndex = generatedLocalizedBlogIndex[locale] || {};
    const posts: BlogPost[] = knownBlogSlugs.map((slug) => {
        const metadata = localeIndex[slug] || generatedBlogIndex[slug];
        return {
            slug,
            title: metadata?.title || slug,
            description: metadata?.description || "",
            date: metadata?.date || new Date().toISOString(),
            author: metadata?.author,
            content: "",
        };
    });

    // Sort by date descending
    return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Get list of known blog post slugs.
 * This is used for static generation at build time.
 */
export async function getKnownBlogSlugs(): Promise<string[]> {
    return [...knownBlogSlugs];
}
