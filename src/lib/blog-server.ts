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
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
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
 * Fetch blog post content.
 * Matches the mechanism in docs-server.ts to correctly use the OpenNext file system 
 * interception for static assets on Cloudflare.
 */
async function fetchBlogContent(filename: string, baseUrl: string = ""): Promise<string | null> {
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

    const fallbackBaseUrl =
        baseUrl ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.SITE_URL ||
        process.env.CF_PAGES_URL ||
        "";

    if (!fallbackBaseUrl) {
        return null;
    }

    try {
        const url = new URL(`/blog/${filename}`, fallbackBaseUrl).toString();
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
            blogDebugLog("Blog content fetch fallback returned non-OK response.", {
                filename,
                url,
                status: response.status,
            });
            return null;
        }
        blogDebugLog("Loaded blog content from fetch fallback.", { filename, url });
        return await response.text();
    } catch (error) {
        console.error(`Blog fetch fallback failed for ${filename}:`, error);
        return null;
    }
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
    // Try exact locale first: slug.locale.md
    let filename = `${slug}.${locale}.md`;
    blogDebugLog("Resolving blog post.", { slug, locale, filename, baseUrl });
    let content = await fetchBlogContent(filename, baseUrl);

    if (!content) {
        // Try default: slug.md
        filename = `${slug}.md`;
        content = await fetchBlogContent(filename, baseUrl);
    }

    // Handle case where default might be explicitly named slug.en.md
    if (!content && locale !== "en") {
        filename = `${slug}.en.md`;
        content = await fetchBlogContent(filename, baseUrl);
    }

    if (!content) {
        content = getGeneratedBlogContent(slug, locale);
        if (!content) {
            return null;
        }
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
