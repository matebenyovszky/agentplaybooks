---
title: "Your Bot Is Not Your Agent: Portable Teams for Grok Bot and Hermes Bot Mode"
description: Grok Bot and Hermes Bot Mode make persistent agent teams real. AgentPlaybooks can keep the identity, skills, tools, and memory behind those bots portable instead of platform-owned.
date: 2026-08-18
author: Mate Benyovszky
---

# Your Bot Is Not Your Agent

Grok Bot and Hermes Bot Mode arrived at almost the same product idea from two
very different directions: stop treating an agent as a disposable chat, give
it a name and a job, let it remember, and keep it around long enough to become
useful.

That is a real shift. It also makes agent portability much more urgent.

If you spend weeks teaching a research Bot how you work, connecting tools,
refining skills, and building useful memory, is that agent now yours? Or is it
only a configuration trapped inside the runtime where you created it?

Our position is simple:

> A bot is a place where an agent runs. The agent itself should remain yours.

## Two important launches

[Grok Bot](https://x.ai/news/introducing-grok-bot), announced in early beta on
August 11, gives every Bot a cloud computer. It can sign into websites and
apps, work through interfaces that have no API or MCP server, continue while
you are away, learn routines by watching, and coordinate with other Bots in
direct messages or group chats.

[Hermes Bot Mode](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/bot-mode.md)
takes an open, profile-based route. A Hermes Bot is a Hermes profile with its
own model, `SOUL.md`, memory, skills, credentials, MCP configuration, sessions,
cron routines, and avatar. Bots can message each other, deliberate in groups,
and live on different machines while appearing in one desktop roster.

The products overlap, but their strengths are different:

| | Grok Bot | Hermes Bot Mode |
|---|---|---|
| Runtime | Managed cloud computer | Open-source local, remote, or cloud runtime |
| Tool access | Works through apps and websites, even without APIs | Native tools, Agent Skills, MCP, terminal backends |
| Persistence | Conversations, learned preferences, demonstrated routines | Profile files, memory, sessions, cron jobs, configuration |
| Teams | Parallel Bots, direct messages, group chats | Profiles, bot-to-bot messages, group chats, cross-machine peers |
| Portability boundary | Not yet documented in the beta announcement | Profile export and Hermes-native Git distributions |

Both are useful. Neither is a neutral source of truth across platforms.

## The missing layer is not another agent runtime

AgentPlaybooks should not compete with Grok Bot's computer use or Hermes'
runtime. Those systems execute work. The missing layer is the portable control
plane above them.

The model we are working toward is:

- **One playbook defines one agent:** identity, instructions, skills, MCP and
  OpenAPI connections, memory policy, and secret requirements.
- **One deployment runs that playbook somewhere:** as a Hermes profile, a
  Grok Bot, or another agent runtime.
- **One team manifest connects several playbooks:** roles, groups, handoffs,
  shared resources, and scheduled routines.

The deployment can change without forcing the agent definition to change.
Run the same researcher in Hermes on your workstation, move it to a managed
Bot for a week, or use both at once. The runtime may keep local execution
state, but the canonical definition and selected durable knowledge stay under
your control.

This is the same vendor-neutral promise we started with for coding agents,
expanded from one agent to a team.

## What works today

AgentPlaybooks already exposes every playbook through both MCP and OpenAPI. A
runtime can read the persona and instructions, discover skills and connected
tools, work with persistent memory, and write artifacts to a run-scoped canvas.
The user control plane can also create a playbook and immediately apply all of
its operations.

The CLI currently synchronizes standard Agent Skills into Hermes' skill store.
Hermes can also connect to a hosted playbook as a remote HTTP MCP server. This
is useful today, but it is not yet a full Bot Mode deployment: the CLI does not
currently create a named Hermes profile or map the complete playbook into its
`SOUL.md`, profile MCP configuration, cron jobs, and metadata.

Grok Bot is earlier from an integration perspective. The launch announcement
says Bots can work in websites and apps without a clean API or MCP, which means
a Bot can use AgentPlaybooks through its web interface or public playbook
exports. However, xAI has not documented an external Bot configuration API,
MCP attachment point, or import/export format in the launch material. We will
not pretend a native connector exists before it does.

## What we should build next

The first concrete adapter should be Hermes profile deployment because its
primitives are open and explicit:

| Playbook | Hermes profile |
|---|---|
| Persona | `SOUL.md` |
| Skills | `skills/<name>/SKILL.md` |
| MCP servers | profile `mcp.json` / `config.yaml` |
| Secret requirements | `.env.EXAMPLE` references, never secret values |
| Routines | profile `cron/` jobs |
| Deployment metadata | profile distribution metadata plus sync hash |

The command should plan before writing and refuse silent overwrites, just like
the existing CLI:

```bash
apb deploy <playbook> --target=hermes --profile=researcher
apb deploy <playbook> --target=hermes --profile=researcher --apply
```

After that, we need a deployment record and drift report: which playbook
version is running where, what the runtime changed locally, and whether to
pull, push, or deliberately keep the divergence.

For Grok Bot, the safe short-term bridge is a scoped access link that lets one
Bot use one playbook without receiving an account-wide API key. A native
adapter should follow when xAI publishes a supported Bot API or portable
configuration surface.

## The question we want to validate

The interesting question is no longer whether people will use persistent AI
teammates. Grok and Hermes both made that bet.

The question is whether you want the agent behind that teammate to survive a
change of runtime.

Would you use one vendor-neutral definition for the same Bot across Hermes,
Grok, coding agents, and future runtimes? Should a team be a collection of
independent playbooks, or should the whole roster be one larger bundle? And
which parts of memory should travel versus remain private execution state?

We are building this in the open. Read the
[integration design](/docs/bot-platform-integrations), inspect the
[GitHub repository](https://github.com/matebenyovszky/agentplaybooks), and tell
us where the abstraction breaks.
