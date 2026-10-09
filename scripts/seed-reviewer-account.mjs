#!/usr/bin/env node
/**
 * Fill a reviewer test account with realistic content, through the same MCP
 * account endpoint a directory reviewer will connect to.
 *
 * The Claude directory asks for credentials to a *fully populated* account, so
 * every tool has something real to act on: list_playbooks finds playbooks,
 * get_playbook returns a persona and skills, search_memory finds entries,
 * read_canvas reads a document, list_secrets lists a secret name, use_secret can
 * send a harmless request with it. This script creates exactly that.
 *
 * It does not create the account. Sign up for a dedicated reviewer account on
 * the site, create a user API key under Settings with full access, and pass the
 * key in the environment — never on the command line, where shells keep it:
 *
 *   AGENTPLAYBOOKS_API_KEY=… node scripts/seed-reviewer-account.mjs --dry-run
 *   AGENTPLAYBOOKS_API_KEY=… node scripts/seed-reviewer-account.mjs
 *
 * The key is sent only to AGENTPLAYBOOKS_URL (default https://agentplaybooks.ai)
 * and never printed. Running it twice does not duplicate anything: playbooks
 * that already exist under the same name are left alone.
 */

const BASE_URL = (process.env.AGENTPLAYBOOKS_URL || "https://agentplaybooks.ai").replace(/\/+$/, "");
const API_KEY = process.env.AGENTPLAYBOOKS_API_KEY || "";
const DRY_RUN = process.argv.includes("--dry-run");

/** Clearly not a credential, so nothing real can leak through a demo request. */
const DEMO_SECRET_VALUE = "reviewer-demo-value-not-a-real-credential";

const PLAYBOOKS = [
  {
    name: "Reviewer demo: Team handbook",
    description: "A small team's working agreements, skills, and decisions — sample content for reviewing the AgentPlaybooks connector.",
    persona_name: "Handbook assistant",
    persona_system_prompt:
      "You help a five-person product team follow its own working agreements. Answer from the playbook's memory and skills first, say when something is not recorded, and keep answers short.",
    instructions:
      "# Team handbook\n\n- Status reports go out on Fridays, using the weekly-status-report skill.\n- Every pull request gets the code-review-checklist before merge.\n- Decisions are recorded in memory with the tag `decision`.",
    skills: [
      {
        name: "weekly-status-report",
        description: "Write the team's Friday status report from this week's decisions and open tasks. Use when asked for a status update or weekly summary.",
        content:
          "# Weekly status report\n\n1. Read memory entries tagged `decision` from the last seven days.\n2. List what shipped, what is blocked, and what is next.\n3. Keep it under 200 words. Name owners, not teams.",
      },
      {
        name: "code-review-checklist",
        description: "Review a pull request against the team's checklist: tests, naming, error handling, and docs. Use before approving a pull request.",
        content:
          "# Code review checklist\n\n- Tests cover the change and fail without it.\n- Names say what things are for.\n- Errors are reported with a reason a person can act on.\n- User-facing changes update the docs in the same pull request.",
      },
    ],
    memories: [
      {
        key: "decision/release-cadence",
        value: { text: "We release every second Tuesday. Hotfixes can go out any day with two approvals." },
        tags: ["decision", "release"],
        description: "How often the team releases",
        tier: "working",
      },
      {
        key: "decision/on-call",
        value: { text: "On-call rotates weekly, Monday 09:00 to Monday 09:00. The rota lives in the team calendar." },
        tags: ["decision", "operations"],
        description: "On-call rotation",
        tier: "contextual",
      },
      {
        key: "preference/report-format",
        value: { text: "Status reports use three headings: Shipped, Blocked, Next." },
        tags: ["preference"],
        description: "Format of weekly reports",
        tier: "longterm",
      },
    ],
    run: {
      name: "Q4 planning",
      canvas: {
        slug: "q4-plan",
        name: "Q4 plan",
        content:
          "# Q4 plan\n\n## Goals\n\n- Ship self-service onboarding.\n- Halve the time from report to fix for priority bugs.\n\n## Risks\n\n- Two people on leave in December.\n\n## Open questions\n\n- Do we freeze releases in the last week of the year?",
      },
    },
    secret: {
      name: "DEMO_API_TOKEN",
      value: DEMO_SECRET_VALUE,
      description: "Demo value for reviewing use_secret — not a real credential. Try use_secret against https://httpbin.org/headers.",
      category: "token",
    },
  },
  {
    name: "Reviewer demo: Research notes",
    description: "Notes from a short market research project — a second playbook so list_playbooks and playbook_id have something to choose between.",
    persona_name: "Research assistant",
    persona_system_prompt: "You keep research notes tidy: sources first, then findings, then open questions.",
    instructions: "Record every source with a link and the date it was read.",
    skills: [
      {
        name: "summarize-source",
        description: "Summarize one source into findings and open questions, with the link and date. Use when adding a new source to the research notes.",
        content: "# Summarize a source\n\n- Link and date read.\n- Three findings at most, each one sentence.\n- Open questions it raises.",
      },
    ],
    memories: [
      {
        key: "source/agent-config-survey",
        value: { text: "Survey of 40 teams: most keep agent instructions in more than one file per tool, and half of those disagree." },
        tags: ["source"],
        description: "Agent configuration survey",
        tier: "contextual",
      },
    ],
  },
];

