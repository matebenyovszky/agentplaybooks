"use client";

import { motion } from "framer-motion";
import {
  Building2,
  Globe,
  BookOpen,
  CheckCircle2,
  ArrowRight,
  Bot,
  Network,
  Unlock,
  Server,
  GitFork,
  Cpu,
  Boxes,
  ShoppingBag,
  Sparkles,
  Code2,
  RefreshCw,
  Shield,
  Github,
  Rocket,
  LayoutDashboard,
  Layers,
  Play,
  Eye,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { FloatingNav } from "@/components/ui/floating-navbar";
import { useTranslations } from "next-intl";

const whyOpenSource = [
  {
    icon: Unlock,
    title: "Zero Vendor Lock-in",
    description:
      "Your agent knowledge belongs to you. Export, migrate, or self-host anytime. No proprietary formats, no data hostage.",
  },
  {
    icon: Server,
    title: "Self-Host Anywhere",
    description:
      "Run on your own infrastructure - on-premise, private cloud, or air-gapped environments. Full control, full privacy.",
  },
  {
    icon: GitFork,
    title: "Fork & Customize",
    description:
      "Modify the codebase to fit your exact needs. Add custom integrations, extend functionality, contribute back.",
  },
  {
    icon: Shield,
    title: "Audit & Compliance",
    description:
      "Review every line of code. Meet regulatory requirements with full transparency. No black boxes.",
  },
  {
    icon: RefreshCw,
    title: "Portable Knowledge",
    description:
      "Switch AI platforms without losing anything. Your skills work on Claude, ChatGPT, local LLMs, and future platforms.",
  },
  {
    icon: Code2,
    title: "Standard Formats",
    description:
      "skills.md, Anthropic Skills format, OpenAPI, MCP protocol. Industry standards that will outlast any single vendor.",
  },
];

const forWho = [
  {
    icon: Bot,
    title: "Software Agents",
    description:
      "ChatGPT, Claude, Gemini, local LLMs, custom AI assistants. Any agent that can follow instructions benefits from playbooks.",
    examples: [
      "Coding assistants with your team's conventions",
      "Customer support bots with company policies",
      "Research agents with domain expertise",
    ],
  },
  {
    icon: Cpu,
    title: "Physical Robots",
    description:
      "Industrial robots, home assistants, autonomous vehicles. The same playbook format works for embodied AI systems.",
    examples: [
      "Warehouse robots with operational procedures",
      "Medical robots with safety protocols",
      "Service robots with interaction guidelines",
    ],
  },
  {
    icon: Network,
    title: "Multi-Agent Systems",
    description:
      "Orchestrate fleets of agents with shared knowledge. Consistent behavior across hundreds of instances.",
    examples: [
      "Enterprise AI deployments",
      "Distributed processing pipelines",
      "Coordinated agent swarms",
    ],
  },
];

const marketplaceFeatures = [
  {
    icon: ShoppingBag,
    title: "Skills Marketplace",
    description:
      "Browse, share, and discover community-created skills. The first online store for AI agent capabilities.",
  },
  {
    icon: Boxes,
    title: "MCP Server Registry",
    description:
      "Find and deploy Model Context Protocol servers. Extend your agents with tools, resources, and integrations.",
  },
  {
    icon: Sparkles,
    title: "Persona Templates",
    description:
      "Pre-built AI personalities for common use cases. Customize and deploy in minutes, not hours.",
  },
];

export default function EnterprisePage() {
  const t = useTranslations();
  
  const navItems = [
    { name: t("common.explore"), link: "/explore", icon: <Globe className="h-4 w-4" /> },
    { name: t("common.enterprise"), link: "/enterprise", icon: <Building2 className="h-4 w-4" /> },
    { name: t("common.docs"), link: "/docs", icon: <BookOpen className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white">
      <FloatingNav navItems={navItems} />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent" />

        <div className="relative max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
              <Github className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-300">100% Open Source</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-200 to-amber-400">
              The First Agent &
              <br />
              Robot Skills Store
            </h1>

            <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-6">
              A platform-independent marketplace for AI capabilities. 
              Share skills, personas, and MCP servers across any agent - 
              from ChatGPT to physical robots.
            </p>

            <p className="text-lg text-amber-400 max-w-2xl mx-auto mb-10 font-medium">
              Open source. Self-hostable. Zero vendor lock-in.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-600 to-amber-400 text-slate-900 hover:opacity-90 rounded-full font-semibold transition-colors shadow-lg shadow-amber-500/25"
              >
                Explore Skills Store
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="https://github.com/agentplaybooks/agentplaybooks"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 bg-blue-950/50 hover:bg-blue-900/50 rounded-full font-semibold transition-colors border border-blue-800/50"
              >
                <Github className="w-5 h-5" />
                View on GitHub
              </a>
            </div>

            {/* Tech badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="mt-12 flex flex-wrap justify-center gap-3"
            >
              {["Anthropic Skills", "skills.md", "MCP Protocol", "OpenAPI", "JSON Schema", "Docker Ready"].map((tech) => (
                <span
                  key={tech}
                  className="px-3 py-1 text-sm bg-blue-950/50 border border-blue-800/50 rounded-full text-blue-300"
                >
                  {tech}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Why Open Source */}
      <section className="py-20 border-t border-blue-900/30">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold mb-4">Why Open Source?</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Your AI knowledge is valuable. Don't let it be locked in proprietary platforms.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {whyOpenSource.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-xl bg-blue-950/30 border border-blue-900/50 hover:border-green-500/30 transition-all hover:bg-blue-950/50"
              >
                <item.icon className="w-10 h-10 text-green-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* For Software & Physical Agents */}
      <section className="py-20 bg-gradient-to-b from-blue-900/10 to-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold mb-4">For Every Kind of Agent</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              From code assistants to warehouse robots - the same playbook format works everywhere
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {forWho.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-8 rounded-2xl bg-gradient-to-b from-blue-950/50 to-transparent border border-blue-900/50 hover:border-amber-500/30 transition-colors"
              >
                <div className="w-14 h-14 rounded-xl bg-amber-500/20 flex items-center justify-center mb-6">
                  <item.icon className="w-7 h-7 text-amber-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-slate-400 mb-6">{item.description}</p>
                <ul className="space-y-2">
                  {item.examples.map((example) => (
                    <li
                      key={example}
                      className="flex items-center gap-2 text-sm text-slate-300"
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                      {example}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Skills Marketplace */}
      <section className="py-20 border-t border-blue-900/30">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
              <ShoppingBag className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-amber-300">The Agent App Store</span>
            </div>
            <h2 className="text-4xl font-bold mb-4">Skills Marketplace</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Like an app store, but for AI capabilities. Browse, share, and discover 
              what your agents can learn.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {marketplaceFeatures.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-8 rounded-2xl bg-gradient-to-b from-amber-900/20 to-transparent border border-amber-500/20 hover:border-amber-500/40 transition-colors text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-6 mx-auto">
                  <item.icon className="w-8 h-8 text-amber-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-slate-400">{item.description}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-600 to-amber-400 text-slate-900 hover:opacity-90 rounded-full font-semibold transition-colors shadow-lg shadow-amber-500/25"
            >
              Browse the Marketplace
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-gradient-to-b from-transparent to-blue-900/10">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Get started in minutes - whether you use our hosted service or self-host
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Create or Import",
                description:
                  "Define playbooks from scratch or import from skills.md, Anthropic format, or plain text. Your existing knowledge transfers seamlessly.",
              },
              {
                step: "02",
                title: "Connect Agents",
                description:
                  "Point any AI agent to your playbook URL. Works with MCP protocol, REST API, or direct file access. One URL, any platform.",
              },
              {
                step: "03",
                title: "Share & Evolve",
                description:
                  "Publish to the marketplace or keep private. Fork community skills, contribute improvements, build on others' work.",
              },
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                <div className="text-7xl font-bold text-amber-500/20 mb-4">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-slate-400">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Self-Host CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center p-12 rounded-3xl bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-500/20"
          >
            <Server className="w-12 h-12 text-green-400 mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">Self-Host in Minutes</h2>
            <p className="text-slate-400 mb-8 max-w-xl mx-auto">
              Deploy AgentPlaybooks on your own infrastructure with Docker, Kubernetes, 
              or your preferred platform. Full documentation included.
            </p>
            <div className="bg-slate-900/80 rounded-xl p-4 mb-8 max-w-md mx-auto">
              <code className="text-green-400 text-sm font-mono">
                docker run -p 3000:3000 agentplaybooks/server
              </code>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/docs/self-hosting"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-green-600 to-green-500 text-white hover:opacity-90 rounded-full font-semibold transition-colors"
              >
                Self-Hosting Guide
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="https://github.com/agentplaybooks/agentplaybooks"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-950/50 hover:bg-blue-900/50 rounded-full font-semibold transition-colors border border-blue-800/50"
              >
                <Github className="w-5 h-5" />
                Star on GitHub
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Coming Soon - Enterprise Features Preview */}
      <section className="py-16 border-t border-blue-900/20">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 mb-8">
              <Rocket className="w-3 h-3 text-purple-400" />
              <span className="text-xs text-purple-300 uppercase tracking-wider font-medium">Coming Soon to Enterprise</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { icon: LayoutDashboard, label: "Dynamic Canvas", desc: "Visual agent workflows" },
                { icon: Layers, label: "Workspaces", desc: "Team collaboration" },
                { icon: Code2, label: "Sandbox Apps", desc: "Code execution environments" },
                { icon: Play, label: "Playbook Runner", desc: "Execute on your own AI" },
                { icon: Eye, label: "Visual Agents", desc: "Graphical agent representation" },
                { icon: Wand2, label: "Enterprise Apps", desc: "Build & maintain at scale" },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="p-4 rounded-xl bg-blue-950/20 border border-blue-900/30 hover:border-purple-500/20 transition-colors group"
                >
                  <item.icon className="w-5 h-5 text-purple-400/60 mx-auto mb-2 group-hover:text-purple-400 transition-colors" />
                  <p className="text-xs font-medium text-slate-300">{item.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{item.desc}</p>
                </motion.div>
              ))}
            </div>

            <p className="mt-8 text-xs text-slate-500 max-w-lg mx-auto">
              Enterprise features are under active development. Self-host today and get these features as they ship. 
              <a href="https://github.com/agentplaybooks/agentplaybooks" className="text-purple-400/70 hover:text-purple-400 ml-1">
                Star on GitHub to follow progress →
              </a>
            </p>
          </motion.div>
        </div>
      </section>

      {/* Footer spacing */}
      <div className="h-20" />
    </div>
  );
}
