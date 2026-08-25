import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { TERMS_PARAGRAPHS, TERMS_TITLE } from "@/lib/legal-copy";
import { absoluteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Terms — AgentPlaybooks",
  description:
    "AgentPlaybooks is provided as is, without warranty. The MIT license in the repository is the agreement.",
  alternates: { canonical: absoluteUrl("/terms") },
  openGraph: {
    title: "Terms — AgentPlaybooks",
    url: absoluteUrl("/terms"),
    type: "website",
  },
};

export default function TermsPage() {
  return <LegalDocument title={TERMS_TITLE} paragraphs={TERMS_PARAGRAPHS} />;
}
