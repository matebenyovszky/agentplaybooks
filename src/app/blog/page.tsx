import BlogPostClient from "./BlogPostClient";
import { getBlogPosts } from "@/lib/blog-server";
import { getLocale } from "next-intl/server";

export const metadata = {
    title: "Blog - AgentPlaybooks",
    description: "Insights and updates from the world of autonomous agents.",
};

import { headers } from "next/headers";

export default async function BlogIndexPage() {
    const locale = await getLocale();
    const headersList = await headers();
    const host = headersList.get("host") || "localhost:3000";
    const protocol = headersList.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;

    const posts = await getBlogPosts(locale, baseUrl);
    return <BlogPostClient posts={posts} />;
}
