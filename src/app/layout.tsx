import type { Metadata } from "next";
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
  openGraph: {
    title: "AgentPlaybooks - AI Agent Rules, Skills & Memory Store",
    description: "The universal skills store for AI agents. Store rules, chores, personas, MCP servers. Works with every major AI platform.",
    type: "website",
    url: "https://agentplaybooks.ai",
    siteName: "AgentPlaybooks",
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentPlaybooks - AI Agent Skills Store",
    description: "Store AI agent rules, skills, and memories. Platform-independent vault for ChatGPT, Claude, Gemini.",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://agentplaybooks.ai",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
