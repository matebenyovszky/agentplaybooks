# Doctor drift demo

Intentional, **safe** cross-platform drift so you can see `doctor` findings and
heal them with `sync --apply`. Compatible with `@agentplaybooks/cli` 0.4.0+
(Agent Plugins 1.0 layout).

The portable skill under `.agents/skills/review-notes/` includes
`references/checklist.md`. The Claude and Cursor copies have the same
`SKILL.md` but **omit that bundled file**. `doctor` reports `skill.drift`
(medium). `sync` treats the portable tree as canonical and writes the missing
reference file into each vendor folder. It will not overwrite a `SKILL.md` that
disagrees — that is a conflict, not a silent heal.

No secrets are included. A line such as `API_KEY=sk-` plus 20+ token characters
would be `secret.hardcoded`; this starter uses structural drift instead.

## What it contains

- `AGENTS.md` — short project instructions
- `.agents/skills/review-notes/` — canonical skill **plus** `references/checklist.md`
- `.claude/skills/review-notes/SKILL.md` — incomplete copy (drift)
- `.cursor/skills/review-notes/SKILL.md` — incomplete copy (drift)

## Install / try it

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
counts three skills because doctor lists each discovered `SKILL.md`.

After a successful `sync --apply`, doctor should report **100/100** and
`No findings.` The missing `references/checklist.md` files have been created,
and Claude Code gets a `CLAUDE.md` that imports `AGENTS.md` (two instruction
files instead of one).

CLI docs: https://agentplaybooks.ai/docs/cli  
Agent Plugins: https://agent-plugins.org/specification

## What not to put here

- Real secrets, API keys, tokens, or `.env` files
- Fake `sk-…` values (doctor would flag that class; this demo does not need it)
- Hermes `config.yaml`

## License

MIT — see the [repository license](../../LICENSE).
