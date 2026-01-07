import DocsPageClient from "./DocsPageClient";
import { getDocTitle, normalizeDocSlug } from "./docs-data";
import { getDocContent } from "@/lib/docs-server";
import { getLocale } from "next-intl/server";

type DocsPageProps = {
  searchParams?: Promise<{ page?: string }>;
};

export default async function DocsPage({ searchParams }: DocsPageProps) {
  const resolvedParams = await searchParams;
  const slug = normalizeDocSlug(resolvedParams?.page || "readme");
  const title = getDocTitle(slug);
  const locale = await getLocale();
  const content = await getDocContent(slug, locale);

  return (
    <>
      <h1 className="sr-only">{title}</h1>
      <DocsPageClient initialSlug={slug} initialContent={content || undefined} />
    </>
  );
}
