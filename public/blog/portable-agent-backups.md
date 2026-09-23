---
title: Your AI agent setup should survive a change of tools
description: Back up Agent Skills, custom agents, MCP references, and project instructions once, then restore them across supported AI coding tools with AgentPlaybooks.
date: 2026-09-23
author: Mate Benyovszky
---

# Your AI agent setup should survive a change of tools

An AI coding agent is more than a chat window. Its useful context lives in project instructions, skills, custom agents, and MCP server definitions. Those pieces are often scattered across Claude Code, Cursor, Codex, Gemini CLI, and other clients. Moving to a new editor—or rebuilding a laptop—should not mean reconstructing that setup from memory.

AgentPlaybooks now connects its existing `doctor` and `sync` workflow to a **private, versioned, central backup**. The CLI audits what is on disk, detects conflicting copies, and saves a portable snapshot of the shared configuration. You can restore that snapshot into a new project and render the native files for the clients you use there.

## From scattered files to a recoverable playbook

```bash
apb doctor . --strict
apb push .                 # inspect the upload plan
apb push . --apply         # save the hosted playbook and private snapshot
apb backups PLAYBOOK_GUID  # list backup revisions

apb pull PLAYBOOK_GUID ../recovered --apply
apb sync ../recovered --target=claude,cursor,codex,copilot,gemini --apply
```

The snapshot keeps `AGENTS.md`, the portable manifest, complete Agent Skills folders (including scripts, references, and assets), portable custom agents, MCP definitions, and an optional persona. To recover an earlier revision, pass `--snapshot=SNAPSHOT_ID` to `pull`. The owner can still retrieve the private backup by GUID after the playbook record is deleted.

This is more than copying a `SKILL.md` file. A skill's supporting resources travel with it, while `doctor` and `sync` continue to show where platform copies have drifted. AgentPlaybooks also imports and exports [Agent Plugins 1.0](https://agent-plugins.org/specification) packages; its secret-binding extension carries references, not secret values.

## Security and compatibility have boundaries

The backup does not include your vault's secret values. MCP credentials should be environment or vault references, and uploads with likely hard-coded credentials are refused. Detection is heuristic, so review skill resources before uploading them. Snapshots are private even if the associated playbook is public.

The bridge covers the **shared configuration model**, not every vendor-only capability. Local overrides, permission settings, hooks, worktrees, and arbitrary application data are not part of this backup. A hosted-only MCP connection may also have no equivalent local file. The CLI reports conflicts rather than silently overwriting different files.

The result is a practical way to back up and migrate AI agent configuration without tying the whole setup to one coding tool. Start with the [backup and migration guide](/docs/portable-agent-backups), or see the [CLI reference](/docs/cli) for exact commands and supported platforms.
