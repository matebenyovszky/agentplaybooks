"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion } from "framer-motion";
import { FloatingNav } from "@/components/ui/floating-navbar";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { Spotlight } from "@/components/ui/spotlight";
import {
  Brain,
  Zap,
  Server,
  Database,
  FileJson,
  Key,
  Building2,
  Rocket,
  Users,
  BookOpen,
  ArrowRight,
  Github,
  Globe,
  Play,
  Sparkles,
  FileText,
  Layers,
  HelpCircle,
  Check
} from "lucide-react";
export default function LandingPage() {
  const t = useTranslations();

  const features = [
    {
      title: t("landing.features.personas.title"),
      description: t("landing.features.personas.description"),
      icon: <Brain className="h-6 w-6 text-blue-400" />,
    },
    {
      title: t("landing.features.skills.title"),
      description: t("landing.features.skills.description"),
      icon: <Zap className="h-6 w-6 text-amber-500" />,
    },
    {
      title: t("landing.features.mcp.title"),
      description: t("landing.features.mcp.description"),
      icon: <Server className="h-6 w-6 text-purple-400" />,
    },
    {
      title: t("landing.features.canvas.title"),
      description: t("landing.features.canvas.description"),
      icon: <FileText className="h-6 w-6 text-green-400" />,
      comingSoon: true,
    },
    {
      title: t("landing.features.memory.title"),
      description: t("landing.features.memory.description"),
      icon: <Database className="h-6 w-6 text-cyan-400" />,
    },
    {
      title: t("landing.features.formats.title"),
      description: t("landing.features.formats.description"),
      icon: <FileJson className="h-6 w-6 text-blue-300" />,
    },
    {
      title: t("landing.features.api.title"),
      description: t("landing.features.api.description"),
      icon: <Key className="h-6 w-6 text-amber-600" />,
    },
  ];

  const steps = [
    {
      title: t("landing.howItWorks.step1.title"),
      description: t("landing.howItWorks.step1.description"),
      icon: <BookOpen className="h-8 w-8" />,
      step: "01",
    },
    {
      title: t("landing.howItWorks.step2.title"),
      description: t("landing.howItWorks.step2.description"),
      icon: <Rocket className="h-8 w-8" />,
      step: "02",
    },
    {
      title: t("landing.howItWorks.step3.title"),
      description: t("landing.howItWorks.step3.description"),
      icon: <Users className="h-8 w-8" />,
      step: "03",
    },
  ];

  return (

    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      <FloatingNav />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4">
        <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="#fbbf24" />

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              <span className="gradient-text">{t("landing.hero.title")}</span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl md:text-2xl text-neutral-600 dark:text-neutral-400 max-w-3xl mx-auto mb-10"
          >
            {t("landing.hero.subtitle")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              href="/explore"
              className="px-8 py-4 bg-gradient-to-r from-amber-600 to-amber-400 rounded-full font-semibold text-lg text-slate-900 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25"
            >
              {t("landing.hero.cta")}
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 bg-gradient-to-r from-amber-600 to-amber-500 rounded-full font-semibold text-lg text-slate-900 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25"
            >
              <Play className="h-5 w-5" />
              {t("common.signIn")}
            </Link>
            <a
              href="https://github.com/matebenyovszky/agentplaybooks"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 border border-neutral-300 dark:border-blue-800 rounded-full font-semibold text-lg hover:bg-neutral-100 dark:hover:bg-blue-950/50 dark:hover:border-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <Github className="h-5 w-5" />
              GitHub
            </a>

          </motion.div>

          {/* Tech badges - Trendy keywords */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="mt-12 flex flex-wrap justify-center gap-3"
          >
            {["Agent Rules", "AI Chores", "Skills Store", "Anthropic Skills", "skills.md", "MCP Protocol", "Agent Memory", "OpenAPI", "JSON Schema", "Cursor Rules"].map((tech) => (
              <span
                key={tech}
                className="px-3 py-1 text-sm bg-amber-100 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800/50 rounded-full text-amber-700 dark:text-amber-300"
              >
                {tech}
              </span>
            ))}
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="mt-8 text-lg text-amber-400/80 font-medium"
          >
            The first open source Agent & Robot Skills Store 🦉
          </motion.p>
        </div>

        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
      </section>

      {/* What is a Playbook Section */}
      <section className="py-24 px-4 bg-gradient-to-b from-white via-neutral-50 to-white dark:from-[#0a0f1a] dark:via-[#0d1424] dark:to-[#0a0f1a] relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-transparent" />

        <div className="relative max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
              <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm text-amber-700 dark:text-amber-300">Core Concept</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              <span className="gradient-text">{t("landing.whatIsPlaybook.title")}</span>
            </h2>
            <p className="text-xl text-neutral-600 dark:text-slate-300 max-w-3xl mx-auto mb-4">
              {t("landing.whatIsPlaybook.subtitle")}
            </p>
            <p className="text-lg text-neutral-500 dark:text-slate-400 max-w-2xl mx-auto">
              {t("landing.whatIsPlaybook.description")}
            </p>
          </motion.div>

          {/* Playbook Components Grid */}
          <div className="grid md:grid-cols-5 gap-4 mb-12">
            {/* Persona */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0 }}
              className="p-5 rounded-2xl dark:bg-blue-950/30 bg-white border dark:border-blue-700/30 border-blue-100 hover:border-blue-500/50 shadow-sm transition-all group"
            >
              <div className="w-12 h-12 rounded-xl dark:bg-blue-500/20 bg-blue-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Brain className="w-6 h-6 text-blue-500 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold mb-1 text-neutral-900 dark:text-white">{t("landing.whatIsPlaybook.components.persona.title")}</h3>
              <p className="text-xs text-blue-600 dark:text-blue-300 mb-2">{t("landing.whatIsPlaybook.components.persona.subtitle")}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{t("landing.whatIsPlaybook.components.persona.description")}</p>
            </motion.div>

            {/* Skills */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="p-5 rounded-2xl dark:bg-amber-950/30 bg-white border dark:border-amber-700/30 border-amber-100 hover:border-amber-500/50 shadow-sm transition-all group"
            >
              <div className="w-12 h-12 rounded-xl dark:bg-amber-500/20 bg-amber-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6 text-amber-500 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold mb-1 text-neutral-900 dark:text-white">{t("landing.whatIsPlaybook.components.skills.title")}</h3>
              <p className="text-xs text-amber-600 dark:text-amber-300 mb-2">{t("landing.whatIsPlaybook.components.skills.subtitle")}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{t("landing.whatIsPlaybook.components.skills.description")}</p>
            </motion.div>

            {/* MCP Servers */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="p-5 rounded-2xl dark:bg-purple-950/30 bg-white border dark:border-purple-700/30 border-purple-100 hover:border-purple-500/50 shadow-sm transition-all group"
            >
              <div className="w-12 h-12 rounded-xl dark:bg-purple-500/20 bg-purple-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Server className="w-6 h-6 text-purple-500 dark:text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold mb-1 text-neutral-900 dark:text-white">{t("landing.whatIsPlaybook.components.mcp.title")}</h3>
              <p className="text-xs text-purple-600 dark:text-purple-300 mb-2">{t("landing.whatIsPlaybook.components.mcp.subtitle")}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{t("landing.whatIsPlaybook.components.mcp.description")}</p>
            </motion.div>

            {/* Canvas - Coming Soon */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="p-5 rounded-2xl dark:bg-green-950/30 bg-white border dark:border-green-700/30 border-green-100 hover:border-green-500/50 shadow-sm transition-all group relative opacity-70"
            >
              <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-600 dark:text-purple-300 rounded-full border border-purple-500/30">
                Coming Soon
              </span>
              <div className="w-12 h-12 rounded-xl dark:bg-green-500/20 bg-green-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6 text-green-500 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold mb-1 text-neutral-900 dark:text-white">{t("landing.whatIsPlaybook.components.canvas.title")}</h3>
              <p className="text-xs text-green-600 dark:text-green-300 mb-2">{t("landing.whatIsPlaybook.components.canvas.subtitle")}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{t("landing.whatIsPlaybook.components.canvas.description")}</p>
            </motion.div>

            {/* Memory */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="p-5 rounded-2xl dark:bg-cyan-950/30 bg-white border dark:border-cyan-700/30 border-cyan-100 hover:border-cyan-500/50 shadow-sm transition-all group"
            >
              <div className="w-12 h-12 rounded-xl dark:bg-cyan-500/20 bg-cyan-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Database className="w-6 h-6 text-cyan-500 dark:text-cyan-400" />
              </div>
              <h3 className="text-lg font-semibold mb-1 text-neutral-900 dark:text-white">{t("landing.whatIsPlaybook.components.memory.title")}</h3>
              <p className="text-xs text-cyan-600 dark:text-cyan-300 mb-2">{t("landing.whatIsPlaybook.components.memory.subtitle")}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{t("landing.whatIsPlaybook.components.memory.description")}</p>
            </motion.div>
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-600 to-amber-400 rounded-full font-semibold text-lg text-slate-900 hover:opacity-90 transition-opacity shadow-lg shadow-amber-500/25"
            >
              {t("landing.whatIsPlaybook.cta")}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-4 relative">
        <div className="max-w-7xl mx-auto">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-4xl font-bold text-center mb-16"
          >
            {t("landing.features.title")}
          </motion.h2>

          <BentoGrid className="max-w-6xl mx-auto">
            {features.map((feature, i) => (
              <BentoGridItem
                key={i}
                title={feature.title}
                description={feature.description}
                icon={feature.icon}
                comingSoon={feature.comingSoon}
                className={i === 3 || i === 6 ? "md:col-span-2" : ""}
              />
            ))}
          </BentoGrid>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 px-4 bg-neutral-50 dark:bg-[#070b14]">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-4xl font-bold text-center mb-16"
          >
            {t("landing.howItWorks.title")}
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative p-6 rounded-2xl bg-white dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 shadow-sm dark:shadow-none"
              >
                <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full flex items-center justify-center font-bold text-lg text-slate-900 shadow-lg shadow-amber-500/25">
                  {step.step}
                </div>
                <div className="mt-4 mb-4 text-amber-600 dark:text-amber-400">{step.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-neutral-600 dark:text-slate-400">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ / Use Cases Section */}
      <section className="py-24 px-4 bg-gradient-to-b from-white via-neutral-50 to-white dark:from-[#070b14] dark:via-[#0a0f1a] dark:to-[#070b14]">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
              <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm text-amber-700 dark:text-amber-300">Real Problems, Real Solutions</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              {t("landing.useCases.title")}
            </h2>
            <p className="text-xl text-neutral-600 dark:text-slate-400">
              {t("landing.useCases.subtitle")}
            </p>
          </motion.div>

          <div className="space-y-4">
            {/* Switch Platform */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0 }}
              className="p-6 rounded-2xl bg-white dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/30 hover:border-blue-400 dark:hover:border-blue-500/50 shadow-sm dark:shadow-none transition-all"
            >
              <p className="text-lg md:text-xl font-medium dark:text-white text-neutral-900 mb-3">
                {t("landing.useCases.cases.switchPlatform.question")}
              </p>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-neutral-600 dark:text-slate-400">{t("landing.useCases.cases.switchPlatform.answer")}</p>
              </div>
            </motion.div>

            {/* Portable Skills */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="p-6 rounded-2xl bg-white dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/30 hover:border-amber-400 dark:hover:border-amber-500/50 shadow-sm dark:shadow-none transition-all"
            >
              <p className="text-lg md:text-xl font-medium dark:text-white text-neutral-900 mb-3">
                {t("landing.useCases.cases.portableSkills.question")}
              </p>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-neutral-600 dark:text-slate-400">{t("landing.useCases.cases.portableSkills.answer")}</p>
              </div>
            </motion.div>

            {/* Missing Actions */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="p-6 rounded-2xl bg-white dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/30 hover:border-purple-400 dark:hover:border-purple-500/50 shadow-sm dark:shadow-none transition-all"
            >
              <p className="text-lg md:text-xl font-medium dark:text-white text-neutral-900 mb-3">
                {t("landing.useCases.cases.missingActions.question")}
              </p>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-neutral-600 dark:text-slate-400">{t("landing.useCases.cases.missingActions.answer")}</p>
              </div>
            </motion.div>

            {/* Team Consistency */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="p-6 rounded-2xl bg-white dark:bg-green-950/30 border border-green-200 dark:border-green-800/30 hover:border-green-400 dark:hover:border-green-500/50 shadow-sm dark:shadow-none transition-all"
            >
              <p className="text-lg md:text-xl font-medium dark:text-white text-neutral-900 mb-3">
                {t("landing.useCases.cases.teamConsistency.question")}
              </p>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-neutral-600 dark:text-slate-400">{t("landing.useCases.cases.teamConsistency.answer")}</p>
              </div>
            </motion.div>

            {/* Future Proof */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="p-6 rounded-2xl bg-white dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/30 hover:border-cyan-400 dark:hover:border-cyan-500/50 shadow-sm dark:shadow-none transition-all"
            >
              <p className="text-lg md:text-xl font-medium dark:text-white text-neutral-900 mb-3">
                {t("landing.useCases.cases.futureProof.question")}
              </p>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-neutral-600 dark:text-slate-400">{t("landing.useCases.cases.futureProof.answer")}</p>
              </div>
            </motion.div>

            {/* Local LLM */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              className="p-6 rounded-2xl bg-white dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800/30 hover:border-pink-400 dark:hover:border-pink-500/50 shadow-sm dark:shadow-none transition-all"
            >
              <p className="text-lg md:text-xl font-medium dark:text-white text-neutral-900 mb-3">
                {t("landing.useCases.cases.localLlm.question")}
              </p>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-neutral-600 dark:text-slate-400">{t("landing.useCases.cases.localLlm.answer")}</p>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-600 to-amber-400 rounded-full font-semibold text-lg text-slate-900 hover:opacity-90 transition-opacity shadow-lg shadow-amber-500/25"
            >
              {t("landing.useCases.cta")}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Why AgentPlaybooks - Open Source Value Props */}
      <section className="py-24 px-4 bg-white dark:bg-transparent">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
              <Github className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">100% Open Source</span>
            </div>
            <h2 className="text-4xl font-bold mb-4 text-neutral-900 dark:text-white">
              Your Agent Knowledge, Your Control
            </h2>
            <p className="text-xl text-neutral-600 dark:text-slate-400 max-w-2xl mx-auto">
              Zero vendor lock-in. Portable skills. Self-hostable.
              The knowledge your agents accumulate is valuable - keep it yours.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Sparkles className="h-8 w-8 text-amber-500 dark:text-amber-400" />,
                title: "Skills Marketplace",
                description: "Browse, share, and discover community-created skills. Like an app store, but for AI capabilities.",
              },
              {
                icon: <Server className="h-8 w-8 text-blue-500 dark:text-blue-400" />,
                title: "Self-Host Anywhere",
                description: "Run on your infrastructure - on-premise, private cloud, or air-gapped. Full control, full privacy.",
              },
              {
                icon: <Globe className="h-8 w-8 text-green-500 dark:text-green-400" />,
                title: "Platform Independent",
                description: "Works with Claude, ChatGPT, local LLMs, and future robots. Switch platforms without losing knowledge.",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-6 rounded-2xl bg-neutral-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 hover:border-amber-400 dark:hover:border-amber-500/30 transition-all text-center shadow-sm dark:shadow-none"
              >
                <div className="mb-4 flex justify-center">{item.icon}</div>
                <h3 className="text-xl font-semibold mb-2 text-neutral-900 dark:text-white">{item.title}</h3>
                <p className="text-neutral-600 dark:text-slate-400">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Skills Store CTA */}
      <section className="py-24 px-4 bg-gradient-to-b from-white to-blue-50/50 dark:from-transparent dark:to-blue-900/10">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6"
          >
            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-700 dark:text-amber-300">The Agent App Store</span>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-4xl font-bold mb-6 text-neutral-900 dark:text-white"
          >
            {t("landing.publicRepo.title")}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-xl text-slate-400 mb-10"
          >
            Explore the first online marketplace for AI agent skills, personas, and MCP servers.
            For software agents today, physical robots tomorrow.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              href="/explore"
              className="px-8 py-4 bg-gradient-to-r from-amber-600 to-amber-400 rounded-full font-semibold text-lg text-slate-900 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25"
            >
              <Sparkles className="h-5 w-5" />
              Explore Skills Store
            </Link>
            <Link
              href="/enterprise"
              className="px-6 py-4 bg-blue-950/50 border border-blue-800/50 rounded-full hover:bg-blue-900/50 hover:border-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Building2 className="h-5 w-5 text-blue-400" />
              Enterprise & Self-Hosting
            </Link>
          </motion.div>
        </div>
      </section>

      {/* AI SEO Section - What is AgentPlaybooks */}
      <section className="py-20 px-4 bg-gradient-to-b from-transparent to-blue-50/50 dark:to-blue-950/20">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-bold text-center mb-12"
          >
            What is <span className="gradient-text">AgentPlaybooks</span>?
          </motion.h2>

          <div className="prose dark:prose-invert prose-lg max-w-none">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="space-y-6 text-neutral-600 dark:text-slate-300"
            >
              <p>
                <strong className="text-amber-600 dark:text-amber-400">AgentPlaybooks</strong> is the universal skills store and memory vault for AI agents.
                Whether you&apos;re building with <strong>ChatGPT Custom GPTs</strong>, <strong>Claude Projects</strong>,
                <strong>Gemini Gems</strong>, or <strong>Cursor AI</strong>, AgentPlaybooks provides a platform-independent
                way to store and share your agent&apos;s configuration.
              </p>

              <p>
                Think of it as the <strong>app store for AI agents</strong> - a marketplace where you can find and share
                <strong> agent rules</strong>, <strong>AI chores</strong>, <strong>skills.md files</strong>,
                <strong> personas</strong>, and <strong>MCP servers</strong>. Your agents can access their memory,
                skills, and configuration from any platform.
              </p>

              <div className="grid md:grid-cols-2 gap-6 my-8">
                <div className="p-4 bg-white dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-800/30 shadow-sm dark:shadow-none">
                  <h3 className="text-lg font-semibold text-amber-600 dark:text-amber-400 mb-2">🤖 For AI Agents</h3>
                  <ul className="text-sm space-y-1 text-neutral-600 dark:text-slate-400">
                    <li>• Store agent rules and cursor rules</li>
                    <li>• Define recurring AI chores and tasks</li>
                    <li>• Share skills via skills.md format</li>
                    <li>• Connect MCP servers for tools</li>
                  </ul>
                </div>
                <div className="p-4 bg-white dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-800/30 shadow-sm dark:shadow-none">
                  <h3 className="text-lg font-semibold text-amber-600 dark:text-amber-400 mb-2">🔧 For Developers</h3>
                  <ul className="text-sm space-y-1 text-neutral-600 dark:text-slate-400">
                    <li>• Export to OpenAPI for GPT Actions</li>
                    <li>• Anthropic Skills format support</li>
                    <li>• JSON Schema definitions</li>
                    <li>• Self-host on your infrastructure</li>
                  </ul>
                </div>
              </div>

              <p>
                <strong>Open source</strong> and <strong>self-hostable</strong>, AgentPlaybooks helps you avoid vendor lock-in.
                Your AI agent&apos;s knowledge stays portable - switch between AI platforms without losing anything.
                Perfect for automation, AI assistants, coding agents, and even future physical robots.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-blue-100 dark:border-blue-900/30 bg-neutral-50 dark:bg-transparent">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="text-2xl font-bold gradient-text mb-4">
                {t("common.appName")}
              </div>
              <p className="text-sm text-neutral-500 dark:text-slate-500">
                The universal skills store for AI agents, GPTs, and robots.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-neutral-900 dark:text-slate-300 mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-neutral-500 dark:text-slate-500">
                <li><Link href="/explore" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">Skills Store</Link></li>
                <li><Link href="/docs" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">Documentation</Link></li>
                <li><Link href="/enterprise" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">Enterprise</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-neutral-900 dark:text-slate-300 mb-3">Integrations</h4>
              <ul className="space-y-2 text-sm text-neutral-500 dark:text-slate-500">
                <li>ChatGPT Custom GPTs</li>
                <li>Claude & Anthropic Skills</li>
                <li>Gemini Gems</li>
                <li>Cursor Rules</li>
                <li>MCP Protocol</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-neutral-900 dark:text-slate-300 mb-3">Open Source</h4>
              <ul className="space-y-2 text-sm text-neutral-500 dark:text-slate-500">
                <li>
                  <a href="https://github.com/matebenyovszky/agentplaybooks" target="_blank" rel="noopener noreferrer" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                    GitHub Repository
                  </a>
                </li>
                <li>Self-Hosting Guide</li>
                <li>API Documentation</li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-blue-100 dark:border-blue-900/30 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-neutral-500 dark:text-slate-500 text-sm">
              © {new Date().getFullYear()} AgentPlaybooks. All rights reserved.
            </div>
            <div className="text-xs text-neutral-400 dark:text-slate-600">
              AI Agent Rules • AI Chores • Skills Store • MCP Servers • Agent Memory
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
