export type BlogPost = {
    slug: string;
    title: string;
    description: string;
    date: string;
    author?: string;
    content: string;
    locale?: string;
};

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
 * Client-side function to fetch a blog post by slug and locale.
 * Works in Cloudflare Workers by fetching static files from /blog/
 */
export async function getBlogPost(slug: string, locale: string = "en"): Promise<BlogPost | null> {
    // Try exact locale first: slug.locale.md
    let filename = `${slug}.${locale}.md`;
    let response = await fetch(`/blog/${filename}`);

    if (!response.ok) {
        // Try default: slug.md
        filename = `${slug}.md`;
        response = await fetch(`/blog/${filename}`);
    }

    // Handle case where default might be explicitly named slug.en.md
    if (!response.ok && locale !== "en") {
        filename = `${slug}.en.md`;
        response = await fetch(`/blog/${filename}`);
    }

    if (!response.ok) {
        return null;
    }

    const fileContent = await response.text();
    const { metadata, content } = parseFrontmatter(fileContent);

    return {
        slug,
        title: metadata.title || slug,
        description: metadata.description || "",
        date: metadata.date || new Date().toISOString(),
        author: metadata.author,
        content,
    };
}

/**
 * Client-side function to get all blog posts for a locale.
 * Note: In Cloudflare environment, we need to know the list of files ahead of time
 * since we can't read directories. This function fetches known posts.
 */
export async function getBlogPosts(locale: string = "en"): Promise<BlogPost[]> {
    // Import auto-generated known slugs
    const { knownBlogSlugs } = await import("./blog-slugs.generated");

    const posts: BlogPost[] = [];

    for (const slug of knownBlogSlugs) {
        try {
            const post = await getBlogPost(slug, locale);
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
