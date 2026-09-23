# AgentPlaybooks Portable Agents for Hermes

This is an [Agent Plugins 1.0](https://agent-plugins.org/) package for Hermes.
It installs a namespaced Hermes skill that guides audits, cross-platform
configuration sync, Agent Plugin export/import, hosted playbook recovery, and
Hermes profile deployment through the published AgentPlaybooks CLI.

The package is **skill only**: it does not modify Hermes configuration on
installation, execute a command in the background, or register model-facing
tools. Run the commands in the skill when needed. It is separate from the
[native memory provider](https://agentplaybooks.ai/docs/hermes-memory), which
owns a profile's durable memory when selected.

Check `hermes plugins search agentplaybooks-portable`. When it appears in
your catalog, install and enable it:

```bash
hermes plugins install agentplaybooks-portable --no-enable
hermes plugins enable agentplaybooks-portable
npm install -g @agentplaybooks/cli@0.4.0
apb --version
```

If it is not listed yet, install directly from the repository instead:
`hermes plugins install matebenyovszky/agentplaybooks/packages/hermes-portable/agentplaybooks-portable --no-enable`.
Hermes needs Node.js 20+ for the CLI. Installing this skill does
not automatically install npm packages or require a hosted account. Local
`apb doctor` and `apb sync` run without one; hosted `pull` and `push` require
`apb login` or `AGENTPLAYBOOKS_API_KEY`.

Examples from a project directory:

```bash
apb doctor .
apb sync . --target=hermes
apb sync . --target=hermes --apply
apb plugin export . --output=./agent-plugin --apply
```

The default plan is read-only. Review it before `--apply`; different existing
definitions are reported as conflicts. Credentials stay local, and a pushed
playbook contains references to secret names, not their values. For a Hermes
Bot Mode profile, see the [distribution workflow](https://agentplaybooks.ai/docs/bot-platform-integrations).

MIT licensed; see `LICENSE`.
