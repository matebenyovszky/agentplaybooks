import BlogPostClient from "./BlogPostClient";
import { getBlogPosts } from "@/lib/blog-server";
import { getLocale } from "next-intl/server";

export const metadata = {
    title: "Blog - AgentPlaybooks",
    description: "Insights and updates from the world of autonomous agents.",
};

export default async function BlogIndexPage() {
    const locale = await getLocale();
    const posts = await getBlogPosts(locale);
    return <BlogPostClient posts={posts} />;
}
