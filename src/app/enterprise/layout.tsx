import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
    alternates: { canonical: absoluteUrl("/enterprise") },
    title: "Self-Hosted Agents, Security & Audit | AgentPlaybooks",
    description: "Self-host your team's agent skills, memory, tools, and encrypted credentials. Inspect hash-chained audit logs, JSONL/CSV exports, auditor access, SIEM forwarding, retention controls, and mTLS deployment guides.",
    keywords: [
        "enterprise AI", "self-hosted AI", "on-premise AI", "AI governance",
        "agent configuration management", "agent orchestration", "AI compliance",
        "team agent standards", "AI onboarding", "secrets management",
        "AI vendor lock-in", "SSO", "role-based access control"
    ],
    openGraph: {
        title: "Self-Hosted Agents, Security & Audit",
        description: "Portable agent configuration with encrypted secrets, scoped access, verifiable audit history, export, and optional SIEM forwarding.",
        type: "website",
        url: absoluteUrl("/enterprise"),
    },
};

export default function EnterpriseLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return <>{children}</>;
}
