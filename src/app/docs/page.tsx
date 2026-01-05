import DocsPageClient from "./DocsPageClient";
import { getDocTitle, normalizeDocSlug } from "./docs-data";

type DocsPageProps = {
  searchParams?: Promise<{ page?: string }>;
};

export default async function DocsPage({ searchParams }: DocsPageProps) {
  const resolvedParams = await searchParams;
  const slug = normalizeDocSlug(resolvedParams?.page || "readme");
  const title = getDocTitle(slug);

  return (
    <>
      <h1 className="sr-only">{title}</h1>
      <DocsPageClient initialSlug={slug} />
    </>
  );
}
