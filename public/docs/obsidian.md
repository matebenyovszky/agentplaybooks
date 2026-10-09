# Obsidian and AgentPlaybooks

**Short answer: keep Obsidian.** It is the best place to write and think, and
nothing here asks you to move your notes. But a vault is a library, not a
runtime — and if you have been trying to make one behave like your agent's
brain, this page explains exactly where the seam is and how to wire the two
together.

Obsidian is optimized for humans. AgentPlaybooks is optimized for machines.
That is the whole distinction, and every difference below follows from it.

## Where they genuinely overlap

The overlap is real, not manufactured:

- **Markdown with frontmatter is the primitive.** An Obsidian note and a
  `SKILL.md` are the same file type. This is why the two compose so cheaply.
- **The same promise about lock-in.** Obsidian: your files, your folder,
  forever. AgentPlaybooks: your agents stay yours, on any platform. Same fear,
  different object.
- **Both accumulate reusable process knowledge.** A great many prompt
  libraries and "how we do things here" write-ups already live in a vault.
- **Both have an ecosystem** — community plugins on one side, public skills and
  MCP servers on the other.

If your vault already has a `Prompts/` or `Skills/` folder, you are most of the
way to a playbook and probably do not know it.

## What Obsidian is better at

- **Human reading and writing.** The editor, backlinks, graph view, the Canvas
  whiteboard, the mobile app. AgentPlaybooks does not try to compete here.
- **Unstructured, emergent knowledge.** You never have to know what a note is
  before you start writing it. A skill is a contract, so you do.
- **Zero infrastructure.** No account, no database, no network. For some people
  that is not convenience, it is the requirement.
- **Ecosystem maturity.** Thousands of community plugins and a much larger
  community.
- **Long-horizon personal notes.** Zettelkasten, PARA, daily notes. Agent
  memory is not built for this and should not be.
- **Cost.** Free for personal use.

## What a vault structurally cannot do

Not missing features — consequences of the model:

- **Deploy to more than one agent platform.** The same skill has to land in
  `.claude/skills/`, `.cursor/skills/`, `.codex/skills/` plus `config.toml`,
  `.agents/skills/`, and `~/.hermes/config.yaml`, each with the right layout,
  with drift between copies detected. A vault has no concept of a deployment
  target. See [CLI & Editor Plugins](./cli.md).
- **Hold a credential safely.** The moment a vault-based AI setup needs an API
  key, that key goes in plaintext into `.obsidian/plugins/<name>/data.json` —
  and from there into Sync, and into git history if the vault is versioned.
  AgentPlaybooks keeps the value in an encrypted vault and injects it
  server-side via `use_secret`, so the plaintext never enters the agent's
  context, let alone the disk. See [Secrets](./mcp-federation.md).
- **Let two agents write at once.** Canvas documents take an `expectedVersion`
  and return HTTP `409` on a stale write, so the losing agent *knows* it was
  stale. Two agents editing one note through Sync produce
  `note (conflicted copy).md` and no one finds out.
- **Express permissions.** Sharing a vault shares all of it. AgentPlaybooks has
  Viewer / Coworker / Admin roles, single-use editor invites, and
  playbook-scoped API keys. See [Team Collaboration](./team-collaboration.md).
- **Contain a runnable tool.** An MCP server is executable. A note about an MCP
  server is prose.

## Comparison

| | Obsidian | AgentPlaybooks |
|---|---|---|
| Optimized for | humans | machines |
| Primary reader | you | your agent |
| Content shape | free-form prose | schema'd skill, MCP server, persona |
| Storage | files on your disk | Postgres + portable `agentplaybook.json` |
| Distribution | Sync (file copy) | `pull` / `push` + fan-out to 5 platform targets |
| Credentials | plaintext in plugin config | AES-256-GCM vault, server-side proxy |
| Teams | sharing a vault shares everything | RBAC, single-use invites, owner-only controls |
| Concurrent writes | conflicted copy | `expectedVersion` → HTTP 409 |
| Validation | linter plugins | `apb doctor`: spec violations, secrets, drift, score |
| Memory model | notes and backlinks | tiers, task graphs, status |
| Offline | complete | CLI yes, hosted no |
| Ecosystem | ~2000 community plugins | growing skill & MCP marketplace |
| Entry cost | none | account plus a key |

