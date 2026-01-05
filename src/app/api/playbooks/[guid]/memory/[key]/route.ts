import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

export async function PUT(
  request: NextRequest,
  { params }: { params: { guid: string; key: string } }
) {
  try {
    const { guid, key } = params;
    const body = await request.json();
    const { value } = body;

    const supabase = createServerClient();

    // Business logic here...

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Memory update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { guid: string; key: string } }
) {
  try {
    const { guid, key } = params;

    const supabase = createServerClient();

    // Business logic here...

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Memory delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}