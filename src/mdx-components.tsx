import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Custom components for MDX rendering
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Headings with anchor links
    h1: ({ children, id }) => (
      <h1 id={id} className="text-4xl font-bold mt-12 mb-6 gradient-text">
        {children}
      </h1>
    ),
    h2: ({ children, id }) => (
      <h2 id={id} className="text-2xl font-bold mt-10 mb-4 text-white border-b border-neutral-800 pb-2">
        {children}
      </h2>
    ),
    h3: ({ children, id }) => (
      <h3 id={id} className="text-xl font-semibold mt-8 mb-3 text-white">
        {children}
      </h3>
    ),
    h4: ({ children, id }) => (
      <h4 id={id} className="text-lg font-semibold mt-6 mb-2 text-neutral-200">
        {children}
      </h4>
    ),

    // Paragraphs
    p: ({ children }) => (
      <p className="text-neutral-300 leading-relaxed mb-4">
        {children}
      </p>
    ),

    // Links
    a: ({ href, children }) => {
      const isExternal = href?.startsWith("http");
      if (isExternal) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
          >
            {children}
          </a>
        );
      }
      return (
        <Link href={href || "#"} className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
          {children}
        </Link>
      );
    },

    // Code blocks
    pre: ({ children }) => (
      <pre className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 overflow-x-auto mb-6 text-sm">
        {children}
      </pre>
    ),
    code: ({ children, className }) => {
      // Inline code
      if (!className) {
        return (
          <code className="bg-neutral-800 text-indigo-300 px-1.5 py-0.5 rounded text-sm font-mono">
            {children}
          </code>
        );
      }
      // Code block (handled by pre)
      return <code className={cn("font-mono text-sm", className)}>{children}</code>;
    },

    // Lists
    ul: ({ children }) => (
      <ul className="list-disc list-inside mb-4 space-y-2 text-neutral-300">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside mb-4 space-y-2 text-neutral-300">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="ml-4">
        {children}
      </li>
    ),

    // Blockquotes
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-indigo-500 pl-4 my-6 text-neutral-400 italic">
        {children}
      </blockquote>
    ),

    // Tables
    table: ({ children }) => (
      <div className="overflow-x-auto mb-6">
        <table className="w-full border-collapse">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-neutral-900 border-b border-neutral-700">
        {children}
      </thead>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-neutral-800">
        {children}
      </tbody>
    ),
    tr: ({ children }) => (
      <tr className="hover:bg-neutral-900/50">
        {children}
      </tr>
    ),
    th: ({ children }) => (
      <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-200">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-4 py-3 text-sm text-neutral-300">
        {children}
      </td>
    ),

    // Horizontal rule
    hr: () => <hr className="border-neutral-800 my-8" />,

    // Images
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt || ""}
        className="rounded-lg border border-neutral-800 my-6 max-w-full"
      />
    ),

    // Strong and emphasis
    strong: ({ children }) => (
      <strong className="font-semibold text-white">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="italic text-neutral-200">{children}</em>
    ),

    ...components,
  };
}


