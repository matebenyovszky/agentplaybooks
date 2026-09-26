# Coding agent baseline

A portable playbook for a coding agent you control: project instructions, two
skills, and an MCP stub. Persona, memory, and vault are part of the same store —
add them when you need them; this starter keeps them empty except for an
environment-variable credential ref (never a secret value).

Copy the tree into a repo. The playbook stays in `AGENTS.md` and `.agents/`;
hosts such as Claude Code and Cursor get their copies from `sync`.

## What it contains

- `AGENTS.md` — always-on project instructions
- `.agents/skills/pr-hygiene/` — pull-request checklist
- `.agents/skills/commit-message/` — commit message conventions
- `.agents/mcp.json` — example MCP server with **only** an env-var credential ref

No `agentplaybook.json` is checked in. `sync --apply` creates it. Compatible
with `@agentplaybooks/cli` 0.4.0+ (Agent Plugins 1.0).

## Install into a host

From this repository:

```bash
npx @agentplaybooks/cli@latest doctor examples/coding-agent-baseline
npx @agentplaybooks/cli@latest sync examples/coding-agent-baseline --target=claude,cursor --apply
```

`doctor` is optional: it checks the store (and any host copies) for drift and
unsafe config. `sync --apply` writes the playbook into the named hosts.

Copy into a new project:

```bash
cp -R examples/coding-agent-baseline my-project && cd my-project
npx @agentplaybooks/cli@latest doctor .
npx @agentplaybooks/cli@latest sync . --target=claude,cursor --apply
```

Optional Agent Plugins 1.0 export/import:

```bash
npx @agentplaybooks/cli@latest plugin export examples/coding-agent-baseline --output=./my-plugin --apply
npx @agentplaybooks/cli@latest plugin import ./my-plugin my-project --apply
```

CLI docs: https://agentplaybooks.ai/docs/cli  
Agent Plugins: https://agent-plugins.org/specification

## What not to put here

- Secrets, API keys, tokens, or `.env` files
- Literal `Authorization` values — keep `${EXAMPLE_MCP_TOKEN}` as a reference
- Hermes `config.yaml` or machine-local client homes

Set `EXAMPLE_MCP_TOKEN` in your environment if you actually connect that stub.
Delete the stub if you do not need MCP.

## License

MIT — see the [repository license](../../LICENSE).
