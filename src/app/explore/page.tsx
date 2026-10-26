import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowDown, ArrowRight, BookOpen, Check, FileText, GitBranch, Layers, Lightbulb, Link2, MessageSquare, Search, ShieldCheck } from "lucide-react";
import { FloatingNav } from "@/components/ui/floating-navbar";

// Curated first-party examples, not a live catalog. Canonical links also work
// for self-hosted installs with a separate database.
const starters = [
  { key: "handoff", guid: "7df83339bbdf4a71", icon: GitBranch },
  { key: "research", guid: "5db1054925da4244", icon: Search },
  { key: "review", guid: "334cd3082c2a4d1b", icon: ShieldCheck },
] as const;

const primaryLink = "inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 px-6 py-3 font-semibold text-slate-950 transition-colors hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500";
const secondaryLink = "inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 px-6 py-3 font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500";

export default async function ExplorePage() {
  const t = await getTranslations("explore");

  return (
    <div className="min-h-screen bg-[#faf9f6] text-slate-900 dark:bg-[#080e1b] dark:text-slate-100">
      <FloatingNav />
      <main id="main-content" className="mx-auto max-w-7xl px-5 pb-12 pt-36 sm:px-8 lg:px-12">
        <section aria-labelledby="explore-title" className="grid items-center gap-12 pb-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-28">
          <div>
            <p className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />{t("eyebrow")}
            </p>
            <h1 id="explore-title" className="max-w-2xl text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">{t("title")}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">{t("subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/dashboard" prefetch={false} className={primaryLink}>{t("create")}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /></Link>
              <a href="#how-it-works" className={secondaryLink}>{t("howLink")}<ArrowDown aria-hidden="true" className="h-4 w-4 shrink-0" /></a>
            </div>
            <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">{t("clients")}</p>
          </div>
          <figure className="relative min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 sm:p-7 dark:border-slate-800 dark:bg-slate-900/60">
            <figcaption className="mb-6 flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400"><Lightbulb aria-hidden="true" className="h-4 w-4 text-amber-500" />{t("exampleLabel")}</figcaption>
            <div className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("exampleAskLabel")}</p>
              <p className="text-lg font-medium leading-relaxed">{t("exampleAsk")}</p>
            </div>
            <div className="flex justify-center py-4"><ArrowDown aria-hidden="true" className="h-5 w-5 text-slate-400" /></div>
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/5">
              <div className="mb-4 flex items-center gap-2 font-semibold"><BookOpen aria-hidden="true" className="h-5 w-5 text-amber-600 dark:text-amber-400" />{t("examplePlaybook")}</div>
              <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {["rules", "skill", "memory"].map((key) => <li key={key} className="flex items-start gap-2"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />{t(`example.${key}`)}</li>)}
              </ul>
            </div>
            <div className="flex justify-center py-4"><ArrowDown aria-hidden="true" className="h-5 w-5 text-slate-400" /></div>
            <p className="flex items-start gap-3 text-sm leading-relaxed"><MessageSquare aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />{t("exampleResult")}</p>
          </figure>
        </section>

        <section id="use-cases" aria-labelledby="use-cases-title" className="scroll-mt-28 border-t border-slate-200 py-16 dark:border-slate-800 sm:py-20">
          <div className="mb-10 max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">{t("casesEyebrow")}</p>
            <h2 id="use-cases-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("casesTitle")}</h2>
            <p className="mt-4 leading-relaxed text-slate-600 dark:text-slate-400">{t("casesIntro")}</p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {starters.map(({ key, guid, icon: Icon }, index) => (
              <article key={key} className="flex min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-6 sm:p-7 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="mb-7 flex items-center justify-between"><Icon aria-hidden="true" className="h-7 w-7 text-amber-600 dark:text-amber-400" /><span className="font-mono text-sm text-slate-400">0{index + 1}</span></div>
                <h3 className="text-xl font-semibold">{t(`cases.${key}.title`)}</h3>
                <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-400">{t(`cases.${key}.description`)}</p>
                <blockquote className="my-6 border-l-2 border-amber-400 pl-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t(`cases.${key}.prompt`)}</blockquote>
                <a href={`https://agentplaybooks.ai/dashboard/playbook/${guid}`} className="mt-auto inline-flex items-center gap-2 pt-3 text-sm font-semibold text-amber-800 underline-offset-4 hover:underline dark:text-amber-400">{t("openStarter")}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /></a>
              </article>
            ))}
          </div>
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t("starterNote")}</p>
        </section>

        <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-28 rounded-3xl bg-slate-900 px-6 py-12 text-white sm:px-10 sm:py-14 dark:border dark:border-slate-800 dark:bg-slate-900/60">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-400">{t("howEyebrow")}</p>
          <h2 id="how-title" className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{t("howTitle")}</h2>
          <ol className="mt-10 grid gap-9 md:grid-cols-3 md:gap-8">
            {["start", "connect", "continue"].map((key, index) => (
              <li key={key}>
                <span className="mb-5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-600 font-mono text-sm text-amber-300">{index + 1}</span>
                <h3 className="mb-3 text-lg font-semibold">{t(`steps.${key}.title`)}</h3>
                <p className="leading-relaxed text-slate-300">{t(`steps.${key}.description`)}</p>
              </li>
            ))}
          </ol>
          <Link href="/docs/getting-started" prefetch={false} className="mt-9 inline-flex items-center gap-2 text-sm font-semibold text-amber-300 underline-offset-4 hover:underline">{t("setupGuide")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </section>

        <section aria-labelledby="anatomy-title" className="grid gap-8 py-16 sm:py-20 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div><h2 id="anatomy-title" className="text-3xl font-semibold tracking-tight">{t("anatomyTitle")}</h2><p className="mt-4 leading-relaxed text-slate-600 dark:text-slate-400">{t("anatomyIntro")}</p></div>
          <dl className="grid gap-7 sm:grid-cols-2">
            {[{ key: "instructions", icon: FileText }, { key: "skills", icon: Layers }, { key: "memory", icon: BookOpen }, { key: "tools", icon: Link2 }].map(({ key, icon: Icon }) => (
              <div key={key}><dt className="mb-2 flex items-center gap-2 font-semibold"><Icon aria-hidden="true" className="h-4 w-4 text-amber-600 dark:text-amber-400" />{t(`anatomy.${key}.title`)}</dt><dd className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t(`anatomy.${key}.description`)}</dd></div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="questions-title" className="border-t border-slate-200 py-12 dark:border-slate-800 sm:py-16">
          <h2 id="questions-title" className="mb-7 text-2xl font-semibold">{t("questionsTitle")}</h2>
          <div className="max-w-3xl divide-y divide-slate-200 dark:divide-slate-800">
            {["clients", "privacy", "tools"].map((key) => (
              <details key={key} className="py-5"><summary className="cursor-pointer font-medium marker:text-amber-500">{t(`faq.${key}.question`)}</summary><p className="mt-3 pl-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t(`faq.${key}.answer`)}</p></details>
            ))}
          </div>
        </section>

        <section aria-labelledby="start-title" className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-10 sm:px-10 dark:border-amber-500/20 dark:bg-amber-500/5">
          <h2 id="start-title" className="text-2xl font-semibold sm:text-3xl">{t("startTitle")}</h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-slate-600 dark:text-slate-400">{t("startDescription")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard" prefetch={false} className={primaryLink}>{t("create")}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /></Link>
            <a href="#use-cases" className={secondaryLink}>{t("browseExamples")}</a>
          </div>
        </section>
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/" prefetch={false} className="font-semibold text-slate-800 dark:text-slate-200">AgentPlaybooks</Link>
          <div className="flex flex-wrap gap-6"><Link href="/docs" prefetch={false} className="hover:underline">{t("docs")}</Link><Link href="/privacy" prefetch={false} className="hover:underline">{t("privacy")}</Link></div>
        </footer>
      </main>
    </div>
  );
}
