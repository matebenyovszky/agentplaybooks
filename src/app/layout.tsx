import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { SITE_URL } from "@/lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "AgentPlaybooks — One Playbook, Every Agent",
  description: "Back up and migrate AI agent configuration across supported tools. AgentPlaybooks syncs Agent Skills, custom agents, MCP references, and project instructions, with private versioned recovery.",
  keywords: [
    "agent configuration", "agent skills", "SKILL.md", "AGENTS.md",
    "MCP server", "Model Context Protocol", "agent memory", "agent persona",
    "Claude Code skills", "Cursor rules", "Codex CLI", "Google Antigravity",
    "Hermes Agent", "ChatGPT custom GPT", "Gemini gems", "local LLM",
    "portable AI configuration", "vendor lock-in", "self-hosted AI",
    "agent secrets management", "OpenAPI", "JSON schema", "robot skills",
    "AI agent configuration backup", "cross-platform AI agent migration",
    "Agent Plugins 1.0", "portable custom agents"
  ],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [
      { url: "/apple-icon.svg", type: "image/svg+xml" },
    ],
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "AgentPlaybooks — One Playbook, Every Agent",
    description: "Portable Agent Skills, custom agents, MCP references, and project instructions with private, versioned backup and restore across supported AI coding tools.",
    type: "website",
    siteName: "AgentPlaybooks",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AgentPlaybooks — one playbook, every agent",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentPlaybooks — One Playbook, Every Agent",
    description: "Back up and migrate Agent Skills, custom agents, MCP references, and instructions across supported AI coding tools.",
    images: ["/twitter-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  // No `alternates.canonical` here on purpose. Next.js metadata is
  // shallow-merged, so a canonical set on the root layout is inherited by every
  // route that does not override it — which pointed all of /docs/* and /blog/*
  // at the homepage and made them look like duplicates of it. Each route
  // declares its own canonical instead.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AgentPlaybooks",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0f1a",
};

import { ThemeProvider } from "@/components/theme-provider";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          defaultTheme="system"
          storageKey="agentplaybooks-theme"
        >
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