async function call(tool, args) {
  const response = await fetch(`${BASE_URL}/api/mcp/manage`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-API-Key": API_KEY },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: tool, arguments: args } }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    throw new Error(`${tool} failed (${response.status}): ${body?.error?.message ?? "no details"}`);
  }
  const result = body?.result;
  if (result?.isError) {
    throw new Error(`${tool} failed: ${result.content?.[0]?.text ?? "no details"}`);
  }
  if (result?.structuredContent) return result.structuredContent;
  const text = result?.content?.[0]?.text;
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function playbookList(listed) {
  if (Array.isArray(listed)) return listed;
  return listed?.playbooks ?? [];
}

async function main() {
  if (!API_KEY.startsWith("apb_")) {
    console.error("Set AGENTPLAYBOOKS_API_KEY to a user API key (apb_…) of the reviewer account, in the environment.");
    process.exitCode = 1;
    return;
  }

  const existing = new Set(playbookList(await call("list_playbooks", {})).map((playbook) => playbook.name));
  console.log(`Account reached at ${BASE_URL}; it has ${existing.size} playbook(s).`);

  for (const spec of PLAYBOOKS) {
    if (existing.has(spec.name)) {
      console.log(`skip    "${spec.name}" — already exists`);
      continue;
    }
    const plan = `${spec.skills.length} skill(s), ${spec.memories.length} memory entr(ies)${spec.run ? ", a run with a canvas document" : ""}${spec.secret ? ", a demo secret" : ""}`;
    if (DRY_RUN) {
      console.log(`would create "${spec.name}" with ${plan}`);
      continue;
    }

    const playbook = await call("create_playbook", {
      name: spec.name,
      description: spec.description,
      visibility: "private",
      persona_name: spec.persona_name,
      persona_system_prompt: spec.persona_system_prompt,
      instructions: spec.instructions,
    });
    const playbookId = playbook?.id ?? playbook?.playbook?.id;
    if (!playbookId) throw new Error(`create_playbook returned no id for "${spec.name}"`);

    for (const skill of spec.skills) await call("create_skill", { playbook_id: playbookId, ...skill });
    for (const memory of spec.memories) await call("write_memory", { playbook_id: playbookId, ...memory });
    if (spec.run) {
      const run = await call("create_run", { playbook_id: playbookId, name: spec.run.name });
      const runId = run?.id ?? run?.run?.id;
      if (!runId) throw new Error(`create_run returned no id for "${spec.name}"`);
      await call("write_canvas", { playbook_id: playbookId, run_id: runId, ...spec.run.canvas });
    }
    if (spec.secret) await call("store_secret", { playbook_id: playbookId, ...spec.secret });

    console.log(`created "${spec.name}" (${playbook?.guid ?? playbookId}) with ${plan}`);
  }

  console.log(DRY_RUN ? "\nDry run: nothing was written." : "\nDone. Give reviewers this account's email and password through the submission portal only.");
}

// exitCode rather than exit(): exiting while fetch still holds a socket aborts
// Node on Windows with a libuv assertion instead of the message above.
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
