# AgentPlaybooks Tools for Hermes

![AgentPlaybooks Tools for Hermes](/plugin-catalog/hermes-tools.png)

The **AgentPlaybooks Tools** plugin helps Hermes use skills and tools from your
playbooks. It guides you through connecting hosted MCP tools, including
federated MCP and OpenAPI services, setting up authentication, and syncing
private skills into the selected Hermes profile. It complements the separate
[AgentPlaybooks Memory](./hermes-memory.md) plugin.

The plugin installs a skill, not a background service. It uses the separately
installed `apb` CLI to make reviewed changes to the selected Hermes profile.
Credentials are configured in that profile's secret environment or in the
AgentPlaybooks vault; the plugin never asks you to paste a secret into chat.

## Install

The Hermes catalog package is named `agentplaybooks-tools`:

```bash
hermes plugins install agentplaybooks-tools --no-enable
hermes plugins enable agentplaybooks-tools
npm install -g @agentplaybooks/cli@0.7.0
apb --version
```

The CLI requires Node.js 20 or newer. For a remote Hermes gateway, install
Node.js and `apb` on the gateway host/container. Installing this skill into a
remote profile does not install the CLI on your Mac or gateway.

## Guided setup (CLI 0.7.0)

Run these commands on the gateway host/container, in the project directory.
`--profile=work` selects a named profile beneath the installation home;
`--hermes-home=/path` selects the installation home explicitly. Use the same
selection for setup, connect, memory setup and diagnostics.

```bash
apb login
apb hermes setup <playbook-guid> . --profile=work
apb hermes setup <playbook-guid> . --profile=work --apply
apb hermes doctor <playbook-guid> . --profile=work --check
```

The preview checks Node.js, Hermes, destination permissions and credential
presence, then lists the playbook files to restore and the profile config to
merge. Restore includes complete skill trees and their bundled resources. Hosted
MCP/OpenAPI definitions stay behind the playbook's single MCP endpoint. Existing conflicts
stop the whole setup. Hosted tools use a single playbook MCP connection; upstream
service keys remain in the AgentPlaybooks vault.

The default connection references `APBKS_KEY_AGENTPLAYBOOKS`. Configure a
playbook-scoped key in the selected profile's secret environment; `apb login`
separately authenticates skill downloads with your account key. `--tools-only`
skips file restoration and account login. Keys are never copied into config.

`--apply` verifies MCP initialization and tool listing using this process's
key environment, without invoking any tool. A missing/rejected key gives exit
code 2 even if the files were installed: configure the key, restart the gateway
and rerun `doctor --check` from that environment. A variable declared in the
profile's `.env` is reported separately; it does not prove the running gateway
loaded it. `doctor` without `--check` makes no network calls.

## Connect a playbook's tools

Authenticate the CLI, then preview a scoped connection:

```bash
apb login
apb connect <playbook-guid> --target=hermes
```

Review the plan. It shows the environment variable name for the required
playbook-scoped API key. Add that secret to the selected Hermes profile, then
apply the connection:

```bash
apb connect <playbook-guid> --target=hermes --apply
```

The connection exposes the playbook's hosted MCP tools, including configured
federated MCP and OpenAPI services. Upstream service credentials stay in the
AgentPlaybooks vault; Hermes receives tool access without the upstream secret
values being copied into its configuration.

## Add private skills

Pull the reviewed skill files into the project and sync them to Hermes:

```bash
apb pull <playbook-guid> .
apb pull <playbook-guid> . --apply
apb sync . --target=hermes
apb sync . --target=hermes --apply
```

Each command without `--apply` previews its changes. Review the plan before
applying it. Public skills can also be installed directly from a playbook's
`/.well-known/skills/` URL.

For details about the CLI and authentication scopes, see the
[CLI guide](./cli.md) and [Hermes Memory guide](./hermes-memory.md).
