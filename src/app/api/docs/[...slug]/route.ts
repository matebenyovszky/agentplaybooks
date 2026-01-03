import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const filename = slug.join("/");
  
  // Only allow .md files
  if (!filename.endsWith(".md")) {
    return NextResponse.json({ error: "Only markdown files allowed" }, { status: 400 });
  }

  try {
    // Try to read from docs folder
    const filePath = join(process.cwd(), "docs", filename);
    
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const content = readFileSync(filePath, "utf-8");
    
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Error reading file" }, { status: 500 });
  }
}


