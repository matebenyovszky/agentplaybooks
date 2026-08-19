# CLI & Plugin Launch Kit

Launch only after the CLI is published to npm (or drop the `npm install` line
and keep the repository instructions). Canonical URLs:

- Blog: `https://agentplaybooks.ai/blog/portable-playbooks-cli`
- Documentation: `https://agentplaybooks.ai/docs/cli`
- Repository: `https://github.com/matebenyovszky/agentplaybooks`

## Positioning

**One sentence:** AgentPlaybooks moves a whole agent harness — project
instructions, skills, tools, and the credential contract — between Claude Code,
Cursor, ChatGPT/Codex, Google Antigravity, and Hermes Agent, with no vendor
lock-in: plan first, apply on approval, no silent overwrites.

**Three proof points:**

1. Write an instruction file, a skill, or an MCP server once; `sync --apply`
   places it in every enabled target, translating MCP definitions between JSON
   and Codex TOML, and bridging `AGENTS.md` into `CLAUDE.md` by import rather
   than by copy.
2. `push`/`pull` move instructions, skills, MCP servers, and the manifest between
   a project and a hosted playbook, so a teammate on a different editor — or a
   fresh machine — gets the same setup with two commands.
3. Secret values never move: the playbook carries the references
   (`env:DEPLOY_API_KEY`), `doctor` flags literal credentials without printing
   them, and `push` refuses to upload them.

Do not claim: real-time sync, deletion mirroring (remote entries missing
locally are deliberately left alone), OpenAPI federation servers working
locally, secret *values* syncing, or support for platforms beyond the five
above.

## X (280 characters)

> Your agent skills live in 5 different folders. `.claude/skills`,
> `.cursor/skills`, `.codex/skills`, `.agents/skills`, `~/.hermes/skills`.
>
> Write once, run `apb sync --apply`, they're everywhere. Plans first, never
> overwrites, backs up.
>
> Open source: apbks.com/docs/cli

Measured at 263 characters with the link counted as X's fixed 23, so it fits
the 280 limit as written. If you edit it, recount — cutting the folder list to
three entries plus "…and more" buys the most room.

### Optional follow-up thread

1. The interesting part isn't the copying — it's the refusal. Same skill name,
   different content in two tools? That's drift, not a merge. The CLI reports
   it and skips, so you decide which one is canonical.
2. MCP servers translate between formats: JSON for Claude Code and Cursor,
   TOML for Codex. If a definition can't be represented losslessly, you get a
   conflict instead of a silently mangled config.
3. Tools round-trip to a hosted playbook too — but a push only updates the
   connection. Timeouts, auth, curated tool lists that only exist server-side
   survive. The poorer record never flattens the richer one.
4. Secrets: no value ever moves. The playbook carries
   `{"name": "DEPLOY_API_KEY", "ref": "env:DEPLOY_API_KEY"}`. Your teammate
   learns what to set; nobody mails a key. Literal credentials block the push.
5. It also audits: hard-coded credentials (line numbers only, never values),
   insecure http:// MCP URLs, Agent Skills spec violations, 0–100 health score.
   `--strict` fails CI.
6. And it ships as a Claude Code plugin, so the agent runs the workflow:
   `/plugin marketplace add matebenyovszky/agentplaybooks`

## LinkedIn (3,000 character limit)

> **Your agent configuration has a copy-paste problem.**
>
> Every AI coding tool invented its own folder. Claude Code reads
> `.claude/skills` and `.mcp.json`. Cursor wants `.cursor/mcp.json`. Codex uses
> `.codex/skills` and a TOML config. Google Antigravity reads `.agents/skills`.
> Hermes Agent keeps skills in the home directory.
>
> So teams do what teams do: copy the file, edit one of the copies, forget the
> other, and three weeks later two agents behave differently for reasons nobody
> can reconstruct.
>
> We shipped the AgentPlaybooks CLI to make that a solved problem:
>
> **`agentplaybooks doctor`** — a read-only audit of what you actually have:
> instruction files, Agent Skills, MCP servers, likely hard-coded credentials
> (line numbers only, never the values), insecure MCP URLs, and same-named
> definitions that have drifted apart. It ends with a 0–100 score, and
> `--strict` makes high findings fail CI.
>
> **`agentplaybooks sync`** — normalizes everything into one portable manifest,
> then writes what each enabled target is missing. Five platforms today: Claude
> Code and Claude Cowork, Cursor, ChatGPT/Codex, Google Antigravity, and Nous
> Hermes Agent. MCP definitions are translated between JSON and Codex's TOML
> automatically.
>
> **`push` / `pull`** — move skills, MCP servers, and the manifest between a
> project and a hosted playbook. Your teammate pulls it and syncs into whichever
> editor they prefer; on a fresh machine that's two commands. The playbook is the
> portable unit, not the tool.
>
> Four design decisions I'd defend in a review:
>
> 1. **Plan before apply.** Every mutating command prints what it would do and
>    changes nothing until you pass `--apply`. Agents shouldn't rewrite your
>    configuration as a side effect of being asked a question.
> 2. **Conflicts are not merges.** If the same skill has different content in
>    two tools, that's information — a signal that someone edited one copy. The
>    CLI reports it and skips it. No last-write-wins.
> 3. **The poorer record never flattens the richer one.** A hosted MCP server
>    can carry timeouts, auth, and a curated tool list that no local file can
>    express. A push updates the connection and leaves the rest intact.
> 4. **Secrets are references, never values.** The playbook says it needs
>    `env:DEPLOY_API_KEY`; the value stays in your environment or vault. Literal
>    credentials get flagged and block the push.
>
> One more thing: it ships as a Claude Code plugin, so you can just ask —
> "audit my agent config", "make my Claude skills available in ChatGPT" — and
> the agent runs the same safe workflow.
>
> Docs: https://agentplaybooks.ai/docs/cli
> Write-up: https://agentplaybooks.ai/blog/portable-playbooks-cli
>
> If you're running agents across more than one tool, I'd genuinely like to
> know which platform adapter you need next.

## Publishing the CLI to npm

The `agentplaybooks` npm organization exists, so the remaining steps need a
maintainer with npm credentials — do not paste tokens into a chat or a file.

First release, from a machine that is logged in (`npm login`):

```bash
cd packages/cli && npm publish --access public --tag alpha
```

Every release after that can go through CI: add a granular npm token scoped to
the `@agentplaybooks` org as the repository secret `NPM_TOKEN`, then push a tag
matching the package version (for example `cli-v0.2.0-alpha.1`), or run the
"Publish CLI" workflow manually with `dry_run` unchecked. The workflow
(`.github/workflows/publish-cli.yml`) runs the tests, verifies that the tag
matches `package.json`, derives the dist-tag from the version, and publishes
with provenance.

## Pre-publish checklist

- [ ] CLI published to npm (or the `npm install` line removed from all copy)
- [ ] Blog post reachable at the canonical URL in every locale (en/hu/de/es)
- [ ] `/docs/cli` reachable and linked from the docs index
- [ ] `doctor`, `sync`, `pull`, `push` smoke-tested from a clean clone
- [ ] Screenshot or 20–30s terminal recording of `sync` plan → apply

Platform limits referenced: X standard posts allow 280 characters; LinkedIn
posts allow up to 3,000 characters.
