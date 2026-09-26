# Cursor + Hermes starter

A portable playbook you control, shaped for **Cursor** and **Hermes Agent** as
hosts: persona, project instructions, two skills, and an MCP stub. Memory and
vault stay in the same store when you add them; this starter ships an
environment-variable credential ref only (never a secret value).

The playbook lives in the project. Hermes profile files (`config.yaml`,
`SOUL.md`) are written on your machine when you install into that host — they
are **not** shipped here.

## What it contains

- `AGENTS.md` — pair-programming project instructions (Hermes and Cursor both read this)
- `.agents/persona.md` — portable persona; installing into Hermes copies it to `~/.hermes/SOUL.md` when that file is missing
- `.agents/skills/session-handoff/`
- `.agents/skills/task-breakdown/`
- `.agents/mcp.json` — optional example MCP stub (`${EXAMPLE_MCP_TOKEN}` only)

Hermes loads the first project context file it finds
(`.hermes.md` → `AGENTS.md` → `CLAUDE.md` → `.cursorrules`). This starter ships
only `AGENTS.md` so nothing hides it.

Compatible with `@agentplaybooks/cli` 0.4.0+ (Agent Plugins 1.0).

## Install into a host

From this repository:

```bash
npx @agentplaybooks/cli@latest doctor examples/cursor-hermes-starter
npx @agentplaybooks/cli@latest sync examples/cursor-hermes-starter --target=cursor,hermes --apply
```

`--target=hermes` merges MCP servers and registers `.agents/skills` in your
**local** Hermes profile (`~/.hermes/config.yaml` or `$HERMES_HOME`). Review the
plan (omit `--apply` first) if you already have a Hermes config.

Copy into a new project:

```bash
cp -R examples/cursor-hermes-starter my-project && cd my-project
npx @agentplaybooks/cli@latest sync . --target=cursor,hermes --apply
```

Fan out to Claude Code as well if you use it:

```bash
npx @agentplaybooks/cli@latest sync examples/cursor-hermes-starter --target=claude,cursor,hermes --apply
```

Optional Agent Plugins 1.0 export/import:

```bash
npx @agentplaybooks/cli@latest plugin export examples/cursor-hermes-starter --output=./my-plugin --apply
npx @agentplaybooks/cli@latest plugin import ./my-plugin my-project --apply
```

CLI docs: https://agentplaybooks.ai/docs/cli  
Agent Plugins: https://agent-plugins.org/specification  
Hermes portable agents: https://agentplaybooks.ai/docs/hermes-portable-agents

## What not to put here

- Secrets, API keys, tokens, or `.env` files
- A Hermes `config.yaml` (installing into Hermes merges that file on the machine)
- Literal MCP headers — keep `${EXAMPLE_MCP_TOKEN}` or delete the stub

## License

MIT — see the [repository license](../../LICENSE).
