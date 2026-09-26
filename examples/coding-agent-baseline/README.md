# Coding agent baseline

Portable coding-agent starter: project instructions, two small skills, and a
safe MCP stub. Copy it into a repo and run `sync` to fan the layout out to
Claude Code, Cursor, and other CLI targets.

## What it contains

- `AGENTS.md` — always-on project instructions
- `.agents/skills/pr-hygiene/` — pull-request checklist
- `.agents/skills/commit-message/` — commit message conventions
- `.agents/mcp.json` — example MCP server with **only** an env-var credential ref

No `agentplaybook.json` is checked in. `npx @agentplaybooks/cli@latest sync . --apply`
creates it. Compatible with `@agentplaybooks/cli` 0.4.0+ (Agent Plugins 1.0).

## Install

From this repository:

```bash
npx @agentplaybooks/cli@latest doctor examples/coding-agent-baseline
npx @agentplaybooks/cli@latest sync examples/coding-agent-baseline --target=claude,cursor --apply
```

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
