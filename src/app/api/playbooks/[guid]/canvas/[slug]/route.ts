import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { getAuthenticatedUser, requireAuth, validateApiKey } from "@/app/api/_shared/auth";
import { getPlaybookByGuid } from "@/app/api/_shared/guards";
import type { CanvasSection } from "@/lib/supabase/types";

// Parse markdown content into sections based on headings
function parseMarkdownSections(content: string): CanvasSection[] {
    const lines = content.split("\n");
    const sections: CanvasSection[] = [];
    let currentSection: { heading: string; level: number; lines: string[] } | null = null;
    let sectionCounter = 0;

    for (const line of lines) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            if (currentSection) {
                sectionCounter++;
                sections.push({
                    id: `s${sectionCounter}`,
                    heading: currentSection.heading,
                    level: currentSection.level,
                    content: currentSection.lines.join("\n").trim(),
                    locked_by: null,
                    locked_at: null,
                });
            }
            currentSection = {
                heading: headingMatch[2],
                level: headingMatch[1].length,
                lines: [],
            };
        } else if (currentSection) {
            currentSection.lines.push(line);
        } else {
            if (!currentSection) {
                currentSection = { heading: "Introduction", level: 1, lines: [line] };
            }
        }
    }

    if (currentSection) {
        sectionCounter++;
        sections.push({
            id: `s${sectionCounter}`,
            heading: currentSection.heading,
            level: currentSection.level,
            content: currentSection.lines.join("\n").trim(),
            locked_by: null,
            locked_at: null,
        });
    }

    if (sections.length === 0 && content.trim()) {
        sections.push({
            id: "s1",
            heading: "Content",
            level: 1,
            content: content.trim(),
            locked_by: null,
            locked_at: null,
        });
    }

    return sections;
}

const app = createApiApp("/api/playbooks/:guid/canvas/:slug");

app.get("/", async (c) => {
    const guid = c.req.param("guid");
    const slug = c.req.param("slug");

    if (!guid || !slug) {
        return c.json({ error: "Missing playbook GUID or document slug" }, 400);
    }

    const user = await getAuthenticatedUser(c.req.raw);
    const playbook = await getPlaybookByGuid(guid, user ? user.id : null);

    if (!playbook) {
        return c.json({ error: "Playbook not found" }, 404);
    }

    const supabase = getServiceSupabase();

    const { data, error } = await supabase
        .from("canvas")
        .select("*")
        .eq("playbook_id", playbook.id)
        .eq("slug", slug)
        .single();

    if (error) {
        if (error.code === "PGRST116") {
            return c.json({ error: "Canvas document not found" }, 404);
        }
        return c.json({ error: error.message }, 500);
    }

    return c.json(data);
});

app.put("/", async (c) => {
    const guid = c.req.param("guid");
    const slug = c.req.param("slug");

    if (!guid || !slug) {
        return c.json({ error: "Missing playbook GUID or document slug" }, 400);
    }

    const apiKeyData = await validateApiKey(c.req.raw, "canvas:write");
    if (apiKeyData) {
        if (apiKeyData.playbooks.guid !== guid) {
            return c.json({ error: "API key does not match playbook" }, 403);
        }
    } else {
        const user = await requireAuth(c.req.raw);
        if (!user) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const playbook = await getPlaybookByGuid(guid, user.id);
        if (!playbook || playbook.user_id !== user.id) {
            return c.json({ error: "Forbidden" }, 403);
        }
    }

    const body = await c.req.json();
    const { name, content, metadata, sort_order } = body;

    const supabase = getServiceSupabase();

    const { data: playbook } = await supabase
        .from("playbooks")
        .select("id")
        .eq("guid", guid)
        .single();

    if (!playbook) {
        return c.json({ error: "Playbook not found" }, 404);
    }

    const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (sort_order !== undefined) updateData.sort_order = sort_order;

    // If content is updated, parse sections again
    if (content !== undefined) {
        updateData.content = content;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updateData.sections = parseMarkdownSections(content) as any;
    }

    const { data, error } = await supabase
        .from("canvas")
        .update(updateData)
        .eq("playbook_id", playbook.id)
        .eq("slug", slug)
        .select()
        .single();

    if (error) {
        return c.json({ error: error.message }, 500);
    }

    return c.json(data);
});

app.delete("/", async (c) => {
    const guid = c.req.param("guid");
    const slug = c.req.param("slug");

    if (!guid || !slug) {
        return c.json({ error: "Missing playbook GUID or document slug" }, 400);
    }

    const apiKeyData = await validateApiKey(c.req.raw, "canvas:write");
    if (apiKeyData) {
        if (apiKeyData.playbooks.guid !== guid) {
            return c.json({ error: "API key does not match playbook" }, 403);
        }
    } else {
        const user = await requireAuth(c.req.raw);
        if (!user) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const playbook = await getPlaybookByGuid(guid, user.id);
        if (!playbook || playbook.user_id !== user.id) {
            return c.json({ error: "Forbidden" }, 403);
        }
    }

    const supabase = getServiceSupabase();

    const { data: playbook } = await supabase
        .from("playbooks")
        .select("id")
        .eq("guid", guid)
        .single();

    if (!playbook) {
        return c.json({ error: "Playbook not found" }, 404);
    }

    const { error } = await supabase
        .from("canvas")
        .delete()
        .eq("playbook_id", playbook.id)
        .eq("slug", slug);

    if (error) {
        return c.json({ error: error.message }, 500);
    }

    return c.json({ success: true });
});

export const GET = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