## Using both: four recipes

### 1. Author in the vault, distribute with the playbook

This works today with no plugin and no migration. `apb push` reads skills out
of any folder laid out as `<name>/SKILL.md` — which is exactly what a vault
folder can be:

```text
MyVault/
  Skills/
    code-review/SKILL.md
    release-notes/SKILL.md
```

```bash
cd MyVault
apb push --apply
```

You write in Obsidian. Your teammates get the skills in Claude Code, Cursor,
Codex, Antigravity, or Hermes — whichever they use.

### 2. Pull the team's skills back in as notes

```bash
apb pull <guid> --apply
```

Shared skills land in `.agents/skills/` as plain markdown. Point that at a
folder inside your vault and they become readable, linkable, backlinkable
notes. Now the project note can link to the skill that automates the project.

### 3. Let the agent write to Canvas, and read the result in Obsidian

An agent working a long task writes to a
[Canvas document](./playbooks.md) — versioned, `409`-protected, scoped to one
run so parallel teams never collide. When it is done, the document is markdown;
drop it in the vault and read it where you read everything else.

The agent writes where writing is safe. You read where reading is pleasant.

### 4. Install public skills straight from a URL

Every public playbook publishes its skills over the
[`/.well-known/skills/`](./skills.md) convention — an `index.json` plus a
`SKILL.md` per skill, no credential, CORS open:

```bash
curl https://agentplaybooks.ai/.well-known/skills/index.json
```

Any client can fetch and install from that without an account.

## The one rule that keeps both clean

**Vault for durable human knowledge. Playbook memory for machine state.**

Decisions, meeting notes, half-formed ideas, research: vault. Working-tier
scratch state, task graphs, run status, structured facts an agent reads back
next session: [playbook memory](./memory.md).

If you let an agent write its working memory into the vault, you get a polluted
graph and a stream of sync conflicts. If you put your Zettelkasten into
playbook memory, you get a key-value store you cannot think in. The boundary is
not bureaucracy; it is the reason both stay usable.

## You probably only need Obsidian if

Said plainly, because it is often true:

- You work alone, on one machine.
- You use exactly one agent platform and expect that to stay true.
- No credential is involved — no API key, no token, no MCP server needing auth.
- Nothing you write needs to be *executed* by an agent at a specific moment;
  you paste context in by hand and that is fine.

If all four hold, a vault plus a good MCP filesystem server is a genuinely
sufficient setup, and adding a platform would be overhead. Come back when the
second machine, the second teammate, or the first API key shows up — that is
when the vault stops being enough, and it is a predictable moment.

## Migrating a prompt folder in 90 seconds

Nothing leaves Obsidian. Run this against a vault that already has a prompts
or skills folder:

```bash
apb doctor .
```

Doctor is read-only. It reports Agent Skills spec violations, likely
hard-coded credentials (line numbers only, never values), and definitions that
have drifted between copies. It reads skills, agent instructions, and MCP
configurations — not Obsidian's own plugin settings — so a key saved in some
plugin's `.obsidian/plugins/<name>/data.json` is one to check by hand. Then:

```bash
apb sync . --apply
```

The same prompts now work inside every agent tool you have installed. Your
vault is untouched.

## Related

- [CLI & Editor Plugins](./cli.md) — doctor, sync, pull/push, secrets
- [Skills](./skills.md) — what a skill is and why it has a schema
- [Memory](./memory.md) — tiers, task graphs, and what belongs in them
- [Playbooks](./playbooks.md) — personas, canvas, and the full operating environment
- [Team Collaboration](./team-collaboration.md) — the permission model
