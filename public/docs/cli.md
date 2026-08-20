# CLI & Editor Plugins

The AgentPlaybooks CLI (`@agentplaybooks/cli`, binary `agentplaybooks` or
`apb`) keeps your agent configuration — instruction files, Agent Skills, and
MCP server definitions — healthy, consistent across AI coding tools, and
shareable as a hosted playbook. It is a zero-dependency Node.js (>= 20)
package that lives in [`packages/cli`](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/cli).

## Doctor: audit your agent configuration

```bash
apb doctor .            # human-readable health report
apb doctor . --json     # stable machine-readable output
apb doctor . --strict   # exit code 2 on high/critical findings (CI)
```

Doctor is read-only and local-only. It discovers `AGENTS.md`, `CLAUDE.md`,
`.cursorrules`, `SKILL.md` files, and MCP configs across platform folders and
reports:

- Agent Skills specification violations (missing name/description, bad names)
- Likely hard-coded credentials (values are never printed, only line numbers)
- Insecure `http://` MCP URLs outside localhost
- Same-named skills or MCP servers whose definitions drift between platforms
- A deterministic 0–100 health score

## Sync: one playbook, every agent

```bash
apb sync .                       # plan only — shows what would be written
apb sync . --apply               # write the manifest and missing platform files
apb sync . --target=codex        # also enable a target the project lacks
```

Sync normalizes what it finds into the canonical `agentplaybook.json`
manifest, then generates the files missing from each enabled deployment
target:

| Target | Skills | MCP servers | Instructions |
|---|---|---|---|
| `claude` — Claude Code / Claude Cowork | `.claude/skills/<name>/SKILL.md` | `.mcp.json` | `CLAUDE.md` importing `AGENTS.md` |
| `cursor` — Cursor | `.cursor/skills/<name>/SKILL.md` | `.cursor/mcp.json` | — |
| `codex` — ChatGPT / OpenAI Codex | `.codex/skills/<name>/SKILL.md` | `.codex/config.toml` | reads `AGENTS.md` natively |
| `antigravity` — Google Antigravity | `.agents/skills/<name>/SKILL.md` | — (global config) | — |
| `grok` — Grok Bot (xAI) | `.agents/skills/<name>/SKILL.md` | — (account MCP Box; reported) | reads `AGENTS.md` natively |
| `hermes` — Hermes Agent (Nous Research) | `.agents/skills/<name>/SKILL.md`, registered in `~/.hermes/config.yaml` | `mcp_servers:` in `~/.hermes/config.yaml` | reads `AGENTS.md` natively; persona → `~/.hermes/SOUL.md` |

Detected platforms are enabled automatically; `antigravity` and `hermes` are
opt-in — add an entry to `spec.targets` in `agentplaybook.json`:

```json
{ "id": "codex", "type": "codex", "enabled": true, "config": {} }
```

### Syncing across tools instead of inside a project

Most people's skills do not live in a project at all — they sit in
`~/.cursor/skills`, `~/.claude/skills`, or a Hermes profile. `--global` plans the
same fan-out across those home stores:

```bash
apb sync --global --target=claude,cursor,hermes        # plan
apb sync --global --target=claude,cursor,hermes --apply
```

The portable store for the global scope is `~/.agents/skills`, and the manifest
lives in `~/.agentplaybooks/agentplaybook.json` rather than in your home
directory. Two deliberate limits:

- **Skills only.** A global MCP config holds credentials — an auth header, a
  token — and copying it into two more files on disk would spread the secret
  instead of fixing it. Run `apb doctor --global` to see MCP drift between your
  clients and decide what to do about it.
- **Skills a client ships with itself are left out**: Cursor's managed set and
  Hermes' bundled skills are the vendor's files, not your configuration. Pass
  `--include-vendored` if you really want them (`apb doctor --global
  --include-vendored` shows them too).

### Publishing this machine as a playbook

```bash
apb login                    # once, per remote
apb push --global            # plan
apb push --global --apply    # create or update the workstation playbook
```

This uploads the machine's own skills, links `~/.agentplaybooks/remote.json` to
that playbook, and leaves MCP configuration entirely local — a home-scoped MCP
config is where auth headers live, and a playbook is something you share.

### Adopting a credential that is already hard-coded

