# Review playbook (host drift)

A portable review playbook you control: instructions and a `review-notes` skill
with its bundled checklist. The canonical store is `.agents/` — that is the
playbook. Claude and Cursor folders in this tree are incomplete copies of the
same skill, so a host can drift from the store without changing the playbook
itself.

Use `doctor` to see that drift, then `sync --apply` to heal the host folders
from the portable skill. `sync` will not overwrite a `SKILL.md` that disagrees
with the store — that is a conflict, not a silent heal.

No secrets are included. A line such as `API_KEY=sk-` plus 20+ token characters
would be flagged as hard-coded; this starter uses structural drift instead.

## What it contains

- `AGENTS.md` — project instructions for the review playbook
- `.agents/skills/review-notes/` — canonical skill **plus** `references/checklist.md`
- `.claude/skills/review-notes/SKILL.md` — incomplete host copy (drift)
- `.cursor/skills/review-notes/SKILL.md` — incomplete host copy (drift)

Persona, MCP, memory, and vault are unused here; add them on the playbook when
you need them.

## Install into a host

From this repository:

```bash
npx @agentplaybooks/cli@latest doctor examples/doctor-drift-demo
npx @agentplaybooks/cli@latest sync examples/doctor-drift-demo --apply
npx @agentplaybooks/cli@latest doctor examples/doctor-drift-demo
```

Copy into a throwaway directory if you do not want to dirty the clone:

```bash
cp -R examples/doctor-drift-demo /tmp/doctor-drift-demo && cd /tmp/doctor-drift-demo
npx @agentplaybooks/cli@latest doctor .
npx @agentplaybooks/cli@latest sync . --apply
```

`--apply` also writes `agentplaybook.json` and a `CLAUDE.md` that imports
`AGENTS.md`. Those are generated; this starter does not check them in.

## Expected `doctor` output (before heal)

Score **96/100**. One medium finding. Claude and Cursor both present.

```text
AgentPlaybooks Doctor — health 96/100
Found 1 instruction file(s), 3 skill(s), 0 custom agent(s), and 0 MCP server definition(s).
Platforms: Claude present; Cursor present.
Findings: 0 critical, 0 high, 1 medium, 0 low.

[MEDIUM] skill.drift
  .agents/skills/review-notes/SKILL.md
  Skill 'review-notes' has different definitions across discovered locations.
```

`--json` includes `relatedSources` for the three `SKILL.md` paths. Inventory
counts three skills because each discovered `SKILL.md` is listed.

After a successful `sync --apply`, doctor should report **100/100** and
`No findings.` The missing `references/checklist.md` files have been created,
and Claude Code gets a `CLAUDE.md` that imports `AGENTS.md` (two instruction
files instead of one).

CLI docs: https://agentplaybooks.ai/docs/cli  
Agent Plugins: https://agent-plugins.org/specification

## What not to put here

- Real secrets, API keys, tokens, or `.env` files
- Fake `sk-…` values (a hard-coded-secret check would flag that class)
- Hermes `config.yaml`

## License

MIT — see the [repository license](../../LICENSE).
