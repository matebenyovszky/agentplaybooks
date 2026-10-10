import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { PRIVACY_SECTIONS, PRIVACY_TITLE } from "@/lib/legal-copy";
import { absoluteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Privacy — AgentPlaybooks",
  description:
    "What the hosted AgentPlaybooks service collects, why, who processes it, how long it is kept, how to delete your account, and how to reach us.",
  alternates: { canonical: absoluteUrl("/privacy") },
  openGraph: {
    title: "Privacy — AgentPlaybooks",
    url: absoluteUrl("/privacy"),
    type: "website",
  },
};

export default function PrivacyPage() {
  return <LegalDocument title={PRIVACY_TITLE} sections={PRIVACY_SECTIONS} />;
}
