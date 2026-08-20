# AgentPlaybooks CLI

Local-first CLI for auditing, synchronizing, and sharing portable agent
configuration. Zero runtime dependencies, Node.js >= 20.

```bash
node ./bin/agentplaybooks.js doctor ../my-project
node ./bin/agentplaybooks.js doctor ../my-project --json
node ./bin/agentplaybooks.js doctor ../my-project --strict

node ./bin/agentplaybooks.js sync ../my-project
node ./bin/agentplaybooks.js sync ../my-project --apply
node ./bin/agentplaybooks.js sync ../my-project --target=claude,codex --apply
```

`doctor` does not write files or use the network. It reports instruction
files, Agent Skills, MCP server definitions, likely hard-coded credentials,
insecure MCP URLs, cross-platform drift, and a 0-100 health score.

`sync` plans (and with `--apply`, writes) two things:

1. The canonical `agentplaybook.json` manifest.
2. The platform files missing from enabled deployment targets:

   | Target | Skills | MCP servers | Instructions |
   |---|---|---|---|
   | `claude` (Claude Code / Cowork) | `.claude/skills/<name>/SKILL.md` | `.mcp.json` | `CLAUDE.md` importing `AGENTS.md` |
   | `cursor` | `.cursor/skills/<name>/SKILL.md` | `.cursor/mcp.json` | — |
   | `codex` (ChatGPT / Codex CLI) | `.codex/skills/<name>/SKILL.md` | `.codex/config.toml` | reads `AGENTS.md` |
   | `antigravity` (Google Antigravity) | `.agents/skills/<name>/SKILL.md` | — (global config only) | — |
   | `grok` (Grok Bot, xAI) | `.agents/skills/<name>/SKILL.md` | — (account MCP Box; reported, see below) | reads `AGENTS.md` natively |
   | `hermes` (Hermes Agent, Nous Research) | `.agents/skills/<name>/SKILL.md`, registered in `~/.hermes/config.yaml` | `mcp_servers:` in `~/.hermes/config.yaml` | reads `AGENTS.md`; persona → `~/.hermes/SOUL.md` |

   Claude Code reads `CLAUDE.md` and not `AGENTS.md`, but it supports `@`
   imports, so the `claude` target writes a `CLAUDE.md` containing `@AGENTS.md`
   rather than a copy — one source of truth, nothing to drift. An existing
   `CLAUDE.md` without that import is reported, never rewritten.

   Targets come from `spec.targets` in the manifest. Without `--target`, detected
   platforms are enabled automatically. When `--target=<types>` is passed, that
   list is the write set for this run — not added on top of auto-detected
   targets — which is what a freshly pulled playbook needs to reach a tool it
   does not have yet. `sync --target=cursor,claude` still writes both. When no
   target is enabled, `sync` lists the agent tools it detects for the current
   user instead of quietly doing nothing.
   Antigravity reads project skills from the portable `.agents/skills/` store.
   Grok Bot reads that same store — `.agents/skills/` is one of the roots it
   discovers skills from, and its system prompt loads `AGENTS.md` — so the
   target writes the portable store and nothing else. Its MCP servers are the
   exception: Grok Bot keeps only an array of server *ids* in
   `~/.grokbot/settings.json` (`mcpBoxServers`), with the definitions in the
   account's MCP Box, so no project file can provision them. `sync` reports the
   servers it therefore could not deliver instead of dropping them silently —
   add the playbook's own MCP endpoint to the Box once and its tools reach
   every session.
   Hermes keeps one profile in `~/.hermes` (or `$HERMES_HOME`): sync registers
   that same portable store under `skills.external_dirs` in its `config.yaml`
   instead of copying skills into the profile, merges MCP servers into that
   `config.yaml`, and writes a pulled persona to `SOUL.md`. Hermes reads
   `AGENTS.md` natively, but only the first project context file it finds
   (`.hermes.md` → `AGENTS.md` → `CLAUDE.md` → `.cursorrules`), so a `.hermes.md`
   hiding `AGENTS.md` is reported.
   Same-named definitions with different content are reported as conflicts
   and skipped — never overwritten. Replaced files are backed up under
   `.agentplaybooks/backups/`.

## Remote sync

```bash
export AGENTPLAYBOOKS_API_KEY=<your-user-api-key>   # or paste on the login prompt
node ./bin/agentplaybooks.js login                  # verify + store the key
node ./bin/agentplaybooks.js playbooks              # list accessible playbooks

node ./bin/agentplaybooks.js pull <id|guid> --apply  # remote -> .agents/ store
node ./bin/agentplaybooks.js push --apply           # local -> remote playbook
```

