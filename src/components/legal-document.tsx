import Link from "next/link";
import { FloatingNav } from "@/components/ui/floating-navbar";

const REPO_URL = "https://github.com/matebenyovszky/agentplaybooks";

function withRepoLink(text: string) {
  if (!text.includes(REPO_URL)) return text;

  const parts = text.split(REPO_URL);
  return parts.flatMap((part, index) =>
    index === 0
      ? [part]
      : [
          <a
            key={`${REPO_URL}-${index}`}
            href={REPO_URL}
            className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2"
          >
            {REPO_URL}
          </a>,
          part,
        ],
  );
}

export function LegalDocument({
  title,
  paragraphs,
}: {
  title: string;
  paragraphs: readonly string[];
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <FloatingNav />
      <main className="max-w-3xl mx-auto px-6 pt-32 pb-20">
        <h1 className="text-4xl font-bold mb-8 text-neutral-900 dark:text-white">{title}</h1>
        <article className="space-y-6">
          {paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
              {withRepoLink(paragraph)}
            </p>
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
