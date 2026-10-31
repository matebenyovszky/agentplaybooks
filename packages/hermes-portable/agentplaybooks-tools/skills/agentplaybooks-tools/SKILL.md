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

## Guided setup

Requires `@agentplaybooks/cli@0.10.0` or later. Run on the gateway host/container.
Choose the profile explicitly using `--profile=<name>` and, when needed,
`--hermes-home=<installation-directory>`; keep that selection on every command.

1. Run `apb hermes doctor <guid> . --profile=<name>` to report the runtime,
   destination permissions and credential presence without network calls.
2. Use `apb login` for authenticated file downloads. Never request a key in chat.
3. Preview `apb hermes setup <guid> . --profile=<name>`. Explain the listed
   files: complete skill trees and their bundled resources are restored. Hosted tools use the playbook MCP endpoint.
   Use `--tools-only` if only a hosted connection is wanted; account login is
   then unnecessary.
4. Explain any conflicts and the required playbook-key variable (by default
   `APBKS_KEY_AGENTPLAYBOOKS`). The user configures it in the profile's secret
   environment. Values never belong in chat or generated configuration.
5. Once the user has authorized the shown changes, run the same setup with
   `--apply`. Existing authorization covers this step; do not repeatedly ask
   for approval of the same setup.
6. Check the result. Apply also probes MCP initialization and tool listing
   using this process's environment. Missing credentials can give exit code 2
   after files were installed. Report that distinction; do not claim the
   connection works until the probe succeeds. After configuring the key and
   restarting the profile, run `apb hermes doctor <guid> . --profile=<name> --check`
   from that environment. This check never invokes a remote tool.

The individual `connect`, `pull` and `sync` commands remain available. For
account-wide tools use `apb connect --account --target=hermes --profile=<name>`.
Public skills can also be installed from the playbook's well-known skills URL.

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

## Idle traffic

CLI 0.8.1 uses a local `apb mcp stdio` connection for Hermes. This forwards actual
requests only and answers local ping without HTTP. Do not add a keepalive timer.
For existing HTTP entries, show the conflicting entry and the replacement stdio
plan, then migrate the selected entry after authorization, preserving the endpoint
and key variable. Back up configuration and restart the selected profile.
Never use `keepalive_interval: 0` to disable HTTP keepalive in Hermes 0.22.5.
