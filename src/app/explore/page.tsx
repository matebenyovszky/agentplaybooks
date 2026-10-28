import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  FileText,
  GitBranch,
  KeyRound,
  Layers,
  Link2,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserRound,
} from "lucide-react";
import { FloatingNav } from "@/components/ui/floating-navbar";
import styles from "./explore.module.css";

// Hosted first-party starters belong to the demo/system account. These links
// also work from self-hosted installations, without querying a public catalog.
const workflows = [
  { key: "handoff", guid: "7df83339bbdf4a71", icon: GitBranch },
  { key: "research", guid: "5db1054925da4244", icon: Search },
  { key: "review", guid: "334cd3082c2a4d1b", icon: ShieldCheck },
] as const;

export default async function ExplorePage() {
  const t = await getTranslations("explore");

  return (
    <div className={styles.page}>
      <FloatingNav />
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="explore-title">
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={styles.wrap}>
            <div className={styles.heroTopline}>
              <span>
                <span className={styles.statusDot} />
                {t("eyebrow")}
              </span>
              <span className={styles.edition}>01 / {t("fieldGuide")}</span>
            </div>
            <div className={styles.heroColumns}>
              <div className={styles.heroCopy}>
                <h1 id="explore-title">
                  {t("title")}
                  <span className="gradient-text">{t("titleAccent")}</span>
                </h1>
                <p className={styles.heroIntro}>{t("subtitle")}</p>
                <div className={styles.actions}>
                  <a href="#use-cases" className={styles.primary}>
                    {t("tryWorkflow")}
                    <ArrowDown size={17} aria-hidden="true" />
                  </a>
                  <Link
                    href="/dashboard"
                    prefetch={false}
                    className={styles.heroSecondary}
                  >
                    {t("create")}
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </Link>
                </div>
                <p className={styles.heroNote}>
                  <Check size={15} aria-hidden="true" />
                  {t("heroNote")}
                </p>
              </div>

              <figure className={styles.diagram}>
                <figcaption>
                  {t("exampleLabel")}
                  <span>PROJECT / NORTHSTAR</span>
                </figcaption>
                <div className={styles.agentRow}>
                  <span>
                    <MessageSquare size={14} aria-hidden="true" />
                    ChatGPT
                  </span>
                  <span>
                    <Terminal size={14} aria-hidden="true" />
                    Codex
                  </span>
                  <span>
                    <Sparkles size={14} aria-hidden="true" />
                    Claude
                  </span>
                </div>
                <svg
                  className={styles.connectors}
                  viewBox="0 0 400 48"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M65 0V13Q65 24 77 24H188Q200 24 200 36V48M200 0V48M335 0V13Q335 24 323 24H212Q200 24 200 36" />
                  <circle cx="200" cy="42" r="3" />
                </svg>
                <div className={styles.paper}>
                  <div className={styles.paperHeading}>
                    <span className={styles.bookMark}>
                      <Layers size={24} aria-hidden="true" />
                    </span>
                    <div>
                      <small>{t("onePlaybook")}</small>
                      <strong>Northstar</strong>
                    </div>
                    <span className={styles.privateBadge}>
                      <ShieldCheck size={11} aria-hidden="true" />
                      {t("private")}
                    </span>
                  </div>
                  <div className={styles.paperRow}>
                    <FileText size={16} aria-hidden="true" />
                    <div>
                      <b>{t("anatomy.instructions.title")}</b>
                      <span>{t("heroRules")}</span>
                    </div>
                    <span className={styles.paperIndex}>01</span>
                  </div>
                  <div className={styles.paperRow}>
                    <Layers size={16} aria-hidden="true" />
                    <div>
                      <b>{t("anatomy.skills.title")}</b>
                      <span>{t("heroSkill")}</span>
                    </div>
                    <span className={styles.paperIndex}>02</span>
                  </div>
                  <div className={styles.paperRow}>
                    <BookOpen size={16} aria-hidden="true" />
                    <div>
                      <b>{t("anatomy.memory.title")}</b>
                      <span>{t("heroMemory")}</span>
                    </div>
                    <span className={styles.paperIndex}>03</span>
                  </div>
                  <div className={styles.paperFoot}>
                    <span className={styles.statusDot} />
                    {t("heroContext")}
                  </div>
                </div>
                <div className={styles.nextSession}>
                  <div className={styles.nextIcon}>
                    <ArrowRight size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <small>{t("nextSession")}</small>
                    <p>{t("nextSessionExample")}</p>
                  </div>
                  <CheckCheck size={19} aria-hidden="true" />
                </div>
              </figure>
            </div>
            <div className={styles.heroFooter}>
              <span>{t("clientsLabel")}</span>
              <div>
                {["ChatGPT", "Codex", "Claude", "Cursor", "Hermes"].map(
                  (name) => (
                    <span key={name}>{name}</span>
                  ),
                )}
                <span>{t("andMore")}</span>
              </div>
            </div>
          </div>
        </section>

        <nav className={styles.sectionNav} aria-label={t("pageNavigation")}>
          <div className={styles.wrap}>
            <a href="#use-cases">
              <span>01</span>
              {t("navWorkflows")}
            </a>
            <a href="#inside">
              <span>02</span>
              {t("navInside")}
            </a>
            <a href="#how-it-works">
              <span>03</span>
              {t("navStart")}
            </a>
          </div>
        </nav>

        <section
          id="use-cases"
          className={styles.section}
          aria-labelledby="use-cases-title"
        >
          <div className={styles.wrap}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.kicker}>{t("casesEyebrow")}</p>
                <h2 id="use-cases-title">{t("casesTitle")}</h2>
              </div>
              <p>{t("casesIntro")}</p>
            </div>

            <div className={styles.lab}>
              <fieldset className={styles.choices}>
                <legend className={styles.srOnly}>{t("chooseWorkflow")}</legend>
                {workflows.map(({ key, icon: Icon }, index) => (
                  <label key={key} className={styles.choice}>
                    <input
                      className={styles[`radio_${key}`]}
                      type="radio"
                      name="explore-workflow"
                      value={key}
                      defaultChecked={index === 0}
                      aria-label={t(`cases.${key}.title`)}
                    />
                    <Icon size={21} aria-hidden="true" />
                    <span>
                      <strong>{t(`cases.${key}.title`)}</strong>
                      <small>{t(`cases.${key}.tagline`)}</small>
                    </span>
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </label>
                ))}
              </fieldset>
              {workflows.map(({ key, guid }, index) => (
                <article
                  key={key}
                  className={`${styles.panel} ${styles[`panel_${key}`]}`}
                  aria-labelledby={`workflow-title-${key}`}
                >
                  <header className={styles.panelHeader}>
                    <div>
                      <span className={styles.exampleNumber}>
                        0{index + 1} / {t("workedExample")}
                      </span>
                      <h3 id={`workflow-title-${key}`}>
                        {t(`cases.${key}.headline`)}
                      </h3>
                    </div>
                    <p>{t(`cases.${key}.description`)}</p>
                  </header>
                  <div className={styles.workflowGrid}>
                    <div className={styles.request}>
                      <p className={styles.stageLabel}>
                        <span>01</span>
                        {t("requestLabel")}
                      </p>
                      <MessageSquare size={23} aria-hidden="true" />
                      <blockquote>{t(`cases.${key}.prompt`)}</blockquote>
                      <p className={styles.requestNote}>
                        {t(`cases.${key}.situation`)}
                      </p>
                    </div>
                    <div className={styles.context}>
                      <p className={styles.stageLabel}>
                        <span>02</span>
                        {t("contextLabel")}
                      </p>
                      {["goal", "skill", "memory"].map((part, partIndex) => (
                        <div key={part} className={styles.contextItem}>
                          <span className={styles.contextIndex}>
                            0{partIndex + 1}
                          </span>
                          <div>
                            <b>{t(`contextTypes.${part}`)}</b>
                            <p>{t(`cases.${key}.context.${part}`)}</p>
                          </div>
                        </div>
                      ))}
                      <div className={styles.contextNote}>
                        <Layers size={14} aria-hidden="true" />
                        {t("contextNote")}
                      </div>
                    </div>
                    <div className={styles.result}>
                      <p className={styles.stageLabel}>
                        <span>03</span>
                        {t("resultLabel")}
                      </p>
                      <div className={styles.resultHeader}>
                        <CheckCheck size={19} aria-hidden="true" />
                        <b>{t(`cases.${key}.resultTitle`)}</b>
                      </div>
                      <ol>
                        {["one", "two", "three"].map((part) => (
                          <li key={part}>
                            {t(`cases.${key}.results.${part}`)}
                          </li>
                        ))}
                      </ol>
                      <p className={styles.resultNote}>{t("illustrative")}</p>
                    </div>
                  </div>
                  <footer className={styles.panelFooter}>
                    <p>
                      <BookOpen size={17} aria-hidden="true" />
                      {t(`cases.${key}.starter`)}
                    </p>
                    <a
                      href={`https://agentplaybooks.ai/dashboard/playbook/${guid}`}
                    >
                      {t("openStarter")}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                  </footer>
                </article>
              ))}
            </div>
            <p className={styles.starterNote}>
              <ShieldCheck size={17} aria-hidden="true" />
              {t("starterNote")}
            </p>
          </div>
        </section>

        <section
          id="inside"
          className={styles.inside}
          aria-labelledby="inside-title"
        >
          <div className={`${styles.wrap} ${styles.insideGrid}`}>
            <div className={styles.insideIntro}>
              <p className={styles.kicker}>{t("anatomyEyebrow")}</p>
              <h2 id="inside-title">{t("anatomyTitle")}</h2>
              <p>{t("anatomyIntro")}</p>
              <div className={styles.contextPrinciple}>
                <Layers size={23} aria-hidden="true" />
                <strong>{t("contextPrinciple")}</strong>
                <span>{t("contextPrincipleDetail")}</span>
              </div>
            </div>
            <dl className={styles.anatomyGrid}>
              {[
                { key: "persona", icon: UserRound },
                { key: "instructions", icon: FileText },
                { key: "skills", icon: Layers },
                { key: "memory", icon: BookOpen },
                { key: "tools", icon: Link2 },
                { key: "secrets", icon: KeyRound },
              ].map(({ key, icon: Icon }, index) => (
                <div key={key} className={styles.anatomyItem}>
                  <div className={styles.anatomyTop}>
                    <Icon size={20} aria-hidden="true" />
                    <span>0{index + 1}</span>
                  </div>
                  <dt>{t(`anatomy.${key}.title`)}</dt>
                  <dd>
                    <p>{t(`anatomy.${key}.description`)}</p>
                    <span>{t(`anatomy.${key}.example`)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section
          id="how-it-works"
          className={styles.section}
          aria-labelledby="how-title"
        >
          <div className={styles.wrap}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.kicker}>{t("howEyebrow")}</p>
                <h2 id="how-title">{t("howTitle")}</h2>
              </div>
              <p>{t("howIntro")}</p>
            </div>
            <ol className={styles.steps}>
              {["start", "connect", "continue"].map((key, index) => (
                <li key={key}>
                  <span className={styles.stepNumber}>0{index + 1}</span>
                  <h3>{t(`steps.${key}.title`)}</h3>
                  <p>{t(`steps.${key}.description`)}</p>
                  <span className={styles.stepOutcome}>
                    <Check size={15} aria-hidden="true" />
                    {t(`steps.${key}.outcome`)}
                  </span>
                </li>
              ))}
            </ol>
            <div className={styles.connectionHeading}>
              <h3>{t("connectionTitle")}</h3>
              <p>{t("connectionIntro")}</p>
            </div>
            <div className={styles.connections}>
              {[
                {
                  key: "chat",
                  icon: MessageSquare,
                  href: "/docs/platform-integrations",
                },
                { key: "code", icon: Terminal, href: "/docs/cli" },
                { key: "automate", icon: Link2, href: "/docs/management-api" },
              ].map(({ key, icon: Icon, href }) => (
                <Link
                  key={key}
                  href={href}
                  prefetch={false}
                  className={styles.connection}
                >
                  <Icon size={24} aria-hidden="true" />
                  <span>
                    <b>{t(`connections.${key}.title`)}</b>
                    <small>{t(`connections.${key}.description`)}</small>
                    <em>{t(`connections.${key}.label`)}</em>
                  </span>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.faq} aria-labelledby="questions-title">
          <div className={`${styles.wrap} ${styles.faqGrid}`}>
            <div>
              <p className={styles.kicker}>{t("faqEyebrow")}</p>
              <h2 id="questions-title">{t("questionsTitle")}</h2>
              <Link href="/docs/getting-started" prefetch={false}>
                {t("setupGuide")}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div>
              {["memory", "execution", "privacy", "tools"].map((key) => (
                <details key={key}>
                  <summary>
                    {t(`faq.${key}.question`)}
                    <span aria-hidden="true">+</span>
                  </summary>
                  <p>{t(`faq.${key}.answer`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.closing} aria-labelledby="start-title">
          <div className={styles.wrap}>
            <div className={styles.closingIcon} aria-hidden="true">
              <Layers size={36} />
            </div>
            <p className={styles.kicker}>{t("startEyebrow")}</p>
            <h2 id="start-title">{t("startTitle")}</h2>
            <p>{t("startDescription")}</p>
            <div className={styles.actions}>
              <Link
                href="/dashboard"
                prefetch={false}
                className={styles.primary}
              >
                {t("create")}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <a href="#use-cases" className={styles.closingLink}>
                {t("browseExamples")}
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <Link href="/" prefetch={false}>
            AgentPlaybooks<span>{t("footerTagline")}</span>
          </Link>
          <div>
            <Link href="/docs" prefetch={false}>
              {t("docs")}
            </Link>
            <Link href="/privacy" prefetch={false}>
              {t("privacy")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
