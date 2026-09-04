---
title: Using Hermes Agent with AgentPlaybooks
description: Hermes Agent is an MIT-licensed, self-hosted personal agent from Nous Research. Here is how a playbook becomes its skills, its MCP servers, and its identity — and how to control what it reaches for first.
date: 2026-06-15
author: Mate Benyovszky
---

# Using Hermes Agent with AgentPlaybooks

**Hermes Agent** is Nous Research's open-source (MIT) personal agent. One agent core
runs behind a CLI, a TUI, an Electron desktop app, and a messaging gateway for
Telegram, Discord, Slack and around twenty other platforms. Everything it knows
lives in one profile directory — `~/.hermes`, or `$HERMES_HOME` if you run
several profiles — and nothing leaves your machine except the model calls you
configure.

> **August 2026 update:** Hermes Agent now includes profile-based Bot Mode with
> persistent bots, routines, group chats, cross-machine peers, Agent Skills,
> and MCP. For the current capability map and our profile deployment plan, read
> [Your Bot Is Not Your Agent](/blog/your-bot-is-not-your-agent) and the
> [portable bot team guide](/docs/bot-platform-integrations).

> **Two different things are called Hermes.** This post is about *Hermes Agent*,
> the client you install. The *Hermes* models (Hermes 3, Hermes 4) are a separate
> Nous Research release; you can run one as the model behind any MCP-capable
> client, including this one, but that is a model choice and not what makes a
> playbook portable.

That profile layout is exactly what AgentPlaybooks synchronizes:

| What a playbook holds | Where Hermes Agent reads it |
|---|---|
| Persona | `~/.hermes/SOUL.md` — slot #1 of the system prompt |
| Project instructions | `AGENTS.md` in the project (read natively) |
| Agent Skills | `~/.hermes/skills/`, plus every directory in `skills.external_dirs` |
| MCP servers | `mcp_servers:` in `~/.hermes/config.yaml` |

## Sync a playbook into a Hermes profile

Pull the playbook, then hand it to Hermes:

```bash
apb pull <playbook-guid> --apply
apb sync --target=hermes --apply
```

The plan tells you exactly what happens before anything is written. Three things
are worth knowing about the hermes target:

**Skills are registered, not copied.** Instead of duplicating every skill into
`~/.hermes/skills/`, sync adds the project's portable store to
`skills.external_dirs` in `config.yaml`. Hermes then reads the skills where they
already are. Nothing is duplicated, so nothing can drift; the next `apb pull`
is live immediately, with no second sync.

**MCP servers are merged into `config.yaml`.** The document is edited rather than
regenerated, so your comments, key order, and every unrelated setting survive. A
server that already exists with a different definition is reported as a conflict
and left alone — sync never overwrites a connection you configured by hand.

**The persona becomes `SOUL.md`.** Hermes seeds a default `SOUL.md` on first run,
and sync will not overwrite it. If you want the playbook's persona to be the
agent's identity, delete the seeded file (or merge the two by hand) and run sync
again. It is your agent's identity — that decision should not be made by a tool.

## What Hermes reaches for first

Hermes has no numeric skill priority. The order comes out of four mechanisms,
and together they give you what you usually want — the agent's own skills first,
your organization's playbook right behind them:

1. **Precedence on a name collision.** `~/.hermes/skills/` wins over anything in
   `external_dirs`. Because the playbook is registered as an external directory,
   Hermes' built-in and self-written skills stay in front, and the playbook is
   the next thing it sees.
2. **The instruction files.** `SOUL.md` and `AGENTS.md` are where you say out
   loud which source is authoritative — for example that the playbook's skills
   are the organization's rules and win over the model's own habits. This is
   prompt discipline, and in practice it is what decides.
3. **Bundles.** A Hermes bundle groups several skills under one slash command and
   takes precedence over individual skills when slugs collide.
4. **`hermes skills config`.** Per-platform enable/disable, for turning off the
   noise you installed from a marketplace and never used.

One Hermes-specific trap the CLI now reports for you: Hermes loads exactly **one**
project context file, first match wins, in the order `.hermes.md` → `AGENTS.md` →
`CLAUDE.md` → `.cursorrules`. A project with both `.hermes.md` and `AGENTS.md`
ships instructions Hermes will never read. `apb sync --target=hermes` flags that
as a conflict instead of letting you find out later.

## Install skills straight from a playbook

Hermes can install skills from any site that publishes them at the well-known
path, no registry and no sign-up involved. Every public playbook does:

```bash
hermes skills search https://agentplaybooks.ai/playbooks/<guid> --source well-known
hermes skills install well-known:https://agentplaybooks.ai/playbooks/<guid>/.well-known/skills/<name>
```

There is a site-wide index too, at
`https://agentplaybooks.ai/.well-known/skills/index.json`. Both serve real
`SKILL.md` documents — the same Agent Skills format
([agentskills.io](https://agentskills.io/specification)) every other client
reads, with the fields outside the spec that Hermes understands (`version`,
`platforms`, `metadata.hermes.*`) preserved exactly as the author wrote them.

Only public playbooks are published this way. A private or unlisted playbook
stays behind `apb pull`, which is the point rather than a limitation.

## The playbook as an MCP server

The other direction is just as useful: a playbook is itself an MCP server, so
Hermes can call it as a tool instead of only reading files from it. Add it to
`~/.hermes/config.yaml`:

```yaml
mcp_servers:
  my-playbook:
    url: "https://apbks.com/api/mcp/YOUR_PLAYBOOK_GUID"
    headers:
      Authorization: "Bearer ${PLAYBOOK_API_KEY}"
```

Keep the key itself in `~/.hermes/.env`, not in `config.yaml`. Hermes resolves
`${VAR}` references from the environment first and then from that file, so the
config you commit or share never contains a credential.

Through MCP, Hermes gets the playbook's memory and canvas as resources and its
skills and integrations as tools. If a tool needs an upstream credential, the
playbook's Secrets Vault executes the call on the agent's behalf: the raw value
never reaches the model, and never lands on the machine.

## Next steps

- [The CLI reference](/docs/cli) — every target, and what sync writes for each
- [Platform integrations](/docs/platform-integrations) — the same playbook in other clients
- [Hermes Agent documentation](https://hermes-agent.nousresearch.com/docs) — profiles, plugins, terminal backends
