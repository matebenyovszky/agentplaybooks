# Portable agents in Hermes

![AgentPlaybooks Portable Agents plugin card](/plugin-catalog/portable-agents.png)

AgentPlaybooks helps a Hermes agent audit, synchronize, package, and restore
its configuration. The **AgentPlaybooks Portable Agents** Hermes plugin bundles
a skill for those workflows. It uses the released `apb` CLI, and it is
separate from the [native memory provider](./hermes-memory.md).

The portability plugin works on demand. It does not schedule background
automation, add a model-facing tool, or change a Hermes profile on install.
Its catalog category is **Tools** because it guides use of the CLI's
configuration tools.

## Install

The new Hermes catalog entry is pending review. Until it is listed, install
the plugin directly from its repository subdirectory:

```bash
hermes plugins install matebenyovszky/agentplaybooks/packages/hermes-portable/agentplaybooks-portable --no-enable
hermes plugins enable agentplaybooks-portable
npm install -g @agentplaybooks/cli@0.4.0
apb --version
```

This requires Node.js 20 or later. The plugin installs a namespaced
`agentplaybooks-portable` skill; Hermes exposes it through `skills_list` and
`skill_view` after activation. The npm CLI is a separate prerequisite,
installed explicitly by the operator. A hosted account is optional for
local audits and sync; `apb login` is needed for hosted pull/push.

Once the catalog listing is approved and published, the first command becomes
`hermes plugins install agentplaybooks-portable`.

## Use it

From a project directory:

```bash
apb doctor .                          # inspect configuration and drift
apb sync . --target=hermes            # preview Hermes profile changes
apb sync . --target=hermes --apply    # apply the reviewed plan
```

To move a hosted playbook into a Hermes Bot Mode profile, run `apb login`,
then preview and apply the pull and profile export:

```bash
apb pull <guid> .
apb pull <guid> . --apply
apb export hermes ./bots/research
apb export hermes ./bots/research --apply
hermes profile install ./bots/research --name research
apb sync --target=hermes --profile=research --apply
```

The CLI can also package standard Agent Plugins 1.0 skill trees, custom
agents, and MCP references with `apb plugin export . --output=<dir>`.
Secret values stay local. Plan commands are read-only; `--apply` writes
after you review them. See the [CLI guide](./cli.md) and
[Bot Mode deployment guide](./bot-platform-integrations.md) for details.
