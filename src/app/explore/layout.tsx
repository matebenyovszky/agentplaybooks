import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { absoluteUrl } from "@/lib/site-url";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("explore");
    return {
        title: `${t("metaTitle")} | AgentPlaybooks`,
        description: t("subtitle"),
        alternates: { canonical: absoluteUrl("/explore") },
        openGraph: {
            title: t("metaTitle"),
            description: t("subtitle"),
            url: absoluteUrl("/explore"),
            type: "website",
        },
    };
}

export default function ExploreLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return <>{children}</>;
}
