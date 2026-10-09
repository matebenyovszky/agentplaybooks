---
name: playbooks
description: Work with the user's AgentPlaybooks playbooks through the connected AgentPlaybooks MCP server — list and open playbooks, adopt a playbook's persona and instructions, read and write its memory, use its skills, keep work documents on its canvas, call its connected tools, and use vault secrets without seeing their values. Use when the user mentions a playbook, asks Claude to remember something across sessions or tools, wants a shared team memory, or wants to call an API with a stored credential.
---

# Playbooks

A playbook is a portable agent setup the user keeps on AgentPlaybooks: one
persona (who the agent is), project instructions (the always-on rules),
skills, memory, canvas documents, connected MCP/OpenAPI tools, and a secret
vault. The same playbook follows the user into Claude, Cursor, Codex, Hermes,
and other clients, so what you write into it is visible there too — and to
anyone the playbook is shared with.

This plugin connects the **account** endpoint. Every playbook the signed-in
account owns or has been given is reachable from one connection, and each
playbook tool takes a `playbook_id` (its UUID or GUID). If the tools are
missing, the connector has not finished signing in: ask the user to open the
AgentPlaybooks connector and select **Connect**.

## Start of a task

1. `list_playbooks` to see what exists. Pick by name with the user if more
   than one fits; do not guess between similar names.
2. `get_playbook` for the chosen one. It returns the persona, instructions,
   skills, connected servers, and a memory summary.
3. If the user wants Claude to *be* that playbook, follow its persona and
   instructions for the rest of the conversation. Say that you are doing so.
4. `get_memory_context` packs the memory that matters into one read. Prefer it
   over reading keys one by one.

## Memory

- Read with `get_memory_context` or `search_memory`. These are read-only.
- `read_memory` fetches one key in full. It also counts the access, so it is
  not declared read-only and Claude may ask before running it.
- Write with `write_memory`: a stable, descriptive `key`, a short
  `description`, and tags. Store facts, decisions, and constraints that a later
  session or another tool will need — not conversation transcripts.
- Do not write secrets, credentials, or personal data about third parties into
  memory. Memory is readable by every client and person with access.
- `delete_memory` and `archive_memories` remove things other people may rely
  on. Confirm with the user first and name what will be removed.

## Skills

`list_skills` and `get_skill` return the playbook's skills. When a skill fits
the task, read it and follow it. `create_skill` and `update_skill` change what
every client of the playbook will do next time, so show the user the content
before writing, and prefer `update_skill` over creating a near-duplicate.
`list_skill_versions` and `rollback_skill` undo a bad change.

## Canvas

Canvas documents are versioned markdown work products scoped to a run.
`list_canvas`, `get_canvas_toc`, and `read_canvas` to read; `patch_canvas_section`
to change one section without rewriting the document; `lock_canvas_section`
while editing a section someone else might also edit.

## Connected tools and secrets

- `list_mcp_servers` shows the servers a playbook federates; `find_tools`
  searches their tools, and `call_connected_tool` calls one.
- `list_secrets` shows secret *names* only. Values are never returned.
- `use_secret` makes a read request (GET or HEAD) to an allowed host with the
  secret injected server-side. `use_secret_write` does the same for writes.
  Name the host and the effect to the user before a write.
- Never ask the user to paste a credential into the chat. To add one, point
  them to the playbook's **Secrets** tab on agentplaybooks.ai.

## Boundaries

- Changes to a shared playbook reach other people. Before a write, say which
  playbook and what changes.
- `delete_playbook` cannot be undone and removes every skill, memory entry,
  canvas, key, and secret in it. Only run it when the user names the playbook
  and confirms the deletion explicitly.
- If a tool refuses, report its message as given. Refusals name the missing
  permission or the reason, which is what the user needs to fix it.

Documentation: https://agentplaybooks.ai/docs/claude
