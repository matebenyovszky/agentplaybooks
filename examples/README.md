# Starter playbooks

Small, MIT-licensed trees you can fork, clone, or copy, then install with the
AgentPlaybooks CLI. This is a gallery of examples, not a marketplace.

Each starter is a **plain project directory** (`AGENTS.md` + `.agents/`). You
do not need a ZIP or a hosted GUID to try them. Publishing a public playbook
to Explore is a separate dashboard step for the playbook owner.

Compatible with `@agentplaybooks/cli` **0.4.0+** (Agent Plugins 1.0, `doctor`,
and `sync`). Commands below use `@latest`.

| Starter | What it is |
|---|---|
| [coding-agent-baseline](./coding-agent-baseline/) | Portable coding-agent baseline: project instructions, two skills, a safe MCP stub |
| [doctor-drift-demo](./doctor-drift-demo/) | Intentional mild skill-tree drift so `doctor` reports a finding and `sync --apply` can heal it |
| [skills-only-starter](./skills-only-starter/) | Lowest-friction install: skills + a short `AGENTS.md`, no MCP |
| [cursor-hermes-starter](./cursor-hermes-starter/) | Cursor + Hermes flavored instructions, skills, and a portable persona for Hermes `SOUL.md` |

## One-command install (from a clone)

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
only (`${EXAMPLE_MCP_TOKEN}`).

## Docs

- CLI: https://agentplaybooks.ai/docs/cli
- Agent Plugins specification: https://agent-plugins.org/specification

## License

MIT, same as the [repository license](../LICENSE). Each starter README repeats
that.
