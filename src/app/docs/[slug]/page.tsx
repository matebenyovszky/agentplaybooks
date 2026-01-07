import DocsPageClient from "../DocsPageClient";
import { getDocTitle, normalizeDocSlug } from "../docs-data";
import { getDocContent } from "@/lib/docs-server";
import { getLocale } from "next-intl/server";

type DocSlugPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function DocSlugPage({ params }: DocSlugPageProps) {
  const { slug: rawSlug } = await params;
  const slug = normalizeDocSlug(rawSlug || "readme");
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
