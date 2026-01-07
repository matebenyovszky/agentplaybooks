import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://agentplaybooks.ai"),
  title: "AgentPlaybooks - AI Agent Rules, Skills & Memory Store",
  description: "The universal skills store for AI agents. Store agent rules, chores, personas, skills.md, MCP servers. Works with ChatGPT, Claude, Gemini, Cursor. Platform-independent vault for AI robots and automation.",
  keywords: [
    "AI agent", "agent rules", "AI chores", "skills store", "agent memory",
    "Anthropic skills", "skills.md", "MCP protocol", "MCP server",
    "GPT actions", "ChatGPT custom GPT", "Claude projects", "Gemini gems",
    "cursor rules", "AI automation", "agent playbook", "AI personas",
    "robot skills", "AI toolkit", "agent configuration", "JSON schema",
    "OpenAPI", "platform-independent AI", "AI vault", "agent marketplace"
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
    title: "AgentPlaybooks - AI Agent Rules, Skills & Memory Store",
    description: "The universal skills store for AI agents. Store rules, chores, personas, MCP servers. Works with every major AI platform.",
    type: "website",
    url: "https://agentplaybooks.ai",
    siteName: "AgentPlaybooks",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "AgentPlaybooks - AI Agent Skills Store",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentPlaybooks - AI Agent Skills Store",
    description: "Store AI agent rules, skills, and memories. Platform-independent vault for ChatGPT, Claude, Gemini.",
    images: ["/twitter-image.svg"],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://agentplaybooks.ai",
  },
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
