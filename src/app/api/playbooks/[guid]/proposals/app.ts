import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { listProposals, reviewProposal, type ProposalKind } from "@/app/api/_shared/proposals";
import { reviewerKinds } from "./reviewer";

// Proposals waiting for review in one playbook.
//   GET  /api/playbooks/:guid/proposals?kind=memory|skill
//   POST /api/playbooks/:guid/proposals/:id  { kind, decision: "approve" | "reject" }
// One Hono app at two paths: Next matches a route.ts against its exact path
// only, so ./route.ts and ./[id]/route.ts both hand requests to it.
export const app = createApiApp("/api/playbooks/:guid/proposals");

app.get("/", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);
  const reviewer = await reviewerKinds(c.req.raw, guid);
  if (!reviewer) return c.json({ error: "Unauthorized" }, 401);

  const requested = c.req.query("kind");
  const kinds = requested ? reviewer.kinds.filter((kind) => kind === requested) : reviewer.kinds;
  try {
    return c.json(await listProposals(getServiceSupabase(), reviewer.playbookId, kinds));
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

app.post("/:id", async (c) => {
  const guid = c.req.param("guid");
  const id = c.req.param("id");
  if (!guid || !id) return c.json({ error: "Missing playbook GUID or proposal id" }, 400);

  const body = await c.req.json().catch(() => ({})) as { kind?: string; decision?: string };
  if (body.kind !== "memory" && body.kind !== "skill") return c.json({ error: "kind must be memory or skill" }, 400);
  if (body.decision !== "approve" && body.decision !== "reject") return c.json({ error: "decision must be approve or reject" }, 400);

  const reviewer = await reviewerKinds(c.req.raw, guid);
  if (!reviewer) return c.json({ error: "Unauthorized" }, 401);
  if (!reviewer.kinds.includes(body.kind as ProposalKind)) {
    return c.json({ error: `Reviewing ${body.kind} proposals needs ${body.kind === "memory" ? "memory" : "skills"}:write` }, 403);
  }

  try {
    const result = await reviewProposal(getServiceSupabase(), reviewer.playbookId, body.kind, id, body.decision);
    if (!result) return c.json({ error: "No pending proposal with this id" }, 404);
    return c.json(result);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});
