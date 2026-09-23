# AgentPlaybooks CLI

Local-first CLI for auditing, synchronizing, and sharing portable agent
configuration. The published/plugin CLI is self-contained, Node.js >= 20.

```bash
node ./bin/agentplaybooks.js doctor ../my-project
node ./bin/agentplaybooks.js doctor ../my-project --json
node ./bin/agentplaybooks.js doctor ../my-project --strict

node ./bin/agentplaybooks.js sync ../my-project
node ./bin/agentplaybooks.js sync ../my-project --apply
node ./bin/agentplaybooks.js sync ../my-project --target=claude,codex --apply

node ./bin/agentplaybooks.js plugin export ../my-project --output=../my-plugin --apply
node ./bin/agentplaybooks.js plugin import ../my-plugin ../my-project --apply
```

`doctor` does not write files or use the network. It reports instruction
files, Agent Skills, custom agents, MCP server definitions, likely hard-coded credentials,
insecure MCP URLs, cross-platform drift, and a 0-100 health score.

`sync` plans (and with `--apply`, writes) two things:

1. The canonical `agentplaybook.json` manifest.
2. The platform files missing from enabled deployment targets:

   | Target | Skills | Custom agents | MCP servers | Instructions |
   |---|---|---|---|---|
   | `claude` (Claude Code / Cowork) | `.claude/skills/<name>/SKILL.md` | `.claude/agents/<name>.md` | `.mcp.json` | `CLAUDE.md` importing `AGENTS.md` |
   | `cursor` | `.cursor/skills/<name>/SKILL.md` | `.cursor/agents/<name>.md` | `.cursor/mcp.json` | — |
   | `codex` (ChatGPT / Codex CLI) | `.codex/skills/<name>/SKILL.md` | `.codex/agents/<name>.toml` | `.codex/config.toml` | reads `AGENTS.md` |
   | `copilot` (GitHub Copilot) | `.github/skills/<name>/SKILL.md` | `.github/agents/<name>.agent.md` | `.mcp.json` | — |
   | `gemini` (Gemini CLI) | `.gemini/skills/<name>/SKILL.md` | `.gemini/agents/<name>.md` | only `mcpServers` in `.gemini/settings.json` | reads `GEMINI.md` |
   | `antigravity` (Google Antigravity) | `.agents/skills/<name>/SKILL.md` | — | — (global config only) | — |
   | `grok` (Grok Bot, xAI) | `.agents/skills/<name>/SKILL.md` | — | — (account MCP Box; reported, see below) | reads `AGENTS.md` natively |
   | `hermes` (Hermes Agent, Nous Research) | `.agents/skills/<name>/SKILL.md`, registered in `~/.hermes/config.yaml` | — | `mcp_servers:` in `~/.hermes/config.yaml` | reads `AGENTS.md`; persona → `~/.hermes/SOUL.md` |

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
   Global sync moves skills and custom agents between the user's client homes;
   global MCP files are intentionally left alone because they may carry auth
   headers.
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

## Agent Plugins 1.0

