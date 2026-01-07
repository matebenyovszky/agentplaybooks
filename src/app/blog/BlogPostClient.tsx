"use client";

import { motion } from "framer-motion";
import { FloatingNav } from "@/components/ui/floating-navbar";
import Link from "next/link";
import { ChevronRight, Calendar, ArrowLeft, User, Share2, Twitter, Linkedin, Link as LinkIcon, Github } from "lucide-react";
import type { BlogPost } from "@/lib/blog-server";
import { useState } from "react";

type BlogPostClientProps = {
    posts: BlogPost[];
    currentPost?: BlogPost | null;
};

export default function BlogPostClient({ posts, currentPost }: BlogPostClientProps) {
    return (
        <div className="min-h-screen bg-black text-white">
            <FloatingNav />

            <main className="pt-24 pb-16 px-6 lg:px-8 max-w-5xl mx-auto">
                {currentPost ? (
                    <SinglePostView post={currentPost} />
                ) : (
                    <BlogIndexView posts={posts} />
                )}
            </main>
        </div>
    );
}

function BlogIndexView({ posts }: { posts: BlogPost[] }) {
    return (
        <div className="space-y-12">
            <div className="text-center space-y-4">
                <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                    Blog
                </h1>
                <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
                    Thoughts, updates, and guides on building autonomous agents.
                </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                {posts.map((post, idx) => (
                    <motion.article
                        key={post.slug}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="group relative flex flex-col p-6 rounded-2xl bg-neutral-900/50 border border-white/10 hover:border-indigo-500/50 hover:bg-neutral-900 transition-all duration-300"
                    >
                        <div className="flex items-center gap-3 text-sm text-neutral-500 mb-4">
                            <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {new Date(post.date).toLocaleDateString()}
                            </span>
                            {post.author && (
                                <span className="flex items-center gap-1">
                                    <User className="h-3.5 w-3.5" />
                                    {post.author}
                                </span>
                            )}
                        </div>

                        <h2 className="text-2xl font-bold text-white mb-3 group-hover:text-indigo-400 transition-colors">
                            <Link href={`/blog/${post.slug}`} className="focus:outline-none">
                                <span className="absolute inset-0" aria-hidden="true" />
                                {post.title}
                            </Link>
                        </h2>

                        <p className="text-neutral-400 mb-6 flex-1 line-clamp-3">
                            {post.description}
                        </p>

                        <div className="flex items-center text-indigo-400 font-medium text-sm group-hover:translate-x-1 transition-transform">
                            Read more <ChevronRight className="h-4 w-4 ml-1" />
                        </div>
                    </motion.article>
                ))}

                {posts.length === 0 && (
                    <div className="col-span-full text-center py-20 text-neutral-500">
                        No posts found. Check back later!
                    </div>
                )}
            </div>
        </div>
    );
}

function SinglePostView({ post }: { post: BlogPost }) {
    const [copied, setCopied] = useState(false);

    const copyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
    const shareText = `Check out this article: ${post.title}`;

    return (
        <article className="max-w-3xl mx-auto">
            <div className="mb-8">
                <Link href="/blog" className="inline-flex items-center text-sm text-neutral-400 hover:text-white transition-colors mb-6">
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back to Blog
                </Link>

                <div className="flex items-center gap-4 text-sm text-neutral-500 mb-4">
                    <time dateTime={post.date} className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(post.date).toLocaleDateString()}
                    </time>
                    {post.author && (
                        <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {post.author}
                        </span>
                    )}
                </div>

                <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                    {post.title}
                </h1>

                {post.description && (
                    <p className="text-xl text-neutral-300 leading-relaxed border-l-4 border-indigo-500/50 pl-5">
                        {post.description}
                    </p>
                )}
            </div>

            <div className="w-full h-px bg-neutral-800 mb-10" />

            <div className="prose prose-invert prose-lg max-w-none mb-12">
                <MarkdownRenderer content={post.content} />
            </div>

            <div className="border-t border-neutral-800 pt-8 mt-12 mb-20">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="text-neutral-400 font-medium">
                        Share this article
                    </div>
                    <div className="flex items-center gap-3">
                        <a
                            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 bg-neutral-900 rounded-full text-neutral-400 hover:text-sky-400 hover:bg-neutral-800 transition-colors"
                            aria-label="Share on Twitter"
                        >
                            <Twitter className="h-5 w-5" />
                        </a>
                        <a
                            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 bg-neutral-900 rounded-full text-neutral-400 hover:text-blue-500 hover:bg-neutral-800 transition-colors"
                            aria-label="Share on LinkedIn"
                        >
                            <Linkedin className="h-5 w-5" />
                        </a>
                        <button
                            onClick={copyLink}
                            className="p-2.5 bg-neutral-900 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors relative"
                            aria-label="Copy link"
                        >
                            <LinkIcon className="h-5 w-5" />
                            {copied && (
                                <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-indigo-600 text-white px-2 py-1 rounded shadow-lg animate-in fade-in zoom-in duration-200">
                                    Copied!
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </article>
    );
}

// Simple Markdown renderer (reused from Docs)
// In a real app, you might want to extract this to a shared component
function MarkdownRenderer({ content }: { content: string }) {
    const html = parseMarkdown(content);

    return (
        <div
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

function parseMarkdown(md: string): string {
    // Basic Markdown parsing reused from DocsPageClient
    // We recreate it here to avoid dependency issues if DocsPageClient changes
    let html = md
        // Code blocks
        .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
            return `<pre class="bg-neutral-900 border border-neutral-800 rounded-lg p-4 overflow-x-auto mb-6 text-sm"><code class="language-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`;
        })
        // Inline code
        .replace(/`([^`]+)`/g, '<code class="bg-neutral-800 text-indigo-300 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
        // Headers
        .replace(/^#### (.*$)/gm, '<h4 id="$1" class="text-lg font-semibold mt-6 mb-2 text-neutral-200">$1</h4>')
        .replace(/^### (.*$)/gm, '<h3 id="$1" class="text-xl font-semibold mt-8 mb-3 text-white">$1</h3>')
        .replace(/^## (.*$)/gm, '<h2 id="$1" class="text-2xl font-bold mt-10 mb-4 text-white border-b border-neutral-800 pb-2">$1</h2>')
        .replace(/^# (.*$)/gm, '<h1 id="$1" class="text-4xl font-bold mt-6 mb-6 gradient-text">$1</h1>')
        // Bold and italic
        .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em class="italic text-neutral-200">$1</em>')
        // Links (standard markdown links)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">$1</a>')
        // Lists
        .replace(/^\- (.*$)/gm, '<li class="ml-4">$1</li>')
        .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4">$2</li>')
        // Blockquotes
        .replace(/^> (.*$)/gm, '<blockquote class="border-l-4 border-indigo-500 pl-4 my-4 text-neutral-400 italic">$1</blockquote>')
        // Horizontal rules
        .replace(/^---$/gm, '<hr class="border-neutral-800 my-8" />')
        // Paragraphs
        .replace(/\n\n/g, '</p><p class="text-neutral-300 leading-relaxed mb-4">');

    if (!html.startsWith('<')) {
        html = `<p class="text-neutral-300 leading-relaxed mb-4">${html}</p>`;
    }

    // Wrap lists
    html = html.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, (match) => {
        return `<ul class="list-disc list-inside mb-4 space-y-2 text-neutral-300">${match}</ul>`;
    });

    return html;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
