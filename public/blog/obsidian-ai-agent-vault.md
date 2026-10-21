---
title: Your Obsidian Vault Can Be Your Agent's Library, Not Its Runtime
description: Obsidian is optimized for humans, AgentPlaybooks for machines. Where the two overlap, what Obsidian does better, and how to publish skills from a vault to Claude Code, Cursor, and Codex while your notes stay in Obsidian.
date: 2026-08-03
author: Mate Benyovszky
---

# Your Obsidian Vault Can Be Your Agent's Library, Not Its Runtime

If you keep notes in Obsidian, you have probably already tried to make the vault
do agent work. A `Prompts/` folder. A note per skill. Maybe a filesystem MCP
server pointed at the vault so Claude can read it. It half works, and it is hard
to say exactly why.

Here is the seam, stated plainly: **Obsidian is optimized for humans.
AgentPlaybooks is optimized for machines.** A vault is a superb library. It is
not a runtime. Everything that feels almost-right about a vault-as-agent-brain
setup traces back to that one line.

Nothing below asks you to move your notes.

## The overlap is real

Both sides treat markdown with frontmatter as the primitive — an Obsidian note
and a `SKILL.md` are physically the same kind of file. Both make the same promise
about lock-in: your files, your folder, forever on one side; your agents stay
yours on any platform on the other. Both end up as the place a team's reusable
process knowledge accumulates.

That overlap is why the two compose almost for free, and it is also why people
keep expecting one to replace the other.

## What Obsidian is better at

Worth saying first, because it is true:

- **Writing and reading.** The editor, backlinks, graph view, the mobile app.
- **Unstructured knowledge.** You never need to know what a note is before you
  start writing it. A skill is a contract, so you do.
- **Zero infrastructure.** No account, no database, no network. For some people
  that is the requirement, not a convenience.
- **A far larger plugin ecosystem** and a much bigger community.
- **Years of personal notes.** Agent memory is not built for this and should not
  be.

If you work alone, on one machine, with one agent platform, and no API key is
involved — a vault plus a filesystem MCP server is a genuinely sufficient setup.
Adding a platform would be overhead. That is an honest recommendation, and it
holds until your second machine, your first teammate, or your first credential
shows up.

## What a vault structurally cannot do

These are not missing features. They follow from what a folder of notes *is*:

**Deploy to more than one agent platform.** The same skill has to land in
`.claude/skills/`, `.cursor/skills/`, `.codex/skills/` plus a `config.toml`,
`.agents/skills/`, and `~/.hermes/config.yaml` — each with the correct layout,
and with drift between the copies actually detected. A vault has no concept of a
deployment target. That is what `apb sync` is for.

**Hold a credential safely.** This is the sharp one. The moment a vault-based AI
setup needs an API key, that key goes in plaintext into
`.obsidian/plugins/<name>/data.json`. From there into Sync. And into git history
if the vault is versioned. AgentPlaybooks keeps the value encrypted and injects
it server-side, so the plaintext never reaches the disk or the agent's context.

**Let two agents write at once.** A Canvas document takes an `expectedVersion`
and returns HTTP `409` on a stale write, so the losing agent *knows* it lost. Two
agents editing one note through a file-sync service get their writes merged or
saved side by side, depending on the service — and neither is told the other
was there.

**Express permissions.** Sharing a vault shares all of it. There is no "this
teammate may edit skills but not rotate secrets" in a folder.

## Using both, today, with no plugin

`apb push` reads skills from any folder shaped as `<name>/SKILL.md`. A vault
folder can be exactly that shape:

```text
MyVault/
  Skills/
    code-review/SKILL.md
    release-notes/SKILL.md
```

```bash
cd MyVault
apb login
apb push --apply
```

You write in Obsidian; the playbook carries the skills to your teammates'
projects (see the last section). The other direction works too: `apb pull`
brings shared skills down as plain markdown into `.agents/skills/` — a hidden
folder Obsidian does not show — so copy the ones you want into `Skills/` to read
and link them like any other note, and the project note can link to the skill
that automates the project.

And when an agent finishes a long task, its Canvas document is markdown too.
The agent writes where writing is safe and versioned; you read where reading is
pleasant.

## One rule keeps both clean

**Vault for durable human knowledge. Playbook memory for machine state.**

Decisions, meeting notes, research, half-formed ideas: vault. Working-tier
scratch state, task graphs, run status, structured facts an agent reads back next
session: playbook memory.

Break this rule in one direction and you get a polluted graph and a stream of
sync conflicts. Break it in the other and you get a key-value store you cannot
think in.

## Try it against a vault you already have

Read-only, nothing is written:

```bash
apb doctor /path/to/MyVault
```

It reports Agent Skills spec violations, likely hard-coded credentials (line
numbers only, never values), and definitions that have drifted between copies.
It reads skills, agent instructions, and MCP configurations — not other
plugins' settings — so a key sitting in some plugin's `data.json` is one to look
for by hand.

The vault is where skills are written; agent tools read them from your
projects. Once the skills are pushed, run this in each project:

```bash
apb pull <guid> --apply
apb sync --target=claude,codex --apply
```

`pull` puts the skills in `.agents/skills/`, and `sync` writes them into the
tools you name — here `.claude/skills/` and `.codex/skills/`. Only a `SKILL.md`
with `name` and `description` in its frontmatter, in a folder named after the
skill, counts as a skill; the rest of a `Prompts/` folder is left alone.

Your notes never move. Keep Obsidian.