The npm package itself ships a portable root `plugin.json`, `mcp.json`, its
AgentPlaybooks skill, and the same logo as the website. In the web dashboard,
**Export as Agent Plugin** creates an installable snapshot of one playbook.
Clients that support the MCP Skills extension can connect directly to that
playbook's MCP endpoint for live skill discovery; a static package alone does
not keep already installed skills synchronized. For the release/store checklist,
see [release distribution](https://agentplaybooks.ai/docs/release-distribution).

`plugin export` creates a standards-compliant package with root `plugin.json`,
`skills/`, and `mcp.json`. Complete skill directories are copied, including
their scripts, references, and assets. Portable agents are kept under
`ai.agentplaybooks/agents/` and also emitted as Copilot's standardized client
extension under `com.github.copilot/agents/`.

The portable custom-agent source is `.agents/agents/<name>.md`: common
`name`, `description`, `tools`, `model`, and Markdown prompt fields, plus
optional `extensions.<target>` frontmatter for native-only fields. Sync renders
Claude/Cursor/Copilot/Gemini Markdown and Codex TOML without treating the
vendor-specific overrides as cross-platform drift.

Agent Plugins 1.0 intentionally has no portable secrets mechanism. The only
manifest extension AgentPlaybooks adds is
`extensions["ai.agentplaybooks"].secrets`: names, refs, and field-binding
templates such as `Bearer ${TOKEN}`. Values never enter the package. Standard
clients safely ignore this namespace; `plugin import` uses it to reconstruct
the references in `.agents/mcp.json`, imports skills and agents into the
portable `.agents/` store, and refreshes `agentplaybook.json`. Both directions
are plan-only unless `--apply` is supplied, and differing existing files are
reported instead of overwritten.

## Remote sync

```bash
export AGENTPLAYBOOKS_API_KEY=<your-user-api-key>   # or paste on the login prompt
node ./bin/agentplaybooks.js login                  # verify + store the key
node ./bin/agentplaybooks.js playbooks              # list accessible playbooks

node ./bin/agentplaybooks.js pull <id|guid> --apply  # remote -> .agents/ store
node ./bin/agentplaybooks.js push --apply           # local -> remote playbook
node ./bin/agentplaybooks.js backups <guid>          # private backup revisions
node ./bin/agentplaybooks.js pull <guid> --snapshot=<id> --apply
```

- Keys are user API keys (`apb_...`) created in the dashboard, stored with
  `0600` permissions in `~/.agentplaybooks/credentials.json`.
- A private, immutable portable snapshot accompanies each changed push. It
  carries instructions, complete skill trees (including assets), custom agents,
  MCP references, and the manifest; vault values are never fetched into it.
  Review arbitrary skill assets for embedded credentials. The owner can
  recover a snapshot by GUID even after the playbook is deleted. `pull` restores
  the latest snapshot or the requested `--snapshot` revision. Legacy playbooks
  without a snapshot still use the skill/MCP record path.
- `push` uploads the project-root instruction file as the playbook's
  instructions. `AGENTS.md` wins if several exist; root files that disagree are
  a conflict, and nested instruction files stay local because they scope a
  subdirectory rather than the project.
- `pull` writes portable snapshot files to `AGENTS.md`, `.agents/`, and
  `agentplaybook.json`, then links the project via `.agentplaybooks/remote.json`;
  a subsequent `sync --apply` propagates both to the enabled platform targets.
  OpenAPI federation servers are hosted-only and are reported, not translated.
- `push` uploads skills, MCP servers, and the manifest to the linked playbook
  (or creates one). Local files are authoritative for the connection keys
  (`command`, `args`, `env`, `url`, `headers`); hosted-only federation settings
  (`timeout_ms`, `auth`, `access`), curated tool lists, and descriptions are
  preserved. Remote entries that no longer exist locally are left untouched.
- `pull` and `push` are plan-only unless `--apply` is supplied. Use
  `--url=<base>` or `AGENTPLAYBOOKS_URL` for self-hosted deployments.

## Connect account or playbooks as MCP

```bash
# Every playbook the user key can access
export AGENTPLAYBOOKS_API_KEY=<your-user-api-key>
apb connect --account --target=hermes
apb connect --account --target=hermes --apply

# One or more selected playbooks
apb connect 011d8a7fa0ec4016,111d8a7fa0ec4016 --target=claude
apb connect 011d8a7fa0ec4016,111d8a7fa0ec4016 --target=claude --apply
```

`--account` points to `/api/mcp/manage` and uses
`${AGENTPLAYBOOKS_API_KEY}`. Selected GUIDs become separate MCP entries and may
use a user API key or a playbook-scoped key through `--key-env`. Configuration
is always planned first and merged in one update. Only an environment-variable
reference is written; the credential value is never stored in the agent config.

The account MCP connection is the hosted control plane, not only a playbook
list. It exposes playbook and persona management plus playbook-scoped tools for
versioned skills, memory and task graphs, workflow runs, collaborative canvas
documents, connected MCP/OpenAPI tools, and encrypted secrets. Those scoped
tools take a `playbook_id`, so one account connection can operate on every
playbook the key can access.

`use_secret` (GET/HEAD) and `use_secret_write` (POST/PUT/PATCH/DELETE) are the
zero-exposure API proxy: AgentPlaybooks injects the selected vault secret on the
server and returns the upstream response without putting the credential in the
model context. The separate REST proxy also supports streaming responses; the
plugin-facing MCP tools return a normal MCP result.

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

## Which playbook, and OAuth providers

The working directory decides which playbook a command works on:
`pull --apply` and `push` write `.agentplaybooks/remote.json`, and everything
that talks to a playbook reads the guid from there. `--playbook=<guid>`
overrides it. The credential is separate — `AGENTPLAYBOOKS_PLAYBOOK_KEY`, or the
playbook-scoped key `secrets login` stored for that server and guid.

```bash
apb secrets push GOOGLE_CLIENT_SECRET
apb auth gmail
```

`auth` obtains the first refresh token for a connection that needs consent. It
runs authorization code + PKCE against a loopback redirect and hands the code to
the server, which completes the exchange and stores the refresh token. The
`client_id` comes from the MCP server's `transport_config.auth.client_id` — it is
public, not a vault secret — and `--client-id=…` overrides it.

## ChatGPT / Codex plugin

The Codex plugin bundles the AgentPlaybooks skill and the account MCP
connection. Install it from this repository's marketplace:

```powershell
codex plugin marketplace add matebenyovszky/agentplaybooks
codex plugin add agentplaybooks@agentplaybooks
```

The bundled remote MCP uses OAuth 2.1 with PKCE. Codex/ChatGPT opens
AgentPlaybooks in the browser, asks you to sign in, shows the requested access,
and stores its own refreshable connection. No API key needs to be copied into
the plugin. In a terminal, start or repair that flow with:

```powershell
codex mcp login agentplaybooks-account
```

API keys remain available for CI, headless systems, and clients without OAuth.
Create a **User API Key** at
<https://agentplaybooks.ai/dashboard/settings>, then put only the environment
variable name in Codex configuration — never the key itself:

```toml
# %USERPROFILE%\.codex\config.toml on Windows
# ~/.codex/config.toml on macOS/Linux
[mcp_servers.agentplaybooks-account]
url = "https://agentplaybooks.ai/api/mcp/manage"
bearer_token_env_var = "AGENTPLAYBOOKS_API_KEY"
```

Set the referenced environment variable. On Windows, this prompt hides the key
and avoids putting it in shell history:

```powershell
$secureKey = Read-Host -Prompt "Paste the AgentPlaybooks user API key" -AsSecureString
$keyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPtr)
  [Environment]::SetEnvironmentVariable("AGENTPLAYBOOKS_API_KEY", $plainKey, "User")
} finally {
  if ($keyPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPtr) }
  Remove-Variable plainKey, secureKey, keyPtr -ErrorAction SilentlyContinue
}
```

Fully quit and reopen ChatGPT/Codex after changing the environment variable,
then start a **new** chat. Existing processes and chats do not inherit it.

For a terminal-only session on macOS or Linux, keep the key out of history and
launch Codex from the same shell:

```bash
read -rsp "AgentPlaybooks user API key: " AGENTPLAYBOOKS_API_KEY; echo
export AGENTPLAYBOOKS_API_KEY
codex
```

`apb login` is intentionally separate: it stores an API key for CLI
`pull`/`push`; it neither creates nor replaces the Codex OAuth connection.

## Claude Code / Claude Cowork plugin

This package doubles as a Claude Code plugin: it ships an `agentplaybooks`
skill plus `/agentplaybooks:doctor`, `:sync`, `:login`, `:connect`, `:pull`, and `:push` commands
that drive this CLI. Install from the repository root marketplace:

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

The bundled account MCP also uses interactive OAuth discovery. Open `/mcp` if
Claude does not immediately offer to authenticate the new connection. A manual
API-key header remains a fallback for non-interactive environments.

The skill also works standalone: copy `skills/agentplaybooks/` into a
project's `.claude/skills/` (or let `sync` do it once it is part of a
playbook).

