# OpenAI / ChatGPT Skills-only directory ZIP

Prepare a **Skills-only** upload for the OpenAI Plugins Directory (shared by
ChatGPT and Codex). This is packaging only.

This ZIP is the directory Skills-only variant. The full product plugin with
account MCP stays on npm and in `.codex-plugin/`. Publisher identity verification
is completed by the account owner in the OpenAI portal.

For the complete hosted integration, use a package containing MCP from its first
upload. OpenAI currently cannot add MCP to an existing skills-only listing.
See the [official submission guide](https://developers.openai.com/plugins/deploy/submission).

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
The packer copies the current manifest as-is. The CLI 0.8.0 listing subtitle is
“Your agents. Every platform.” and the release validator enforces the portal's
30-character limit.

## Portal steps

1. Select the organization and project that will own the listing.
2. Complete publisher verification and upload the intended package variant.
3. Resolve automated findings and complete review materials before submission.
4. Record the actual draft, review, approval or publication state in the release issue.
