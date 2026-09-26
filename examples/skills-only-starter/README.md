# Skills-only starter

The smallest portable playbook: three skills and short project instructions.
You still own the store — persona, MCP, memory, and vault can join this tree
later. Nothing here is bound to a single host.

## What it contains

- `AGENTS.md` — load these skills when they match the task
- `.agents/skills/test-plan/`
- `.agents/skills/changelog-notes/`
- `.agents/skills/issue-triage/`

Compatible with `@agentplaybooks/cli` 0.4.0+ (Agent Plugins 1.0).

## Install into a host

From this repository:

```bash
npx @agentplaybooks/cli@latest doctor examples/skills-only-starter
npx @agentplaybooks/cli@latest sync examples/skills-only-starter --target=claude,cursor --apply
```

Copy into a new project:

```bash
cp -R examples/skills-only-starter my-project && cd my-project
npx @agentplaybooks/cli@latest sync . --apply
```

On a fresh copy, `sync` without `--target` may only write `agentplaybook.json`
(the portable store is not itself a host). Pass `--target=` for the clients
you use.

Optional Agent Plugins 1.0 round-trip:

```bash
npx @agentplaybooks/cli@latest plugin export examples/skills-only-starter --output=./my-plugin --apply
npx @agentplaybooks/cli@latest plugin import ./my-plugin my-project --apply
```

CLI docs: https://agentplaybooks.ai/docs/cli  
Agent Plugins: https://agent-plugins.org/specification

## What not to put here

- Secrets, API keys, tokens, or `.env` files
- MCP servers (add `.agents/mcp.json` later if you need them, using `${ENV}` refs only)

## License

MIT — see the [repository license](../../LICENSE).