## Native Hermes memory

Install and configure AgentPlaybooks as Hermes's native memory provider. These
commands require a CLI release containing the provider; for a source build or
direct Hermes installation, follow the [setup guide](https://agentplaybooks.ai/docs/hermes-memory).

```bash
apb memory setup <private-playbook-guid> --target=hermes
apb memory setup <private-playbook-guid> --target=hermes --apply
hermes memory setup
hermes memory status
```

The setup command honors `HERMES_HOME` or `--hermes-home=<directory>`, preserves
existing configuration, and reports conflicting providers or plugin files. It
never copies API keys. Hermes's wizard accepts a playbook-scoped key through
`AGENTPLAYBOOKS_MEMORY_API_KEY`. Shared read-only sources use `--shared=<guids>`.

The provider uses existing literal memory search, mirrors explicit memory writes,
and supports read/write/archive/delete/history tools. See the
[provider guide](../hermes-memory/agentplaybooks/README.md) for scope and installation
details. It does not upload full conversations or add semantic search, caching or retries.

## Licence

MIT, as of `0.2.0-beta.0`. The `LICENSE` file next to this README is the
authoritative text and ships inside the published tarball.

Two earlier tarballs are wrong about this. `0.2.0-alpha.1` and `0.2.0-alpha.2`
were published declaring `PolyForm-Noncommercial-1.0.0`, which is not and never
was the licence of this project. A published npm version is immutable, so the
metadata on those two cannot be corrected in place; they should be deprecated
with a pointer to a current release:

```bash
npm deprecate @agentplaybooks/cli@0.2.0-alpha.1 "Mislabelled licence. This package is MIT; install 0.2.0-beta.0 or later."
npm deprecate @agentplaybooks/cli@0.2.0-alpha.2 "Mislabelled licence. This package is MIT; install 0.2.0-beta.0 or later."
```

`tests/package-metadata.test.ts` in the repository root now fails the build if
the licence or the version drifts between `package.json`, the plugin manifest
and the marketplace listing, so this cannot recur unnoticed.

## One playbook, one Hermes bot

`export hermes` writes the playbook this project is linked to as a Hermes Agent
profile distribution — the directory `hermes profile install` reads:

```bash
apb pull <playbook-guid> --apply
apb export hermes ./bots/research --apply
hermes profile install ./bots/research --name research
apb sync --target=hermes --profile=research --apply
```

The distribution holds `distribution.yaml`, `SOUL.md` and `skills/<name>/` with
each skill's bundled files. It ships no `config.yaml`: `profile install`
replaces that file rather than merging it, so one would overwrite the machine's
providers and pin the bot's model. The fourth command covers that instead —
unlike `profile create`, `profile install` copies no configuration at all, so a
new bot has no model until `sync --profile=<bot>` seeds one from the
installation's own and merges the playbook's MCP servers in.

Later changes: re-run `pull` and `export hermes`, then `hermes profile update
research`. Distribution files are replaced; sessions, memories and
configuration are not.
