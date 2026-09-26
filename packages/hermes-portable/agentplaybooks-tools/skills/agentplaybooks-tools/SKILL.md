---
name: agentplaybooks-tools
description: Connect AgentPlaybooks skills, MCP servers, and federated OpenAPI tools to Hermes. Guide playbook sync, authentication, secret setup, and recovery.
---

# AgentPlaybooks skills and tools in Hermes

Use the AgentPlaybooks CLI (`apb`) to make a playbook's skills and tools
available to Hermes. Work in the project directory unless the user requests the
global scope. Set `HERMES_HOME` before running commands when a non-default Hermes
profile is the intended target.

## Check the CLI

Run `apb --version`. If the CLI is missing, explain that Node.js 20+ and
`@agentplaybooks/cli` must be installed separately. For a remote Hermes
gateway, verify Node.js and `apb` on the gateway host/container, not just on the
desktop client; the CLI must be able to write the selected gateway profile.
This skill does not install software or run commands by itself.

## Connect MCP/OpenAPI tools and install skills

1. For private playbooks or hosted management operations, authenticate the CLI
   with `apb login`. Never ask for an API key in chat.
2. Preview `apb connect <guid> --target=hermes` and explain that it adds the
   hosted playbook MCP endpoint to the selected Hermes profile. This connection
   exposes that playbook's MCP tools, including its configured federated
   MCP/OpenAPI tools.
3. The plan reports the required environment variable. Ask the user to configure
   a playbook-scoped API key in the selected Hermes profile's secret environment;
   do not request or print the value.
4. After the user reviews and approves the planned local change, run
   `apb connect <guid> --target=hermes --apply`.
5. To install private skills locally, separately preview `apb pull <guid> .`,
   then after review run `apb pull <guid> . --apply`.
6. Preview `apb sync . --target=hermes`. Explain that it registers the pulled
   skills and merges MCP definitions from the local project into the selected
   Hermes profile's `config.yaml`. After review, apply with
   `apb sync . --target=hermes --apply`.

Public skills can also be installed directly from the playbook's
`/.well-known/skills/` URL. For an account-wide connection, preview
`apb connect --account --target=hermes`; after review, apply with
`apb connect --account --target=hermes --apply`.

## Authentication and API keys

- `apb login` uses a user API key for CLI operations. The CLI stores it in its
  own credential store; it must not be copied into Hermes config or the skill.
- The account MCP connection references `AGENTPLAYBOOKS_API_KEY`. Tell the user
  to configure that variable in the selected Hermes profile's secret environment
  and restart the gateway/profile if required. Account keys can reach account-wide
  tools, so prefer a scoped playbook connection when it covers the workflow. Do
  not request or print the value.
- A playbook-scoped `connect` plan reports the required variable name (by
  default `APBKS_KEY_AGENTPLAYBOOKS`). Use a key scoped to that playbook with the
  minimum permissions required; configure it in Hermes's profile secret store
  or environment.
- Credentials for upstream federated MCP/OpenAPI services belong in the
  AgentPlaybooks encrypted secrets vault. They are resolved for tool calls and
  must not be copied into Hermes's MCP configuration.
- Never put secret values in `agentplaybook.json`, skill files, committed
  configuration, or a `push` upload. `push` should carry secret references only.

If the user wants to configure an upstream service, guide them to create or
select its vault secret in AgentPlaybooks, then associate that secret with the
service's MCP/OpenAPI configuration. The agent should use the exposed tool; it
must not ask the user to reveal the upstream secret in chat.

## Limits and safety

- `doctor` is read-only.
- `pull`, `sync`, and `connect` are previews until `--apply` is supplied.
- `apb push --apply` uploads reviewed project configuration. Explain its scope
  before applying it.
- Existing differing local definitions are conflicts; report them instead of
  overwriting them.
- Public skills can be installed from a playbook's well-known skills URL.
  Private skills require authenticated `pull`.

See the [CLI guide](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/cli)
and [Hermes integration guide](https://agentplaybooks.ai/docs/hermes-portable-agents).
