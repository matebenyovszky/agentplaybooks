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

/**
 * Fetch blog post content.
 * Uses fs during build time (SSG) and fetch during runtime (Cloudflare).
 */
async function fetchBlogContent(filename: string, baseUrl: string = ""): Promise<string | null> {
    const envBaseUrl =
        (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.CF_PAGES_URL)) || "";
    const runtimeBaseUrl = baseUrl || envBaseUrl;
    const isBrowser = typeof window !== 'undefined';

    if (!isBrowser) {
        try {
            const fs = await import('fs');
            const path = await import('path');
            const filePath = path.join(process.cwd(), 'public', 'blog', filename);

            if (fs.existsSync(filePath)) {
                blogDebugLog("Loaded blog content from filesystem.", { filename, filePath });
                return fs.readFileSync(filePath, 'utf-8');
            }
        } catch (error) {
            console.warn(`Blog fs access failed for ${filename}, falling back to fetch.`, error);
        }
    } else {
        // Runtime (Cloudflare Workers): Use fetch
        try {
            const envBaseUrl =
                (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.CF_PAGES_URL)) || "";
            const runtimeBaseUrl = baseUrl || envBaseUrl;
            const isBrowser = typeof window !== 'undefined';

            // Ensure absolute URL in Workers by falling back to a configured site URL when possible.
            const url = runtimeBaseUrl
                ? `${runtimeBaseUrl}/blog/${filename}`
                : (isBrowser ? `/blog/${filename}` : `http://localhost:3000/blog/${filename}`);

            if (!runtimeBaseUrl && !isBrowser) {
                console.warn(
                    `[blog] Missing baseUrl for runtime fetch. Configure NEXT_PUBLIC_SITE_URL (or SITE_URL/CF_PAGES_URL) to avoid localhost fallback. Attempted: ${url}`
                );
            }

            console.log(`Fetching blog content from: ${url}`);

            const response = await fetch(url);
            if (!response.ok) {
                console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
                return null;
            }
            return response.text();
        } catch (error) {
            console.error(`Error fetching blog file ${filename}:`, error);
            return null;
        }
        return response.text();
    } catch (error) {
        console.error(`Error fetching blog file ${filename}:`, error);
        return null;
    }
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
    // Import auto-generated known slugs
    const { knownBlogSlugs } = await import("./blog-slugs.generated");

    const posts: BlogPost[] = [];

    for (const slug of knownBlogSlugs) {
        try {
            const post = await getBlogPost(slug, locale, baseUrl);
            if (post) {
                posts.push(post);
            }
        } catch (error) {
            console.error(`Error loading blog post ${slug}:`, error);
        }
    }

    // Sort by date descending
    return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Get list of known blog post slugs.
 * This is used for static generation at build time.
 */
export async function getKnownBlogSlugs(): Promise<string[]> {
    const { knownBlogSlugs } = await import("./blog-slugs.generated");
    return [...knownBlogSlugs];
}