- Keys are user API keys (`apb_...`) created in the dashboard, stored with
  `0600` permissions in `~/.agentplaybooks/credentials.json`.
- Instructions, skills, MCP server definitions, and the manifest travel in both
  directions.
- `push` uploads the project-root instruction file as the playbook's
  instructions. `AGENTS.md` wins if several exist; root files that disagree are
  a conflict, and nested instruction files stay local because they scope a
  subdirectory rather than the project.
- `pull` writes the playbook's instructions to `AGENTS.md`, remote skills to
  `.agents/skills/`, and remote MCP servers to `.agents/mcp.json`, then links
  the project via `.agentplaybooks/remote.json`;
  a subsequent `sync --apply` propagates both to the enabled platform targets.
  OpenAPI federation servers are hosted-only and are reported, not translated.
- `push` uploads skills, MCP servers, and the manifest to the linked playbook
  (or creates one). Local files are authoritative for the connection keys
  (`command`, `args`, `env`, `url`, `headers`); hosted-only federation settings
  (`timeout_ms`, `auth`, `access`), curated tool lists, and descriptions are
  preserved. Remote entries that no longer exist locally are left untouched.
- `pull` and `push` are plan-only unless `--apply` is supplied. Use
  `--url=<base>` or `AGENTPLAYBOOKS_URL` for self-hosted deployments.

## Secrets

**A plaintext secret value never touches the disk.** Not in the manifest, not in
a generated `.env`, not in `~/.agentplaybooks`. What the CLI stores is the
requirement; what it moves is a value in memory, on request.

```bash
node ./bin/agentplaybooks.js secrets login <guid>     # store a playbook-scoped key
node ./bin/agentplaybooks.js secrets status           # needs vs vault vs this shell
pass show deploy/api | node ./bin/agentplaybooks.js secrets push DEPLOY_API_KEY
node ./bin/agentplaybooks.js secrets run -- npm run deploy
```

- `secrets status` prints names and state only — which secrets the playbook
  needs, which exist in the vault, whether the owner marked each one revealable,
  and which are already set in your shell. It never prints a value.
- `secrets push` reads the value from **stdin** or `--from-env=<VAR>`, never from
  a command-line argument (argv lands in shell history and in the process list),
  shows you the name, target playbook and character count, and requires you to
  type `yes` before anything is sent. `--yes` skips the prompt for scripts. If
  the secret already exists it is rotated, leaving the owner's reveal flag, host
  allow-list, category and expiry untouched.
- `secrets run -- <command>` fetches the values the playbook declares into
  memory, injects them into that one child process, and exits. Nothing is
  written anywhere. Secrets the owner has not marked revealable stay in the
  vault and are reported as skipped rather than silently missing.
- These commands use a **playbook-scoped** API key (`secrets login <guid>`),
  not the account-wide key used by `push`/`pull`: the credential that can reach
  secrets is limited to one playbook. Set `AGENTPLAYBOOKS_PLAYBOOK_KEY` to avoid
  storing it at all.

For anything that talks to the hosted playbook as an MCP server, you do not need
any of this: the `use_secret` tool has the platform inject the credential
server-side, so the value never enters the agent's context either.

`sync` collects the environment references it finds in MCP configuration
(`${VAR}`, `$VAR`, `env:VAR`) into `spec.secrets`, so a playbook states what it
needs:

```json
{ "name": "DEPLOY_API_KEY", "ref": "env:DEPLOY_API_KEY", "required": true }
```

Entries you edit by hand — a vault reference, `required: false` — survive later
syncs. `doctor` flags literal credentials by line number without printing them,
and `push` refuses to run until they are replaced by references.

Line endings are normalized (CRLF is treated as LF) everywhere digests and
content comparisons happen, so a Windows checkout and a macOS checkout of the
same skill are recognized as identical instead of drifting.

## Claude Code / Claude Cowork plugin

This package doubles as a Claude Code plugin: it ships an `agentplaybooks`
skill plus `/agentplaybooks:doctor`, `:sync`, `:pull`, and `:push` commands
that drive this CLI. Install from the repository root marketplace:

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

The skill also works standalone: copy `skills/agentplaybooks/` into a
project's `.claude/skills/` (or let `sync` do it once it is part of a
playbook).
