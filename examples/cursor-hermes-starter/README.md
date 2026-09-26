# Cursor + Hermes starter

Low-effort starter aimed at **Cursor** and **Hermes Agent**. Portable
instructions and skills live in the project; Hermes profile files (`config.yaml`,
`SOUL.md`) are written by `sync --target=hermes` on your machine and are **not**
shipped here.

Compatible with `@agentplaybooks/cli` 0.4.0+ (Agent Plugins 1.0).

## What it contains

- `AGENTS.md` — pair-programming project instructions (Hermes and Cursor both read this)
- `.agents/persona.md` — portable persona; `sync --target=hermes` copies it to `~/.hermes/SOUL.md` when that file is missing
- `.agents/skills/session-handoff/`
- `.agents/skills/task-breakdown/`
- `.agents/mcp.json` — optional example MCP stub (`${EXAMPLE_MCP_TOKEN}` only)

Hermes loads the first project context file it finds
(`.hermes.md` → `AGENTS.md` → `CLAUDE.md` → `.cursorrules`). This starter ships
only `AGENTS.md` so nothing hides it.

## Install

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
- A Hermes `config.yaml` (sync owns merging that file on the machine)
- Literal MCP headers — keep `${EXAMPLE_MCP_TOKEN}` or delete the stub

## License

MIT — see the [repository license](../../LICENSE).
