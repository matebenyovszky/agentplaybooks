import BlogPostClient from "./BlogPostClient";
import { getBlogPosts } from "@/lib/blog-server";
import { getLocale } from "next-intl/server";
import { getRequestBaseUrl } from "@/lib/request-base-url";

export const metadata = {
    title: "Blog - AgentPlaybooks",
    description: "Insights and updates from the world of autonomous agents.",
};

// Use request-aware rendering so locale and content can follow cookies.
export const dynamic = "force-dynamic";

export default async function BlogIndexPage() {
    const locale = await getLocale();
    const baseUrl = await getRequestBaseUrl();
    const posts = await getBlogPosts(locale, baseUrl);
    return <BlogPostClient posts={posts} />;
}
