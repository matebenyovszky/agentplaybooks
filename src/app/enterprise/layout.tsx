import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Enterprise AI Agent Skills Store - Self-Hosted & Private | AgentPlaybooks",
    description: "Self-host AgentPlaybooks for your enterprise. Run your own private AI skills store, ensure data privacy, and maintain zero vendor lock-in. Works with all major AI agents.",
    keywords: [
        "enterprise AI", "self-hosted AI", "private skills store", "on-premise AI",
        "agent orchestration", "AI compliance", "agent playback",
        "subagent", "jack is", "skill download", "i know kungfu",
        "AI vendor lock-in", "corporate AI memory"
    ],
    openGraph: {
        title: "Enterprise AI Agent Skills Store - Self-Hosted & Private",
        description: "Secure, self-hosted skills store for enterprise AI agents. Keep your agent knowledge private and portable.",
        type: "website",
        url: "https://agentplaybooks.ai/enterprise",
    },
};

export default function EnterpriseLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return <>{children}</>;
}
