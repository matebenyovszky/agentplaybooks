import BlogPostClient from "./BlogPostClient";
import { getBlogPosts } from "@/lib/blog-server";
import { getLocale } from "next-intl/server";

export const metadata = {
    title: "Blog - AgentPlaybooks",
    description: "Insights and updates from the world of autonomous agents.",
};

// Force static generation - content is loaded via fs at build time
export const dynamic = 'force-static';

export default async function BlogIndexPage() {
    const locale = await getLocale();
    // No baseUrl needed - at build time we use fs, not fetch
    const posts = await getBlogPosts(locale);
    return <BlogPostClient posts={posts} />;
}
