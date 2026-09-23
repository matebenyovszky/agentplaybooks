# Cross-platform AI agent configuration backups

AgentPlaybooks bridges supported AI coding agents through a portable working set. The CLI audits local configuration with `apb doctor`, normalizes it with `apb sync`, and stores an immutable, private backup revision when you run `apb push`. On another machine, `apb pull` restores that working set and `apb sync --target=... --apply` renders the files expected by each client.

This is useful for **AI agent migration**, **Agent Skills backup**, **custom agent portability**, and **MCP configuration recovery**. It is a practical bridge for the shared configuration model—not a promise that every vendor-specific feature behaves identically everywhere.

## What is backed up?

Each portable snapshot includes:

- The chosen project instruction file as `AGENTS.md` and the `agentplaybook.json` manifest.
- Complete Agent Skills directories, including `SKILL.md`, scripts, references, and binary assets.
- Portable custom agents, including their common prompt fields and supported vendor-specific extensions.
- MCP server definitions and secret **references** such as `${DOCS_TOKEN}`; the CLI does not fetch vault values.
- The optional portable persona file.

The backup is versioned by playbook GUID and remains available to the owner if the playbook record is deleted. A snapshot is private even when the playbook itself is public. The server validates paths, checksums, file-count and size limits, and obvious literal credentials before storing it. Currently the limit is 1,000 files, 4 MiB total, and 1 MiB per file.

Credential detection is necessarily heuristic for arbitrary skill assets. Review the upload plan and the files in a skill before pushing; do not place secrets in skill resources.

`CLAUDE.local.md`, `settings.local.json`, permission settings, hooks, worktrees, and arbitrary application data are deliberately outside this portable backup. A hosted OpenAPI federation server and a platform's account-managed MCP connection may have no local-file equivalent.

## Back up, inspect, and restore

```bash
apb doctor . --strict
apb push .                 # review the upload plan
apb push . --apply         # hosted records + private portable snapshot
apb backups PLAYBOOK_GUID  # list backup revision IDs

apb pull PLAYBOOK_GUID ../recovered --apply
apb sync ../recovered --target=claude,cursor,codex,copilot,gemini --apply

# Restore an earlier revision without overwriting different local files:
apb pull PLAYBOOK_GUID ../older --snapshot=SNAPSHOT_ID --apply
```

`push` refuses to apply a partial backup when definitions conflict. `pull` creates missing files and reports different existing files as conflicts. It does not silently overwrite them. If a playbook was deleted, its owner can still restore the latest backup by GUID, then push the recovered project to a new playbook.

The private snapshots complement the hosted playbook's live skills and MCP tools. They are not a replacement for your Git repository or a backup of the secret vault. Keep the API key safe; restore access requires the same account.

## Which agent platforms are supported?

The local `sync` adapters cover Claude Code, Cursor, OpenAI Codex, GitHub Copilot, Gemini CLI, Google Antigravity, Grok Bot, and Hermes Agent. Agent Plugins 1.0 import/export is a separate package route for portable skills and MCP servers. Custom agents are carried by AgentPlaybooks' extension and rendered into supported clients' native formats.

The common fields can travel across platforms; client-only fields are kept where representable, and unsupported features are reported. For example, Grok Bot's account MCP Box is not provisioned by a project file. Running `apb doctor` after restoration shows remaining drift. See [CLI & Editor Plugins](/docs/cli) and [Platform Integrations](/docs/platform-integrations) for the exact file mappings.

## Does this improve AI search visibility?

This page uses descriptive terms such as *cross-platform AI agent configuration*, *portable Agent Skills*, *Agent Plugins compatibility*, and *AI agent backup and restore* so people and search systems can understand the feature. It does not require an AEO/GEO trick or a special AI-only file; the main goal is accurate, crawlable, helpful documentation.
