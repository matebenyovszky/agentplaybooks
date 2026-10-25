import Link from "next/link";
import type { ReactNode } from "react";
import { FloatingNav } from "@/components/ui/floating-navbar";
import type { LegalSection } from "@/lib/legal-copy";

const LINK_CLASS = "text-indigo-600 dark:text-indigo-400 underline underline-offset-2";

// https URLs in the copy become links; everything else stays plain text.
// Contact is GitHub, not email — do not mint mailto: links.
const LINKABLE = /(https:\/\/[^\s)]*[^\s).,])/g;

function linkify(text: string): ReactNode[] {
  return text.split(LINKABLE).map((part, index) => {
    if (index % 2 === 0) return part;
    return (
      <a key={`${part}-${index}`} href={part} className={LINK_CLASS}>
        {part}
      </a>
    );
  });
}

export function LegalDocument({
  title,
  paragraphs,
  sections,
}: {
  title: string;
  paragraphs?: readonly string[];
  sections?: readonly LegalSection[];
}) {
  const allSections: readonly LegalSection[] = sections ?? [{ blocks: paragraphs ?? [] }];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <FloatingNav />
      <main className="max-w-3xl mx-auto px-6 pt-32 pb-20">
        <h1 className="text-4xl font-bold mb-8 text-neutral-900 dark:text-white">{title}</h1>
        <article className="space-y-10">
          {allSections.map((section, sectionIndex) => (
            <section key={section.heading ?? `section-${sectionIndex}`} className="space-y-4">
              {section.heading && (
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">{section.heading}</h2>
              )}
              {section.blocks.map((block, blockIndex) =>
                typeof block === "string" ? (
                  <p key={blockIndex} className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    {linkify(block)}
                  </p>
                ) : (
                  <ul key={blockIndex} className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    {block.map((item) => (
                      <li key={item}>{linkify(item)}</li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}
        </article>
        <nav className="mt-12 pt-8 border-t border-neutral-200 dark:border-neutral-800 text-sm text-neutral-500 dark:text-slate-500 flex gap-4">
          <Link href="/privacy" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
            Terms
          </Link>
        </nav>
      </main>
    </div>
  );
}
