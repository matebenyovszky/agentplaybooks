# OpenAI / ChatGPT Skills-only directory ZIP

Prepare a **Skills-only** upload for the OpenAI Plugins Directory (shared by
ChatGPT and Codex). This is packaging only.

**Do not submit** from this change. Listing copy waits for Mate yes. Identity
verification is Mate’s. The full product plugin with account MCP stays on npm
and in `.codex-plugin/`; this ZIP is the directory Skills-only variant.

The MCP / Bearer reviewer checklist is unchanged in
[`chatgpt-directory-notes.md`](./chatgpt-directory-notes.md).

## How to build

From the CLI package:

```bash
cd packages/cli
node scripts/pack-openai-skills-zip.mjs
```

Or with an explicit path:

```bash
node packages/cli/scripts/pack-openai-skills-zip.mjs --output=/tmp/agentplaybooks-openai-skills.zip
```

Default output (gitignored binary):

`packages/cli/dist/agentplaybooks-openai-skills.zip`

The archive is stored uncompressed so the bytes are stable across machines.
Re-run the script whenever `plugin.json`, `skills/`, `LICENSE`, or
`assets/icon.svg` change. Do not check the ZIP into git.

## What is inside

Files are at the ZIP root (one plugin root, no wrapper folder):

| Path | Source |
|---|---|
| `plugin.json` | `packages/cli/plugin.json` (Agent Plugins 1.0, MIT, `extensions.com.openai`) |
| `skills/agentplaybooks/SKILL.md` | `packages/cli/skills/agentplaybooks/SKILL.md` |
| `LICENSE` | `packages/cli/LICENSE` (MIT) |
| `assets/icon.svg` | Official app mark already in `packages/cli/assets/icon.svg` |

Omitted on purpose (Skills-only portal rules):

- `mcp.json`, `.mcp.json`, `mcpServers`
- `.codex-plugin/` / `.claude-plugin/` account MCP overlays
- `apps` / `.app.json`
- `interface.screenshots`
- secrets, API keys, and credential-bearing files

The packer refuses to write the ZIP if those show up or if a packed text file
looks like it contains a literal credential.

## Privacy, terms, listing copy

Privacy and terms URLs already live on the production site. Use them; do not
invent privacy pages:

- Privacy: `https://agentplaybooks.ai/privacy`
- Terms: `https://agentplaybooks.ai/terms`
- Website: `https://agentplaybooks.ai`

Those URLs are already in `plugin.json` → `extensions.com.openai.interface`.
Directory identity verification and **listing copy** (display name, short
description, long description, starter prompts) stay on hold until Mate yeses.
The packer copies the current manifest as-is so we are not blocked on ZIP
mechanics.

OpenAI’s **final** directory submit also caps short description at 30
characters. The current `shortDescription` is longer than that package-upload
limit’s stricter sibling; do not rewrite it here. Mate decides listing text
before anyone uploads.

## Submit is held

1. Mate yeses listing copy (and any short-description trim).
2. Someone with Apps Management write access and verified identity uploads via
   the OpenAI plugin portal **Skills only** path — not this repository, not CI.
3. Do not npm publish from this packaging change. Do not bump versions for it.
