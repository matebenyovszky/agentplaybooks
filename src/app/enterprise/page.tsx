"use client";

import { motion } from "framer-motion";
import {
  Building2,
  Users,
  Shield,
  Zap,
  GitBranch,
  Lock,
  BarChart3,
  Headphones,
  CheckCircle2,
  ArrowRight,
  Bot,
  BookOpen,
  Network,
  Globe,
} from "lucide-react";
import Link from "next/link";
import { FloatingNav } from "@/components/ui/floating-navbar";
import { useTranslations } from "next-intl";

const features = [
  {
    icon: Users,
    title: "Team Management",
    description:
      "Centralized playbook management for your entire organization. Define once, deploy everywhere.",
  },
  {
    icon: Shield,
    title: "Enterprise SSO",
    description:
      "SAML 2.0 and OIDC support. Integrate with Okta, Azure AD, Google Workspace, and more.",
  },
  {
    icon: Lock,
    title: "Advanced Security",
    description:
      "SOC 2 Type II compliant. End-to-end encryption, audit logs, and role-based access control.",
  },
  {
    icon: GitBranch,
    title: "Version Control",
    description:
      "Track changes to playbooks with full version history. Rollback anytime, compare versions.",
  },
  {
    icon: BarChart3,
    title: "Analytics & Insights",
    description:
      "Understand how your AI agents use playbooks. Usage metrics, performance insights.",
  },
  {
    icon: Headphones,
    title: "Priority Support",
    description:
      "Dedicated account manager, 24/7 support, custom integrations, and onboarding assistance.",
  },
];

const useCases = [
  {
    icon: Bot,
    title: "AI Agent Standardization",
    description:
      "Ensure all AI agents across your organization follow the same guidelines, best practices, and security protocols.",
    benefits: [
      "Consistent AI behavior company-wide",
      "Reduced hallucination risks",
      "Compliance with corporate policies",
    ],
  },
  {
    icon: BookOpen,
    title: "Employee & Robot Onboarding",
    description:
      "New team members or AI systems instantly download personas and procedures. No manual training needed.",
    benefits: [
      "Faster time-to-productivity",
      "Standardized onboarding process",
      "Self-service knowledge access",
    ],
  },
  {
    icon: Network,
    title: "Cross-Platform Deployment",
    description:
      "Deploy the same playbooks to ChatGPT, Claude, custom agents, and robotic systems simultaneously.",
    benefits: [
      "Platform-independent configuration",
      "Single source of truth",
      "Seamless AI platform migration",
    ],
  },
];

const plans = [
  {
    name: "Team",
    price: "$49",
    period: "/user/month",
    description: "For growing teams adopting AI",
    features: [
      "Up to 25 team members",
      "Unlimited playbooks",
      "Team sharing & collaboration",
      "Priority email support",
      "API access",
      "Usage analytics",
    ],
    cta: "Start Free Trial",
    highlighted: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For organizations at scale",
    features: [
      "Unlimited team members",
      "SSO (SAML, OIDC)",
      "Role-based access control",
      "Audit logs & compliance",
      "Dedicated account manager",
      "Custom integrations",
      "SLA guarantee",
      "On-premise option",
    ],
    cta: "Contact Sales",
    highlighted: true,
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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
              <Building2 className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-amber-300">Enterprise Solutions</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-200 to-amber-400">
              AI Playbooks for
              <br />
              Enterprise Teams
            </h1>

            <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-10">
              Standardize AI behavior across your organization. Deploy personas,
              skills, and MCP servers to all your agents and robots from a
              single source of truth.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="#contact"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-600 to-amber-400 text-slate-900 hover:opacity-90 rounded-full font-semibold transition-colors shadow-lg shadow-amber-500/25"
              >
                Contact Sales
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="#demo"
                className="inline-flex items-center gap-2 px-8 py-4 bg-blue-950/50 hover:bg-blue-900/50 rounded-full font-semibold transition-colors border border-blue-800/50"
              >
                Request Demo
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 border-t border-blue-900/30">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold mb-4">Enterprise Use Cases</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              How leading organizations use AgentPlaybooks to standardize their AI operations
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {useCases.map((useCase, index) => (
              <motion.div
                key={useCase.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-8 rounded-2xl bg-gradient-to-b from-blue-950/50 to-transparent border border-blue-900/50 hover:border-amber-500/30 transition-colors"
              >
                <div className="w-14 h-14 rounded-xl bg-amber-500/20 flex items-center justify-center mb-6">
                  <useCase.icon className="w-7 h-7 text-amber-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{useCase.title}</h3>
                <p className="text-slate-400 mb-6">{useCase.description}</p>
                <ul className="space-y-2">
                  {useCase.benefits.map((benefit) => (
                    <li
                      key={benefit}
                      className="flex items-center gap-2 text-sm text-slate-300"
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-gradient-to-b from-blue-900/10 to-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold mb-4">Enterprise Features</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Built for security, scale, and seamless integration with your existing infrastructure
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-xl bg-blue-950/30 border border-blue-900/50 hover:border-amber-500/30 transition-all hover:bg-blue-950/50"
              >
                <feature.icon className="w-10 h-10 text-blue-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-slate-400 text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 border-t border-blue-900/30">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Get your entire organization standardized on AI best practices in three steps
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Define Playbooks",
                description:
                  "Create standardized personas, skills, and procedures that reflect your organization's best practices and policies.",
              },
              {
                step: "02",
                title: "Deploy to Agents",
                description:
                  "Distribute playbooks to all AI agents, GPTs, and robotic systems via API, MCP protocol, or direct integration.",
              },
              {
                step: "03",
                title: "Monitor & Iterate",
                description:
                  "Track usage, gather insights, and continuously improve your playbooks based on real-world performance.",
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

      {/* Pricing */}
      <section id="pricing" className="py-20 bg-gradient-to-b from-transparent to-blue-900/10">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold mb-4">Enterprise Plans</h2>
            <p className="text-slate-400 text-lg">
              Flexible pricing that scales with your organization
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`p-8 rounded-2xl ${
                  plan.highlighted
                    ? "bg-gradient-to-b from-amber-600/20 to-blue-900/20 border-2 border-amber-500/50"
                    : "bg-blue-950/30 border border-blue-900/50"
                }`}
              >
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-slate-400">{plan.period}</span>
                </div>
                <p className="text-slate-400 mb-6">{plan.description}</p>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.highlighted ? "#contact" : "/login"}
                  className={`block text-center py-3 rounded-full font-semibold transition-colors ${
                    plan.highlighted
                      ? "bg-gradient-to-r from-amber-600 to-amber-400 text-slate-900 hover:opacity-90"
                      : "bg-blue-900/50 hover:bg-blue-800/50"
                  }`}
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="contact" className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center p-12 rounded-3xl bg-gradient-to-r from-blue-900/30 to-amber-900/20 border border-amber-500/20"
          >
            <Zap className="w-12 h-12 text-amber-400 mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-slate-400 mb-8 max-w-xl mx-auto">
              Let's discuss how AgentPlaybooks can help standardize AI operations
              across your organization.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="mailto:enterprise@agentplaybooks.ai"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-600 to-amber-400 text-slate-900 hover:opacity-90 rounded-full font-semibold transition-colors shadow-lg shadow-amber-500/25"
              >
                Contact Sales
                <ArrowRight className="w-5 h-5" />
              </a>
              <Link
                href="/docs"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-950/50 hover:bg-blue-900/50 rounded-full font-semibold transition-colors border border-blue-800/50"
              >
                Read Documentation
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer spacing */}
      <div className="h-20" />
    </div>
  );
}