```bash
apb secrets adopt --global                                  # plan: read-only, no vault key needed
apb secrets adopt --global --apply                          # store in the vault, change no file
apb secrets adopt --global --apply --rewrite=.cursor/mcp.json  # also replace the literal with ${VAR}
```

The plan names every credential it found, the file and key path it sits in, its
length, and whether that client is documented to expand `${VAR}` — never the
value itself. `--apply` on its own only fills the vault: nothing on disk changes,
so a configuration that works today keeps working. A literal is replaced only in
a file you name explicitly.

No backup of the original is written, on purpose: it would be a second plaintext
copy of the credential. And once a value has been on disk it should be rotated —
it may also be in git history, shell history, and editor backups. Afterwards the
value can reach a client without ever being written down again:

```bash
apb secrets run -- claude        # or: hermes chat, codex, ...
```

Safety rules:

- Plan-only unless `--apply` is passed explicitly.
- Same-named definitions with different content are **conflicts**: reported
  and skipped, never overwritten. Resolve the drift, then re-run.
- Modified files are backed up under `.agentplaybooks/backups/` first.
- Secret values never enter the manifest — only environment references.
- Line endings are normalized (CRLF is treated as LF), so the same skill has
  the same digest on Windows, macOS, and Linux. A mixed-platform team never
  sees phantom drift from a checkout difference.

## Remote sync: share playbooks with your team

```bash
export AGENTPLAYBOOKS_API_KEY=<your-user-api-key>
apb login               # verify and store the key (~/.agentplaybooks, 0600)
apb playbooks           # list playbooks your key can access

apb pull <guid> --apply # download skills into .agents/skills/
apb push --apply        # upload local skills + manifest
```

Instructions, skills, MCP servers, and the manifest all travel in both
directions:

- **Local → hosted** (`push`): the project's instruction file, the skills and
  MCP server definitions discovered in any platform folder, plus the canonical
  manifest, are uploaded to the linked (or a new) playbook. `AGENTS.md` wins when
  several root instruction files exist; if they disagree with each other that is
  a conflict, and nested instruction files stay local because they scope a
  subdirectory rather than the project. Local files are authoritative for the connection itself
  (command, args, env, url, headers); federation settings that only exist on
  the hosted side — timeouts, auth, access, curated tool lists, descriptions —
  are preserved, not overwritten. Remote entries that no longer exist locally
  are left untouched.
- **Hosted → local** (`pull` + `sync --apply`): the playbook's instructions land
  in `AGENTS.md`, remote skills in `.agents/skills/`, and remote MCP servers in
  `.agents/mcp.json`, and the project is linked via
  `.agentplaybooks/remote.json`. The follow-up sync fans them out to every
  enabled platform target, whichever editor your teammate uses.

Claude Code reads `CLAUDE.md` and does not read `AGENTS.md`, but it does support
`@` imports. So the `claude` target does not copy your instructions — it writes a
`CLAUDE.md` containing `@AGENTS.md`. One source of truth, nothing to drift. If you
already have a `CLAUDE.md` without that import, `sync` says so instead of
rewriting your file.

On a fresh machine the portable store is the only thing on disk, and it is not
a deployment target — so nothing would be written. Enable the tools you have:

```bash
apb pull <guid> --apply
apb sync --target=claude,codex --apply
```

`sync` also lists the agent tools it detects for your user when no target is
enabled, so you know what to pass.

OpenAPI federation servers are a hosted-only capability with no local client
equivalent; `pull` reports them instead of writing a half-translated config.
Secret values never move in either direction — see below. Use `--url=<base>`
or `AGENTPLAYBOOKS_URL` for self-hosted deployments.

## Secrets: no plaintext value ever touches the disk

```bash
apb secrets login <guid>     # a playbook-scoped key, stored 0600
apb secrets status           # what's needed vs in the vault vs in this shell
pass show deploy/api | apb secrets push DEPLOY_API_KEY
apb secrets run -- npm run deploy
```

- **`status`** prints names and state only: needed by the playbook, present in
  the vault, marked revealable by the owner, already set in your shell. Never a
  value.
- **`push`** takes the value from stdin or `--from-env=<VAR>` — never from a
  command-line argument, because argv lands in shell history and in the process
  list. It shows the name, the target playbook and the character count, then
  requires you to type `yes`. An existing secret is rotated in place, leaving the
  owner's reveal flag, host allow-list, category and expiry untouched.
