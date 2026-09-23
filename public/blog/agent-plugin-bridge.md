---
title: One playbook, portable Agent Plugins and live MCP skills
description: AgentPlaybooks connects Agent Plugins 1.0, Agent Skills, MCP servers, cross-platform configuration sync, and private AI agent backups without exporting secret values.
date: 2026-09-24
author: Mate Benyovszky
---

# One playbook, portable Agent Plugins and live MCP skills

An AI agent setup is rarely one file. Skills live in directories, tools connect through MCP, editor-specific instructions drift, and secrets must stay out of packages. AgentPlaybooks brings these pieces into a two-level distribution model: a stable project plugin plus a portable export for each playbook.

The **Export as Agent Plugin** action creates an Agent Plugins 1.0 package with `plugin.json`, `mcp.json`, and standards-based `skills/<name>/SKILL.md` files. It includes safe supporting skill files and the playbook's persona and instructions in an AgentPlaybooks-specific extension. It does not include memory contents, canvas data, runs, or credential values. The MCP connection uses host-managed authentication rather than a key baked into a ZIP.

For clients that implement the [MCP Skills extension](https://github.com/modelcontextprotocol/ext-skills/blob/main/specification/stable/skills.mdx), a playbook MCP endpoint can list skills, return their frontmatter and file manifests, and serve each file with a SHA-256 digest for verification. Other clients can install the exported package or use the existing MCP tools and resources. Some plugin directories snapshot imported skills at review time; live changes to a playbook do not bypass that review.

The CLI still handles the configuration bridge. `apb doctor` detects drift; `apb sync` maps supported skills, instructions, custom agents, and MCP references across editors. `apb push`, `apb backups`, and `apb pull` provide a separate, private recovery path. A plugin export is for installation and sharing, not a substitute for central backup.

This is **cross-platform AI agent portability**, **Agent Skills migration**, **MCP server distribution**, and **AI agent configuration backup** with clear boundaries: the common standard travels broadly, while vendor-only features remain explicit. The [release distribution guide](/docs/release-distribution) tracks npm, MCP registries, plugin marketplaces, skill discovery, Hermes memory, documentation, and review status so a new version is verifiable everywhere it claims to be available.
