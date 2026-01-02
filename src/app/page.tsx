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
  Globe
} from "lucide-react";

export default function LandingPage() {
  const t = useTranslations();

  const navItems = [
    { name: t("common.explore"), link: "/explore", icon: <Globe className="h-4 w-4" /> },
    { name: t("common.enterprise"), link: "/enterprise", icon: <Building2 className="h-4 w-4" /> },
    { name: t("common.docs"), link: "/docs", icon: <BookOpen className="h-4 w-4" /> },
  ];

  const features = [
    {
      title: t("landing.features.personas.title"),
      description: t("landing.features.personas.description"),
      icon: <Brain className="h-6 w-6 text-indigo-500" />,
    },
    {
      title: t("landing.features.skills.title"),
      description: t("landing.features.skills.description"),
      icon: <Zap className="h-6 w-6 text-purple-500" />,
    },
    {
      title: t("landing.features.mcp.title"),
      description: t("landing.features.mcp.description"),
      icon: <Server className="h-6 w-6 text-pink-500" />,
    },
    {
      title: t("landing.features.memory.title"),
      description: t("landing.features.memory.description"),
      icon: <Database className="h-6 w-6 text-blue-500" />,
    },
    {
      title: t("landing.features.formats.title"),
      description: t("landing.features.formats.description"),
      icon: <FileJson className="h-6 w-6 text-green-500" />,
    },
    {
      title: t("landing.features.api.title"),
      description: t("landing.features.api.description"),
      icon: <Key className="h-6 w-6 text-yellow-500" />,
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
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <FloatingNav navItems={navItems} />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4">
        <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="white" />
        
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
            className="text-xl md:text-2xl text-neutral-400 max-w-3xl mx-auto mb-10"
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
              href="/login"
              className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full font-semibold text-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              {t("landing.hero.cta")}
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href="https://github.com/your-repo/agentplaybooks"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 border border-neutral-700 rounded-full font-semibold text-lg hover:bg-neutral-900 transition-colors flex items-center justify-center gap-2"
            >
              <Github className="h-5 w-5" />
              GitHub
            </a>
          </motion.div>

          {/* Format badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="mt-12 flex flex-wrap justify-center gap-3"
          >
            {["JSON", "OpenAPI", "MCP", "Markdown"].map((format) => (
              <span
                key={format}
                className="px-3 py-1 text-sm bg-neutral-900 border border-neutral-800 rounded-full text-neutral-400"
              >
                {format}
              </span>
            ))}
          </motion.div>
        </div>

        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
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
                className={i === 3 || i === 6 ? "md:col-span-2" : ""}
              />
            ))}
          </BentoGrid>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 px-4 bg-neutral-950">
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
                className="relative p-6 rounded-2xl bg-neutral-900 border border-neutral-800"
              >
                <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center font-bold text-lg">
                  {step.step}
                </div>
                <div className="mt-4 mb-4 text-indigo-400">{step.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-neutral-400">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Public Repository CTA */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-4xl font-bold mb-6"
          >
            {t("landing.publicRepo.title")}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-xl text-neutral-400 mb-10"
          >
            {t("landing.publicRepo.description")}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              href="/explore/skills"
              className="px-6 py-3 bg-neutral-900 border border-neutral-700 rounded-full hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
            >
              <Zap className="h-5 w-5 text-purple-500" />
              {t("landing.publicRepo.browseSkills")}
            </Link>
            <Link
              href="/explore/mcp"
              className="px-6 py-3 bg-neutral-900 border border-neutral-700 rounded-full hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
            >
              <Server className="h-5 w-5 text-pink-500" />
              {t("landing.publicRepo.browseMCP")}
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-neutral-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-2xl font-bold gradient-text">
            {t("common.appName")}
          </div>
          <div className="text-neutral-500 text-sm">
            © {new Date().getFullYear()} AgentPlaybooks. All rights reserved.
          </div>
          <div className="flex gap-4">
            <a href="https://github.com" className="text-neutral-400 hover:text-white transition-colors">
              <Github className="h-5 w-5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
