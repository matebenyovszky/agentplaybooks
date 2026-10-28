---
name: agentplaybooks
description: Use AgentPlaybooks playbooks, skills, memory, canvas, connected MCP/OpenAPI tools, and vault-backed API calls in chat. Also audit, sync, back up, or restore agent configuration across clients. Applies to AgentPlaybooks-hosted data and portable agent configuration, not unrelated document or memory services.
---

# AgentPlaybooks

Use the connected AgentPlaybooks tools for hosted work. A local CLI is an
additional configuration/sync surface, not a prerequisite for chat operations.
The account connection covers all the capabilities below, not just listing or
backups. Tool names may have a host-assigned namespace; use the actual catalog.

## Choose the shortest relevant path

- Reuse a playbook ID already established for the intended account and task.
  Otherwise use `list_playbooks` with a name query and a small limit. Do not
  enumerate the whole account or load every playbook to find one. If several
  match, ask which one before writing. Account tools use UUIDs; scoped tools
  on the management connection also accept a playbook GUID.
- Pass `playbook_id` to scoped tools on the account connection. A connection
  already scoped to one playbook does not need that argument.
- Call an available, known tool directly. Use `find_tools` with a few relevant
  keywords and a small limit to discover unfamiliar built-in or federated
  MCP/OpenAPI operations for the selected playbook. Read the returned schema
  and effect annotations; discovering a tool does not authorize its effects.
- Keep list/overview calls compact. Fetch bodies, reference sections, or
  memory values only when needed for the task. Never begin a routine task
  with `get_playbook(include_content=true)` or download every attachment.
- Reuse IDs and metadata during this conversation, but refresh after a write,
  a not-found result, or an account change. Do not poll or prefetch on idle.

## Hosted task routing

| User's task | Useful path |
|---|---|
| Inspect or edit a playbook | `get_playbook` (compact by default); `update_playbook` for the requested fields. Persona is the agent's identity; instructions are the project's rules. There is no `get_persona`. |
| Use a skill | `list_skills` for metadata → `get_skill` for the chosen body. Read only the required attachment/heading via `get_skill_reference`; do not fetch all attachments. |
| Save or revise a skill | `create_skill` / `update_skill`; version history via `list_skill_versions`. Check the target rather than creating duplicates. |
| Recall a fact | Known key: `read_memory`. Otherwise `search_memory` with focused filters and a small limit (e.g. 5–10). For a broader session brief use `get_memory_context` with bounded `max_items`. `read_memory` updates access statistics. |
| Remember something | `write_memory` for the chosen key. A proposal/pending-review result is not an applied write; report its status accurately. Do not persist unrelated conversation content automatically. |
| Work on a canvas | `list_canvas` locates run IDs and slugs; `get_canvas_toc` then `read_canvas(section_id=...)` avoids loading the whole document. Use `patch_canvas_section` for partial edits; `write_canvas` replaces full content. Lock/unlock only when coordinating concurrent editors. |
| Run a connected API/tool | `find_tools` → the matching federated tool, or `list_mcp_servers` → `call_connected_tool`. MCP and OpenAPI connections are both hosted capabilities; no local executable is required. |
| Call an API using a secret | If its name is known, call `use_secret` directly for GET/HEAD. Otherwise discover names via `list_secrets` (metadata only). `use_secret_write` handles POST/PUT/PATCH/DELETE only within the user's authorized external action. |
| Work with isolated artifacts | Reuse the relevant run from `list_runs`, or `create_run` when a new run is requested. There is no `get_run`; the list returns run records. |

Secret values stay server-side: never retrieve them into chat, tool arguments,
files, skill bodies, or logs. For adding/rotating a secret, direct the user to
the secure vault UI or their local stdin-based CLI workflow; don't request a
value in chat. A read permission or discovered tool is not permission to send
data to a new external destination, delete content, or replace whole documents.
Report permission and policy failures; do not bypass them by changing transport.

## Connection and account self-check

Check only when requested or after an AgentPlaybooks failure, not before every
task. `get_profile` identifies the account from the connection's validated
credentials and takes no arguments. After switching accounts, discard old IDs
and private cached content; verify the new profile before continuing.

On 401/403 stop retrying. Reconnect or choose another account in the host's
plugin/connection settings. OAuth consent offers **Use another account**.
Refresh the host's tool catalog or start a new conversation when required.
A missing tool in this chat alone does not establish a server failure.

In local Codex, use its supported MCP login/logout for the actual configured
server ID (bundled IDs can be namespaced). `apb login` changes CLI API-key
credentials, not the cloud plugin's OAuth connection. Never ask for tokens in
chat or modify host-owned credential stores. An uploaded skills-only ZIP has
no remote MCP connection; the full remote plugin or a custom MCP connection
must be connected for hosted operations. Without a connected surface, explain
what is missing rather than pretending to have read or changed hosted data.

## Local configuration and portability

For local doctor, sync, plugin import/export, backup, restore, or credential
adoption, read [references/local-cli.md](references/local-cli.md). It covers
platform mappings, CLI discovery, plan/apply semantics, conflict handling, and
secret-safe local workflows. Do not load it for ordinary hosted chat tasks.
In cloud/web chat, local files and the CLI may not exist; use an attached
execution environment only when the requested task actually needs them.
