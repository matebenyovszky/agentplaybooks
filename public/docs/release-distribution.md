# Release distribution: MCP, plugins, skills, memory, and backups

AgentPlaybooks is a cross-platform bridge for AI agent configuration. A release is complete only when the versioned code, hosted service, installable components, store listings, and documentation agree. The release gate (`npm run release:check`) checks local versions, manifests, included files, and that the plugin logo matches the website. A `cli-v*` tag also opens an idempotent GitHub issue for live-listing verification.

## Where to update

| Channel | Release action | Verification |
|---|---|---|
| npm | Publish `@agentplaybooks/cli` through the trusted-publishing workflow after tests and `npm pack --dry-run`. | Check the live npm version, tarball, binaries, and provenance. |
| Official MCP Registry | Deploy the matching server, then publish root `server.json` as `ai.agentplaybooks/agentplaybooks`. The custom-domain namespace needs its separately held domain publisher key. | Confirm the new active version and endpoint; do not confuse the deprecated accidental `1.0.0` entry with the latest product release. |
| Glama | Check the indexed [AgentPlaybooks MCP listing](https://glama.ai/mcp/connectors/ai.agentplaybooks/agentplaybooks) and request a refresh if it remains stale. | Check listing version, logo, and live connection. |
| Claude Code | Update `.claude-plugin/marketplace.json` and `packages/cli/.claude-plugin/plugin.json`, then test install from the repository marketplace. | Confirm installed skills and account MCP server. This repository marketplace is not an Anthropic-operated global store. |
| Cursor Marketplace | Update root `plugin.json`, `.cursor-plugin/marketplace.json`, and package manifest; submit the public repository through [Cursor's review portal](https://cursor.com/marketplace/publish). Each update is reviewed. | Verify the public listing and install; a repository manifest alone is not a store publication. |
| ChatGPT/Codex Plugins Directory | Update root Agent Plugins 1.0 package and submit a new version in the [OpenAI plugin portal](https://developers.openai.com/plugins/deploy/submission). Identity, domain, tools, test cases, and policies need review. | Verify approval and actual publication in the shared directory; uploading does not publish. |
| Hermes plugin catalog | Keep the [merged memory catalog entry](https://github.com/NousResearch/hermes-agent/pull/119450), its source pin, and the separate portable-agent plugin compatible. Update catalog pins through upstream PRs when those packages change. | Run `hermes memory status`, a write/read/correction test, and the portable-agent install/sync check. |
| Agent Skills | Keep `packages/cli/skills/`, the public `/.well-known/skills/` endpoint, and MCP Skills extension consistent. A GitHub-hosted skill can be installed with `npx skills add`; [skills.sh](https://skills.sh/) indexes/install sources rather than replacing this source of truth. | Test discovery, install, `skills/list`, `skills/get`, and digest-verified `resources/read`. |
| AgentPlaybooks central backup | Test `apb doctor`, `push`, `backups`, `pull`, and `sync` against every supported adapter. | Restore into a fresh directory; confirm only secret references move, never secret values. |

Additional directories should be added only after checking their current submission policy and whether they accept MCP, plugins, or skills. Do not claim a store is updated until its live listing is verified.

## Release sequence

1. Bump the CLI, portable package, vendor plugin manifests, marketplaces, and `server.json` to the same version. Run `npm run release:check`, `npm run test:all`, lint, typecheck, build, and `npm pack --dry-run`.
2. Merge and deploy the web service. Test the public MCP endpoint and the dashboard's **Export as Agent Plugin** button. The ZIP is an installable snapshot of skills, persona/instructions, and a host-authenticated account MCP reference—not a full private backup.
3. Tag `cli-v<version>` only after the package is ready. The npm workflow publishes with provenance; the distribution workflow creates a checklist issue. Verify npm before marking it done.
4. Publish `server.json` to the Official MCP Registry using the domain publisher credential held outside Git. Check Glama indexing. Update or submit manually reviewed store listings (Cursor, OpenAI, Hermes) and record their review status in the checklist.
5. Verify skill discovery and `npx skills add`, then update README, docs, sitemap, changelog/blog, and a short release note. For a new integration, comment on third-party issues only when the answer directly solves the reported problem; include an exact test result or documentation link, avoid promotional repetition, and never automate unsolicited comments.

## Two-level distribution model

The project plugin installs the CLI's stable skills and account MCP connection. A user's playbook is the second level: **Export as Agent Plugin** produces a portable `plugin.json`, `mcp.json`, and `skills/<name>/SKILL.md` tree. MCP clients that implement the [MCP Skills extension](https://github.com/modelcontextprotocol/ext-skills/blob/main/specification/stable/skills.mdx) can additionally discover hosted playbook skills dynamically; clients without it use the exported snapshot or existing tools/resources. A store may import remote skills as a static snapshot, so a changed playbook does not necessarily update an approved listing automatically.

Agent Plugins 1.0 standardizes the plugin manifest, skills, and MCP configuration. It does **not** standardize secret vault values, live playbook backup, memory, custom-agent semantics, or store review. AgentPlaybooks carries those separately and preserves references rather than embedding credentials.
