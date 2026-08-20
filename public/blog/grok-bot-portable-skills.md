---
title: Grok Bot Reads Your Playbook Already — Meet the `grok` Target
description: xAI's Grok Bot discovers skills from the portable .agents/skills store and loads AGENTS.md natively, so a synced project is Grok-ready with no bridge file. The new CLI target makes that explicit — and says out loud the one thing a file cannot provision.
date: 2026-08-19
author: Mate Benyovszky
---

# Grok Bot Reads Your Playbook Already

A new agent lands on your machine roughly every other week, and each one asks
the same question: *where do I put my skills this time?* The honest answer for
most of them has been "in another folder, in another format, kept in sync by
hand."

Grok Bot, xAI's desktop agent, is a pleasant exception — and the `grok` target
shipping in the AgentPlaybooks CLI today mostly just makes that fact
explicit.

## What we found

Grok Bot discovers skills from a fixed set of roots. Read out of the shipped
application, that list is:

```
.cursor/skills/   .cursor/skills-cursor/   .agents/skills/
.claude/skills/   .codex/skills/           .claude/plugins/
```

`.agents/skills/` — the portable store AgentPlaybooks has been writing all
along — is in there, classified as a workspace skill source. And its system
prompt loads `AGENTS.md` directly, telling the model that the file may carry
environment details, code guidelines, "an overview of important rules or
skills and when they should be used", and that it should always follow them.

Which means the interesting part of the integration was already done. If you
have run `agentplaybooks sync` on a project, or pulled a playbook onto a new
machine, Grok Bot sees those skills and those instructions with no bridge
file, no copy step, and no format conversion.

## The new target

```bash
agentplaybooks sync . --target=grok --apply
```

| Target | Skills | MCP servers | Instructions |
|---|---|---|---|
| `grok` — Grok Bot (xAI) | `.agents/skills/<name>/SKILL.md` | — (account MCP Box) | reads `AGENTS.md` natively |

You could already reach the same files through the `antigravity` target, since
both read the portable store — but calling the Grok target "Antigravity" is
the kind of small lie that costs someone an hour later. `doctor` and `sync`
now detect the app by its `~/.grokbot` profile and suggest the target by name.

## The one thing a file cannot do

MCP servers. Grok Bot stores only an array of server **ids** in
`~/.grokbot/settings.json`:

```json
{ "mcpBoxServers": [], "mcpCustomInstructionsByServerId": {}, "mcpDisabledToolsByServerId": {} }
```

The definitions behind those ids live in your account's MCP Box, not on disk.
No project file provisions them, which means `sync` genuinely cannot deliver a
playbook's MCP servers to this target.

What it does instead is say so:

```
[conflict:grok] mcp 'deploy': Grok Bot's MCP servers live in the account's
MCP Box, not in a project file. Add the playbook's own MCP endpoint
(POST /api/mcp/<guid>) to the Box once, and its tools reach every Grok Bot
session.
```

A playbook whose MCP servers quietly did not arrive looks exactly like a
playbook that has none — and the person who finds out is the one debugging a
missing tool at the wrong moment. So the CLI reports the gap rather than
skipping it in silence. It reports it only when there is actually something it
would have delivered; a playbook with no MCP servers says nothing.

The way around it is one entry, once. Add your playbook's own MCP endpoint —
`POST /api/mcp/<guid>` — to the Box, and everything the playbook holds arrives
through that single server: skills, memory, canvas documents, and `use_secret`
for credentials the agent should be able to *use* without ever reading. Per-server
custom instructions and per-server disabled tools are local settings in Grok
Bot, so you can still tune what that one server exposes.

## Try it

```bash
npx agentplaybooks doctor .
npx agentplaybooks sync . --target=grok
```

Plan first; nothing is written until you add `--apply`. If the project already
has skills in `.claude/skills/` or `.cursor/skills/`, the plan will show them
landing in `.agents/skills/` — and that is the whole migration.
