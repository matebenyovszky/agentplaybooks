
import fs from "fs";
import path from "path";

export async function getDocContent(slug: string, locale: string = "en"): Promise<string | null> {
    const docsDir = path.join(process.cwd(), "public", "docs");
    const normalizedSlug = slug.toLowerCase().replace(/\.md$/, "");

    // Try exact locale: slug.locale.md
    let filename = `${normalizedSlug}.${locale}.md`;
    let filePath = path.join(docsDir, filename);

    if (normalizedSlug === "readme") {
        // Special case for readme
        if (locale !== "en") {
            filePath = path.join(process.cwd(), `README.${locale}.md`);
            if (!fs.existsSync(filePath)) {
                filePath = path.join(process.cwd(), "README.md");
            }
        } else {
            filePath = path.join(process.cwd(), "README.md");
        }
    } else {

        if (!fs.existsSync(filePath)) {
            // Try without locale (default/en): slug.md
            filename = `${normalizedSlug}.md`;
            filePath = path.join(docsDir, filename);
        }

        // Handle case where default might be explicitly named slug.en.md
        if (!fs.existsSync(filePath) && locale !== "en") {
            filename = `${normalizedSlug}.en.md`;
            filePath = path.join(docsDir, filename);
        }
    }

    if (!fs.existsSync(filePath)) {
        // Fallback for readme if it was requested as "readme" but logic above failed for public docs
        if (normalizedSlug === "readme") {
            const rootReadme = path.join(process.cwd(), "README.md");
            if (fs.existsSync(rootReadme)) {
                return fs.promises.readFile(rootReadme, "utf-8");
            }
        }
        return null;
    }

    try {
        const content = await fs.promises.readFile(filePath, "utf-8");
        return content;
    } catch (e) {
        console.error(`Error reading doc ${slug}:`, e);
        return null;
    }
}
