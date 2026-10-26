import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getAuthenticatedUser, validateApiKey } from "@/app/api/_shared/auth";
import { getPlaybookByGuid } from "@/app/api/_shared/guards";
import { searchMemories } from "@/app/api/_shared/memory";
import { parseMemorySearch } from "@/lib/memory";
import { matchesPlaybook } from "@/lib/playbook-identifier";

const app = createApiApp("/api/playbooks/:guid/memory");

app.get("/", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);
  const user = await getAuthenticatedUser(c.req.raw);
  const apiKey = await validateApiKey(c.req.raw, "memory:read");
  const matchingKey = apiKey && matchesPlaybook(apiKey.playbooks, guid) ? apiKey : null;
  if (c.req.query("private_check") === "1") {
    // A memory-only credential must not fetch/export the whole playbook just
    // to prove privacy. Read current visibility on every check; do not cache a
    // proof that could survive a visibility change or credential revocation.
    if (!matchingKey && !user) return c.json({ error: "Unauthorized" }, 401);
    const privatePlaybook = await getPlaybookByGuid(guid, user?.id ?? null, matchingKey?.playbooks.id ?? null);
    if (!privatePlaybook) return c.json({ error: "Playbook not found" }, 404);
    if (privatePlaybook.visibility !== "private") {
      return c.json({ error: "Personal memory requires a private playbook." }, 403);
    }
    c.header("Cache-Control", "no-store");
    return c.json({ private_memory: true });
  }
  const playbook = matchingKey ? matchingKey.playbooks : await getPlaybookByGuid(guid, user?.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);
  let options;
  try { options = parseMemorySearch(c.req.query()); }
  catch (error) { return c.json({ error: (error as Error).message }, 400); }
  try {
    const entries = await searchMemories(playbook.id, options);
    if (options.key) return entries[0] ? c.json(entries[0]) : c.json({ error: "Memory not found" }, 404);
    return c.json(entries);
  } catch (error) { return c.json({ error: (error as Error).message }, 500); }
});

export const GET = handle(app);
