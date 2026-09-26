# Starter playbooks

Each starter is a **portable playbook you control**: persona, instructions,
skills, MCP, memory, and vault references in one project tree — not a vendor
folder and not a hosted GUID. Fork it, clone it, or copy it. This is a gallery
of examples, not a marketplace.

Publishing a public playbook to Explore is a separate dashboard step for the
owner. Compatible with `@agentplaybooks/cli` **0.4.0+** (Agent Plugins 1.0).
Commands below use `@latest`.

| Starter | What it is |
|---|---|
| [coding-agent-baseline](./coding-agent-baseline/) | Coding-agent playbook: instructions, two skills, a safe MCP stub (credentials by env ref) |
| [doctor-drift-demo](./doctor-drift-demo/) | Review playbook whose Claude/Cursor copies drifted; the portable store stays canonical |
| [skills-only-starter](./skills-only-starter/) | Smallest playbook: three skills + instructions; no MCP |
| [cursor-hermes-starter](./cursor-hermes-starter/) | Playbook with persona, instructions, skills, and an MCP stub for Cursor and Hermes hosts |

## Install into a host

The playbook is the store. The CLI copies it into Claude Code, Cursor, Hermes,
and other hosts — and can check that those copies still match.

From a clone:

```bash
git clone https://github.com/matebenyovszky/agentplaybooks.git
cd agentplaybooks

npx @agentplaybooks/cli@latest doctor examples/coding-agent-baseline
npx @agentplaybooks/cli@latest sync examples/coding-agent-baseline --target=claude,cursor --apply
```

Copy a starter into a new project instead:

```bash
cp -R examples/skills-only-starter my-project && cd my-project
npx @agentplaybooks/cli@latest sync . --apply
```

Optional Agent Plugins 1.0 round-trip (still a directory, not a required ZIP):

```bash
npx @agentplaybooks/cli@latest plugin export examples/skills-only-starter --output=./my-plugin --apply
npx @agentplaybooks/cli@latest plugin import ./my-plugin my-project --apply
npx @agentplaybooks/cli@latest sync my-project --target=claude,cursor --apply
```

`sync` is plan-only until you pass `--apply`. Do not put secrets, API keys, or
tokens in any starter file — MCP stubs use environment-variable references
only (`${EXAMPLE_MCP_TOKEN}`). Memory and vault stay yours: starters leave
memory unset and never store secret values.

## Docs

- CLI: https://agentplaybooks.ai/docs/cli
- Agent Plugins specification: https://agent-plugins.org/specification

## License

MIT, same as the [repository license](../LICENSE). Each starter README repeats
that.
