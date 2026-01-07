import { getBlogPost, getBlogPosts } from "@/lib/blog-server";
import { getLocale } from "next-intl/server";
import BlogPostClient from "../BlogPostClient";
import { notFound } from "next/navigation";
import { Metadata } from "next";

type PageProps = {
    params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const resolvedParams = await params;
    const locale = await getLocale();
    const post = await getBlogPost(resolvedParams.slug, locale);

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

export async function generateStaticParams() {
    // Generate params for default locale (en) at build time
    // Dynamic locales will be server-rendered on demand
    const posts = await getBlogPosts("en");
    return posts.map((post) => ({
        slug: post.slug,
    }));
}

export default async function BlogPostPage({ params }: PageProps) {
    const resolvedParams = await params;
    const locale = await getLocale();

    const [currentPost, posts] = await Promise.all([
        getBlogPost(resolvedParams.slug, locale),
        getBlogPosts(locale)
    ]);

    if (!currentPost) {
        notFound();
    }

    return <BlogPostClient posts={posts} currentPost={currentPost} />;
}