- **`run`** fetches the declared secrets into memory, injects them into one child
  process, and exits. Nothing is written anywhere. Secrets the owner has not
  marked revealable stay in the vault and are reported as skipped.
- These commands use a **playbook-scoped** API key rather than your account-wide
  key, so the credential that can reach secrets is limited to one playbook. Use
  `AGENTPLAYBOOKS_PLAYBOOK_KEY` to avoid storing it at all.

If your agent talks to the hosted playbook as an MCP server, you need none of
this: the `use_secret` tool makes the platform inject the credential server-side,
so the value never enters the agent's context either.

## The playbook carries the contract, not the credential

A playbook states which credentials it needs; the values stay where they
belong. `sync` collects every environment reference it finds in your MCP
configuration (`${VAR}`, `$VAR`, `env:VAR`) into `spec.secrets`:

```json
"secrets": [
  { "name": "DEPLOY_API_KEY", "ref": "env:DEPLOY_API_KEY", "required": true }
]
```

That makes the playbook portable and self-describing: a teammate who pulls it
knows exactly which variables to set, without anyone ever transmitting a key.
If you edit an entry — pointing it at a vault, or marking it optional — your
version is preserved on the next sync. Literal credential values are never
written into the manifest and never uploaded; `doctor` flags them and `push`
refuses to run until they are replaced with references.

## Claude Code & Claude Cowork plugin

The CLI package doubles as a Claude Code plugin with an `agentplaybooks`
skill and `/agentplaybooks:doctor`, `:sync`, `:pull`, `:push` commands:

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

After installing, ask Claude things like *"audit my agent config"* or *"make
my Claude skills available in Cursor and ChatGPT"* — the skill knows the safe
workflow (plan first, apply after your approval).

## Other platforms

- **ChatGPT / Codex**: skills land in `.codex/skills/`, MCP servers in
  `.codex/config.toml` — picked up by the Codex CLI and ChatGPT's coding
  agent automatically.
- **Google Antigravity**: reads project skills from `.agents/skills/`, which
  is exactly AgentPlaybooks' portable store — a pulled playbook is
  Antigravity-ready with no extra step.
- **Grok Bot (xAI)**: discovers skills from a fixed set of roots that already
  includes the portable `.agents/skills/` store (alongside `.claude/skills/`,
  `.codex/skills/` and `.cursor/skills/`), and its system prompt loads
  `AGENTS.md` directly — so a synced project is Grok-ready with no bridge file.
  Its **MCP servers are the exception**: Grok Bot stores only an array of server
  *ids* in `~/.grokbot/settings.json` (`mcpBoxServers`), with the definitions
  living in your account's MCP Box, so no project file can provision them.
  `sync` reports the servers it could not deliver rather than dropping them
  silently. The way around it is one entry, once: add the playbook's own MCP
  endpoint (`POST /api/mcp/<guid>`) to the Box, and its skills, memory, canvas
  and `use_secret` reach every Grok Bot session without any further per-server
  setup.
- **Hermes Agent**: everything for one profile lives in `~/.hermes` (or
  `$HERMES_HOME`). Rather than copying skills into that profile, sync registers
  the portable store under `skills.external_dirs` in `~/.hermes/config.yaml`, so
  Hermes reads them where they are — nothing is duplicated, and the next `pull`
  is live without another sync. Hermes' own skills in `~/.hermes/skills/` keep
  precedence on a name collision. MCP servers are merged into the same
  `config.yaml` (comments and unrelated settings preserved), and a pulled
  persona becomes `~/.hermes/SOUL.md` — never overwriting an existing one, since
  Hermes seeds a default there on first run. Instructions are read from
  `AGENTS.md` natively, but Hermes loads only the *first* project context file it
  finds (`.hermes.md` → `AGENTS.md` → `CLAUDE.md` → `.cursorrules`), so a
  `.hermes.md` that hides `AGENTS.md` is reported as a conflict.
  Public playbook skills can also be installed straight from the web:
  `hermes skills install well-known:https://agentplaybooks.ai/playbooks/<guid>/.well-known/skills/<name>`.
- **Cursor**: skills in `.cursor/skills/`, MCP servers in `.cursor/mcp.json`.
