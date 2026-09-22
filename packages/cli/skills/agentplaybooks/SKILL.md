---
name: agentplaybooks
description: Audit, migrate, back up, and restore portable agent configuration (instructions, Agent Skills, custom agents, MCP references) with the AgentPlaybooks CLI. Use for drift checks, Agent Plugins import/export, cross-platform sync among Claude Code, Cursor, Codex, Copilot, Gemini, Antigravity, Grok Bot, and Hermes, or hosted playbook backup and recovery.
---

# AgentPlaybooks

AgentPlaybooks keeps an agent's operating configuration — instruction files
(`AGENTS.md`, `CLAUDE.md`), Agent Skills (`SKILL.md`), and MCP server
definitions — consistent across AI clients and shareable as a portable
"playbook" (`agentplaybook.json` manifest, optionally synced with a hosted
playbook on agentplaybooks.ai).

A hosted playbook keeps two different things apart: the **persona** is who the
agent is (identity, portable between projects), while **instructions** are the
always-on rules of one project (`AGENTS.md` / `CLAUDE.md` content). `pull` writes
instructions to `AGENTS.md` and the persona to `.agents/persona.md`; `push` sends
instructions to the live hosted field, while its private snapshot also preserves
an existing portable persona file. The hosted playbook owns the live persona. From the portable store,
`sync` hands the persona to targets that have a place for an identity: Hermes
reads it as `SOUL.md`.

## Locating the CLI

The CLI requires Node.js >= 20. Try in this order:

1. Installed as a Claude Code plugin: `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js"`
2. Inside the AgentPlaybooks repository: `node packages/cli/bin/agentplaybooks.js`
3. Installed globally: `agentplaybooks` (alias: `apb`)

Substitute your variant for `apb` in the commands below.

## Commands

| Command | What it does | Writes? |
|---|---|---|
| `apb doctor [path] [--json] [--strict]` | Health report: inventory, spec violations, likely hard-coded secrets, insecure MCP URLs, cross-platform drift, 0-100 score | Never |
| `apb sync [path]` | Plan the canonical `agentplaybook.json` plus platform files missing from enabled targets (claude, cursor, codex, copilot, gemini, antigravity, hermes, grok) | Plan only |
| `apb sync [path] --apply` | Write the manifest and missing platform files, with backups under `.agentplaybooks/backups/` | Yes |
| `apb sync [path] --target=<types>` | Write only those targets this run, e.g. `--target=claude,codex` | Plan only without `--apply` |
| `apb sync --global [--include-vendored]` | Same plan across the user's home stores instead of one project. Skills and custom agents, not credential-bearing MCP config | Plan only without `--apply` |
| `apb plugin export [path] [--output=<dir>]` | Package complete skill trees, MCP references, and custom-agent extensions as Agent Plugins 1.0 | Plan only without `--apply` |
| `apb plugin import <dir> [path]` | Import an Agent Plugins 1.0 package into the portable store | Plan only without `--apply` |
| `apb login [--url=<base>]` | Store a user API key (`apb_...`) for a remote; reads `AGENTPLAYBOOKS_API_KEY` first | `~/.agentplaybooks/credentials.json` |
| `apb playbooks [--json]` | List remote playbooks the key can access | Never |
| `apb connect --account [path] [--target=<types>]` | Connect an agent to the account-management MCP endpoint using `${AGENTPLAYBOOKS_API_KEY}` | Plan only without `--apply` |
| `apb connect <guid>[,<guid>...] [path]` | Connect one or more scoped playbook MCP endpoints in one config update | Plan only without `--apply` |
| `apb backups <guid>` | List private, immutable backup revisions by playbook GUID | Never |
| `apb pull <id\|guid> [path] [--snapshot=<id>] [--apply]` | Restore latest or selected portable snapshot; legacy playbooks fall back to skill/MCP records | With `--apply` |
| `apb push [path] [--apply]` | Upload live skills/MCP plus a complete private snapshot of instructions, skill trees, agents, MCP references, and manifest | With confirmation or `--apply` |
| `apb push --global [--apply]` | Back up this machine's skills and custom agents; global MCP configuration stays local | With confirmation or `--apply` |
| `apb secrets adopt [--global] [--apply] [--rewrite=<files>]` | Store a credential that is already hard-coded in an MCP config into the vault; rewrites the file to `${VAR}` only for files named in `--rewrite` | With `--apply` |

