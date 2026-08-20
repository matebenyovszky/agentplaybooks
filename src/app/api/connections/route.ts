import { NextResponse } from "next/server";
import {
  CONNECTION_TEMPLATES,
  connectionTemplate,
  type ConnectionCategory,
} from "@/lib/connection-catalogue";

/**
 * The curated connection catalogue.
 *
 * Public and uncached-by-nothing: these are templates, not credentials, and
 * every one references its secrets by name only. Nothing here is specific to a
 * playbook or a user, so there is nothing to authorise.
 *
 *   GET /api/connections                 every template
 *   GET /api/connections?category=social one category
 *   GET /api/connections?id=gmail        one template
 */
export async function GET(request: Request) {
  // Read from request.url rather than NextRequest.nextUrl: the handler then
  // works against a plain Request, which is what the tests hand it.
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (id) {
    const template = connectionTemplate(id);
    if (!template) {
      return NextResponse.json({ error: `No connection template '${id}'.` }, { status: 404 });
    }
    return NextResponse.json(template);
  }

  const category = params.get("category") as ConnectionCategory | null;
  const templates = category
    ? CONNECTION_TEMPLATES.filter((template) => template.category === category)
    : CONNECTION_TEMPLATES;

  return NextResponse.json({ templates, total: templates.length });
}
