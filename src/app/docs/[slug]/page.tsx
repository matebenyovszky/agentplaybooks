import DocsPageClient from "../DocsPageClient";
import { getDocTitle, normalizeDocSlug } from "../docs-data";

type DocSlugPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function DocSlugPage({ params }: DocSlugPageProps) {
  const { slug: rawSlug } = await params;
  const slug = normalizeDocSlug(rawSlug || "readme");
  const title = getDocTitle(slug);

  return (
    <>
      <h1 className="sr-only">{title}</h1>
      <DocsPageClient initialSlug={slug} />
    </>
  );
}