## Typical workflows

- **"Is my agent config healthy?"** → `apb doctor . --json`, then explain the
  findings by severity with their sources and line numbers.
- **"Make my Claude skills available in Cursor / ChatGPT (Codex) / Antigravity / Grok Bot / Hermes"**
  → run `apb sync --target=<type>`, show the user the plan, then re-run with
  `--apply`. Target file mapping: claude → `.claude/skills` + `.mcp.json`;
  cursor → `.cursor/skills` + `.cursor/mcp.json`; codex → `.codex/skills` +
  `.codex/config.toml`; antigravity → `.agents/skills` (portable store);
  grok → `.agents/skills` (portable store; Grok Bot also reads `AGENTS.md`
  natively, and its MCP servers come from the account MCP Box, not a file);
  hermes → `.agents/skills` registered under `skills.external_dirs` in
  `~/.hermes/config.yaml` (or `$HERMES_HOME`), MCP servers merged into the same
  file, persona written to `SOUL.md`.
- **"Share this project's setup with my team"** → `apb login`, then `apb push`
  (review the plan), then `apb push --apply`. Give the team the playbook GUID;
  they run `apb pull <guid> --apply` followed by
  `apb sync --target=<their tools> --apply`. Full skill trees, custom agents,
  instructions, and MCP references make the trip. Secret values do not.
