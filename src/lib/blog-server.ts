import fs from "fs";
import path from "path";

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
            metadata[key.trim()] = valueParts.join(":").trim().replace(/^['"](.*)['"]$/, "$1"); // Remove quotes if present
        }
    });

    return { metadata, content };
}

export async function getBlogPosts(locale: string = "en"): Promise<BlogPost[]> {
    const blogDir = path.join(process.cwd(), "public", "blog");

    if (!fs.existsSync(blogDir)) {
        return [];
    }

    const files = await fs.promises.readdir(blogDir);
    const postsMap = new Map<string, BlogPost>();

    // Use a for...of loop to handle async operations sequentially or Promise.all for parallel
    await Promise.all(
        files
            .filter((file) => file.endsWith(".md"))
            .map(async (file) => {
                // Filename format: slug.locale.md or slug.md (default en)
                // We want to group by slug
                let slug = file.replace(/\.md$/, "");
                let fileLocale = "en";

                // Check for localized patterns like hello-world.hu.md
                const parts = slug.split(".");
                if (parts.length > 1 && parts[parts.length - 1].length === 2) {
                    fileLocale = parts.pop()!;
                    slug = parts.join(".");
                }

                // Only process if it matches the requested locale or is a default fallback
                // Current strategy: Load all, then filter/select best match.
                // Actually, better strategy: Group all files by slug, then for each slug, pick best locale.

                return { file, slug, fileLocale };
            })
    ).then(async (fileInfos) => {
        // Group by slug
        const slugGroups = new Map<string, { file: string; fileLocale: string }[]>();

        fileInfos.forEach((info) => {
            if (!slugGroups.has(info.slug)) {
                slugGroups.set(info.slug, []);
            }
            slugGroups.get(info.slug)!.push(info);
        });

        // For each slug, pick the best file
        for (const [slug, variants] of slugGroups.entries()) {
            // 1. Exact match
            let bestVariant = variants.find((v) => v.fileLocale === locale);

            // 2. Fallback to English/defualt if requested locale not found
            if (!bestVariant) {
                bestVariant = variants.find((v) => v.fileLocale === "en");
            }

            // 3. Fallback to any if English not found (unlikely but safe)
            if (!bestVariant && variants.length > 0) {
                bestVariant = variants[0];
            }

            if (bestVariant) {
                const post = await parseBlogPost(bestVariant.file, slug);
                if (post) {
                    postsMap.set(slug, post);
                }
            }
        }
    });

    return Array.from(postsMap.values()).sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );
}

export async function getBlogPost(slug: string, locale: string = "en"): Promise<BlogPost | null> {
    const blogDir = path.join(process.cwd(), "public", "blog");

    // Try exact locale first: slug.locale.md
    let filename = `${slug}.${locale}.md`;
    let filePath = path.join(blogDir, filename);

    if (!fs.existsSync(filePath)) {
        // Try default: slug.md
        filename = `${slug}.md`;
        filePath = path.join(blogDir, filename);
    }

    // Handle case where default might be explicitly named slug.en.md
    if (!fs.existsSync(filePath) && locale !== "en") {
        filename = `${slug}.en.md`;
        filePath = path.join(blogDir, filename);
    }

    if (!fs.existsSync(filePath)) {
        return null;
    }

    return parseBlogPost(filename, slug);
}

async function parseBlogPost(filename: string, slug: string): Promise<BlogPost | null> {
    const filePath = path.join(process.cwd(), "public", "blog", filename);

    try {
        const fileContent = await fs.promises.readFile(filePath, "utf-8");
        const { metadata, content } = parseFrontmatter(fileContent);

        return {
            slug,
            title: metadata.title || slug,
            description: metadata.description || "",
            date: metadata.date || new Date().toISOString(),
            author: metadata.author,
            content,
        };
    } catch (e) {
        console.error(`Error parsing blog post ${filename}:`, e);
        return null;
    }
}
