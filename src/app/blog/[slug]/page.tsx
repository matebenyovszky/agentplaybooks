import { getBlogPost, getBlogPosts } from "@/lib/blog-server";
import { getLocale } from "next-intl/server";
import BlogPostClient from "../BlogPostClient";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { getRequestBaseUrl } from "@/lib/request-base-url";

type PageProps = {
    params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const resolvedParams = await params;
    const locale = await getLocale();
    const baseUrl = await getRequestBaseUrl();
    const post = await getBlogPost(resolvedParams.slug, locale, baseUrl);

    if (!post) {
        return {
            title: "Post Not Found",
        };
    }

    return {
        title: `${post.title} - Blog`,
        description: post.description,
    };
}

// Use request-aware rendering so locale and content can follow cookies.
export const dynamic = "force-dynamic";

export default async function BlogPostPage({ params }: PageProps) {
    const resolvedParams = await params;
    const locale = await getLocale();
    const baseUrl = await getRequestBaseUrl();
    const [currentPost, posts] = await Promise.all([
        getBlogPost(resolvedParams.slug, locale, baseUrl),
        getBlogPosts(locale, baseUrl)
    ]);

    if (!currentPost) {
        notFound();
    }

    return <BlogPostClient posts={posts} currentPost={currentPost} />;
}
