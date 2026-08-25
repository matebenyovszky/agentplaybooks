import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { PRIVACY_PARAGRAPHS, PRIVACY_TITLE } from "@/lib/legal-copy";
import { absoluteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Privacy — AgentPlaybooks",
  description:
    "AgentPlaybooks is MIT-licensed open-source software. Local use stays on your machine; the hosted service processes only what it needs to run.",
  alternates: { canonical: absoluteUrl("/privacy") },
  openGraph: {
    title: "Privacy — AgentPlaybooks",
    url: absoluteUrl("/privacy"),
    type: "website",
  },
};

export default function PrivacyPage() {
  return <LegalDocument title={PRIVACY_TITLE} paragraphs={PRIVACY_PARAGRAPHS} />;
}