- **"My skills are scattered across my tools, not in a project"** → this is the
  global case: `apb sync --global --target=<their tools>`, show the plan, then
  `--apply`. It moves **skills and custom agents only**, on purpose: a global MCP config holds
  credentials (an auth header, a token), and copying it into two more files
  would spread the secret rather than fix it. Report MCP drift from
  `apb doctor --global` instead. Skills a client ships with itself (Cursor's
  managed set, Hermes' bundle) are left out unless the user asks for
  `--include-vendored` — syncing `update-cursor-settings` into Claude Code helps
  nobody.
- **"Set this machine up from our team playbook"** → `apb pull <guid> --apply`,
  then `apb sync --apply`. If the project has no target yet, sync lists the
  agent tools it detected for this user; pass them via `--target`.
- **"Recover an older setup or deleted playbook"** → `apb backups <guid>` to
  find revision IDs, then `apb pull <guid> <new-directory> --snapshot=<id>`
  to review the plan and re-run with `--apply`. Owner-only backups survive
  deletion of the playbook record. Existing differing files are conflicts.
- **"Connect my whole AgentPlaybooks account"** → run
  `apb connect --account --target=<type>`, show the plan, then run it with
  `--apply`. The generated config contains `${AGENTPLAYBOOKS_API_KEY}`, never
  the key. Set that variable before starting or restarting the agent.
- **"Work with my hosted playbooks"** → use the bundled
  `agentplaybooks-account` MCP connection. Start with `list_playbooks`, then
  pass the selected `playbook_id` to playbook-scoped tools. The connection
  covers versioned skills, memory and task graphs, workflow runs, collaborative
  canvas documents, MCP/OpenAPI tools, and encrypted secrets; do not imply it
  is only a sync or listing API.
- **"Call an API without revealing its key"** → use `list_secrets` to discover
  names, then `use_secret` for GET/HEAD. Use `use_secret_write` for
  POST/PUT/PATCH/DELETE only after the user approves the external mutation.
  Both inject the credential server-side and must never reveal or request its
  value. The account MCP form also needs the target `playbook_id`.
- **"Connect these playbooks only"** → pass a comma-separated GUID list to
  `apb connect`. The CLI creates a separate, stable MCP entry for each and
  merges them into the target configuration atomically.
- **"Which credentials does this playbook need?"** → run
  `apb secrets status --json` (or read `spec.secrets` in `agentplaybook.json` if
  the project has no playbook key). It reports names and state only. Tell the
  user which variables to set; never try to fetch, print, or guess a value.
- **"Share our project rules with the team"** → the project-root instruction
  file travels with `push`. If `AGENTS.md` and `CLAUDE.md` disagree, `push`
  reports a conflict: ask which one is canonical, make the other a
  `@AGENTS.md` import, then re-run.
- **CI guard** → `apb doctor --strict --json` exits with code 2 on high or
  critical findings.

## Rules

- `doctor` is read-only and local-only; run it freely.
- `sync` and `pull` are plan-only by default; `push` asks before uploading in
  an interactive terminal. Show or summarize the plan before `--apply`.
- Conflicting definitions are reported and never overwritten. `push --apply`
  refuses an incomplete backup; resolve drift before retrying. `pull` skips
  differing local files and reports each conflict.
- Never echo API keys. Prefer `AGENTPLAYBOOKS_API_KEY=<your-key>` in the
  environment over pasting keys into the terminal. `push` refuses to upload
  content that looks like it contains hard-coded credentials — fix the finding
  instead of working around it.
- If the bundled Codex MCP connection reports an authentication error, run
  `codex mcp login agentplaybooks-account` to start the browser OAuth flow.
  `apb login` alone does not configure the bundled MCP connection. For
  headless/CI use only, put `bearer_token_env_var =
  "AGENTPLAYBOOKS_API_KEY"` under `[mcp_servers.agentplaybooks-account]` in
  Codex configuration and fully restart it. Never ask the user to paste the key
  into chat.
- `apb secrets status` is safe to run. **Do not run `apb secrets push` for the
  user**: storing a credential is theirs to confirm, and the command needs a
  value on stdin that you must never hold or generate. Tell them the exact
  command instead, e.g.
  `pass show deploy/api | apb secrets push DEPLOY_API_KEY`.
- `apb secrets run -- <command>` injects values into one child process and
  writes nothing to disk. Prefer it over asking the user to export variables,
  and never suggest writing secrets into `.env`, `.mcp.json`, or a skill.
- **`apb secrets adopt` is the way out of a credential that is already on disk.**
  Planning is read-only and needs no vault key, so run it freely and report what
  it found: names, files, key paths, lengths — it never prints a value. With
  `--apply` the value goes to the vault and *no file changes*. Only a file the
  user explicitly names in `--rewrite=<file>` gets its literal replaced with a
  `${VAR}` reference — never offer to rewrite everything, and never rewrite a
  client whose expansion support the plan reports as `unsupported`. After an
  adopt, always say that the credential must be rotated: it was in plain text on
  disk, so it may also be in git history, shell history, and editor backups.
  Note that no backup of the original is written, deliberately — a backup would
  be a second plaintext copy.
- Secret values never belong in `agentplaybook.json` or in pushed content;
  only environment/vault references are allowed. `spec.secrets` records which
  variables the configuration references, never their values.
- The private snapshot keeps full skill resources (including binary assets),
  custom agents, instructions, and MCP references; it excludes `.local`
  overrides, settings, hooks, worktrees, and arbitrary application data.
  It does not guarantee identical behavior for client-specific features.
- `push` treats local files as authoritative for an MCP server's connection
  (command, args, env, url, headers) and preserves hosted-only settings
  (timeouts, auth, access, curated tool lists, descriptions). Remote entries
  missing locally are never deleted; say so rather than implying a full mirror.
- OpenAPI federation servers exist only on the hosted side. `pull` reports
  them; do not hand-write a local equivalent.
- Claude Code reads `CLAUDE.md`, not `AGENTS.md`. The `claude` target therefore
  writes a `CLAUDE.md` that imports `AGENTS.md` instead of duplicating the text.
  Never resolve an instruction conflict by copying content between the two —
  make one import the other.
- Hermes Agent loads only the **first** project context file it finds
  (`.hermes.md` → `AGENTS.md` → `CLAUDE.md` → `.cursorrules`). If sync reports a
  `.hermes.md` hiding `AGENTS.md`, say so plainly: the fix is to keep one file, or
  to make `.hermes.md` point at `AGENTS.md`. Never silently duplicate the text.
- A public playbook's skills are also installable straight from the web, with no
  CLI involved:
  `hermes skills install well-known:https://agentplaybooks.ai/playbooks/<guid>/.well-known/skills/<name>`.
  Private and unlisted playbooks are not published there; use `pull` for those.
