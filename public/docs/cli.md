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
| `hermes` — Nous Hermes Agent | `~/.hermes/skills/<name>/SKILL.md` | — (global `config.yaml`) | reads `AGENTS.md` natively |

Detected platforms are enabled automatically; `antigravity` and `hermes` are
opt-in — add an entry to `spec.targets` in `agentplaybook.json`:

```json
{ "id": "codex", "type": "codex", "enabled": true, "config": {} }
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
- **Hermes Agent**: has no project-scoped store, so the adapter writes to
  `~/.hermes/skills/` (shown as a home-path in the plan); Hermes also reads
  `AGENTS.md` instructions natively.
- **Cursor**: skills in `.cursor/skills/`, MCP servers in `.cursor/mcp.json`.
