---
name: agentplaybooks-portable
description: Audit, sync, export, and restore agent instructions, skills, MCP references, and Hermes profiles with the AgentPlaybooks CLI. Use for portable agent setup, cross-client drift checks, and playbook recovery.
---

# Portable agents with AgentPlaybooks

Use the AgentPlaybooks CLI (`apb`) to keep an agent's persona, project
instructions, Agent Skills, and MCP server definitions portable across Hermes
and other clients. This skill is a workflow guide; it does not install the CLI
or register extra model-facing tools. The native AgentPlaybooks **memory
provider** is a separate Hermes plugin.

Check `apb --version` before using the CLI. If it is absent, tell the user to
install Node.js 20+ and `@agentplaybooks/cli@0.4.0` (for example,
`npm install -g @agentplaybooks/cli@0.4.0`), then verify `apb --version`.
Work from the project directory unless the user explicitly asks for the
global scope. Set `HERMES_HOME` to select a different Hermes profile.

| Goal | Plan command | Apply command |
|---|---|---|
| Check drift and unsafe configuration | `apb doctor .` | No apply step |
| Sync portable config into Hermes | `apb sync . --target=hermes` | `apb sync . --target=hermes --apply` |
| Package Agent Plugins 1.0 skills and MCP references | `apb plugin export . --output=./agent-plugin` | Add `--apply` after reviewing the plan |
| Restore an Agent Plugins 1.0 package | `apb plugin import ./agent-plugin .` | Add `--apply` after reviewing the plan |
| Restore a hosted playbook | `apb pull <guid> .` | `apb pull <guid> . --apply` |
| Create a Hermes Bot Mode distribution | `apb export hermes ./bots/<name>` | Add `--apply` after reviewing the plan |

For a generated Hermes profile distribution, use
`hermes profile install ./bots/<name> --name <name>`, then
`apb sync --target=hermes --profile=<name> --apply` to seed model and MCP
configuration. Later changes use `apb export hermes ... --apply` followed by
`hermes profile update <name>`. Profile updates preserve the bot's sessions
and memory.

For hosted sharing, `apb login` stores a user API key locally; `apb push .`
previews what would be uploaded and `apb push . --apply` writes it. Never ask
the user to paste a key into chat or put a key in a skill or manifest. Secret
values do not travel with a playbook. Use `apb connect --account --target=hermes`
to preview the optional account MCP connection; it references
`AGENTPLAYBOOKS_API_KEY` rather than copying the key into Hermes config.

Show or summarize every plan before applying it. Report conflicts rather
than overwriting a different local definition. `doctor` is read-only. Sync,
pull, export, and connect are plan-only without `--apply`; a hosted push
uploads data and should be performed when the user requests it.

See the [CLI guide](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/cli)
for platform-specific details and [Hermes Bot Mode guide](https://agentplaybooks.ai/docs/bot-platform-integrations)
for profile deployment.
