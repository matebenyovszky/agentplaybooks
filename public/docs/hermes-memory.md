# Hermes Memory Provider

![AgentPlaybooks Hermes Memory plugin card](/plugin-catalog/hermes-memory.png)

AgentPlaybooks can be selected as a native memory provider in Hermes Agent. It
stores durable facts in a private playbook, makes them available across sessions,
and lets you inspect, correct, archive, or delete them in AgentPlaybooks.
For playbook skills, MCP and OpenAPI tools, and authentication in Hermes, see
the separate [AgentPlaybooks Tools plugin](./hermes-portable-agents.md).

## Install and configure

Use Hermes **0.21.4 or later**. Compatibility is tested against the upstream
revision pinned in our [compatibility workflow](https://github.com/matebenyovszky/agentplaybooks/blob/main/.github/workflows/hermes-memory.yml).

1. Create a **private playbook for this Hermes profile** in AgentPlaybooks.
2. In that playbook's **Integrations** tab, create a playbook-scoped API key with
   `memory:read` and `memory:write` permissions. The **Coworker** role includes
   both. An account-management key does not substitute for a playbook key.
3. Install the plugin into the intended Hermes profile:

```bash
hermes plugins install agentplaybooks-memory
hermes memory setup
hermes memory status
```

Select **agentplaybooks** in the setup wizard and enter the private playbook GUID,
API key, and service URL (default `https://agentplaybooks.ai`). Hermes Desktop
also exposes the provider's native memory settings. Configuration lives in
`$HERMES_HOME/agentplaybooks/config.json`; the key belongs in Hermes's profile
secret store as `AGENTPLAYBOOKS_MEMORY_API_KEY`, not in that JSON file.
For multiple profiles, select the intended profile with `HERMES_HOME` before
installing and configuring the plugin. The catalog entry pins the reviewed
source commit. Direct repository installation also works with
`hermes plugins install matebenyovszky/agentplaybooks/packages/hermes-memory/agentplaybooks`;
you can pin that route with `--ref <full-commit-sha>`.

**Plugin store status, September 23, 2026:**
[Hermes merged the catalog entry](https://github.com/NousResearch/hermes-agent/pull/119450),
and `agentplaybooks-memory` has a [live plugin page](https://hermes-agent.nousresearch.com/docs/plugins/agentplaybooks-memory).
Older Hermes
installations may need a catalog refresh or update to see the new entry.

### Install through the AgentPlaybooks CLI

The repository includes `apb memory setup`. Until you use a CLI release containing
this command, build it from a source checkout instead of assuming the installed
npm version includes it. From the AgentPlaybooks repository root:

```bash
npm --prefix packages/cli install
npm --prefix packages/cli run build
node packages/cli/bin/agentplaybooks.js memory setup PRIVATE_PLAYBOOK_GUID --target=hermes
node packages/cli/bin/agentplaybooks.js memory setup PRIVATE_PLAYBOOK_GUID --target=hermes --apply
hermes memory setup
hermes memory status
```

The first setup command previews the plan; `--apply` installs the bundled plugin
and selects the provider. It honors `HERMES_HOME` or `--hermes-home=<directory>`,
preserves unrelated settings, reports conflicting plugin files or another
selected provider, and never copies credentials. This is an alternative to
catalog installation. Existing local memory is not imported.

## Daily use

| Tool | Purpose |
|---|---|
| `apb_memory_search` | Search literal text, or omit the query to list current memories |
| `apb_memory_read` | Read a known key, including an archived entry |
| `apb_memory_write` | Create or update a key with a JSON value, summary, and tier |
| `apb_memory_history` | Inspect previous versions of a key |
| `apb_memory_archive` | Hide an entry from normal search while retaining its content and history |
| `apb_memory_delete` | Permanently remove an entry and its remote history |

For a first check, ask Hermes to save `project_language` with the value
`{"language":"Hungarian"}` using `apb_memory_write`. Start a new session and ask
it to read that key. Correct the value in the AgentPlaybooks editor, then ask
Hermes to read it again and inspect its history. Archive the test entry, verify
that normal search excludes it, and delete it when finished.

The provider also mirrors new successful, explicit writes made through Hermes's
built-in memory tool. Additions, replacements, and removals are supported;
replacements retain the remote entry key and its history. Writes carry agent,
session, author, platform, and source metadata. Only primary-agent contexts write.

Hermes's local `MEMORY.md` and `USER.md` remain active. **A remote correction does
not rewrite a local copy.** If a fact was mirrored from local memory, correct or
remove it there as well. Permanent forgetting requires removing both copies;
archiving retains the information.

## Profile boundaries and shared knowledge

Use one private memory playbook per profile. Everyone who can use that profile
shares its memory, including participants using its messaging gateway. Author
metadata records provenance; it does not create per-person access restrictions.
Use separate profiles and private playbooks when users need isolated memories.

Optional `shared_playbooks` in setup accepts comma-separated playbook GUIDs.
These sources are read-only and selected through a tool's `source` argument;
automatic recall searches only the personal playbook. The CLI equivalent is
`--shared=<guid>,<guid>`.

Public shared sources require no key. For a private shared source, configure a
separate read-only key in the profile's secret environment:
`AGENTPLAYBOOKS_SHARED_<GUID_WITHOUT_HYPHENS_UPPERCASE>_API_KEY`. The provider never
reuses the personal playbook key for shared sources.

Personal writes reject public and unlisted playbooks. Keep the playbook private:
changing its visibility later exposes existing contents according to the
service's access model. Visibility checks and writes are separate requests, not
an atomic visibility lock.

## Search and current limits

Automatic recall uses the existing **literal text search** with the full query,
returning at most 20 matches. A whole question may not occur in any stored memory;
use `apb_memory_search` with short terms, or read a known key directly. This version
does not add semantic search or relevance ranking.

The plugin does not upload full conversations, extract facts automatically,
bulk-import existing local memories, or add a cache, offline queue, retries, or
circuit breaker. Failed API operations are reported rather than queued for later.

See the [memory API guide](./memory.md) for tiers, timestamps, history, and
archiving, and the [provider source and tests](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/hermes-memory)
for implementation details. The automated checks exercise the REST contract and
the real Hermes loader, Desktop schema, tool injection, memory-write hooks, and
profile switching against a local HTTP test server; they do not use a live account.
