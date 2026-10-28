# Hermes Memory Provider

![AgentPlaybooks Hermes Memory plugin card](/plugin-catalog/hermes-memory.png)

AgentPlaybooks can be selected as a native memory provider in Hermes Agent. It
stores durable facts in a private playbook, makes them available across sessions,
and lets you inspect, correct, archive, or delete them in AgentPlaybooks.
For playbook skills, MCP and OpenAPI tools, and authentication in Hermes, see
the separate [AgentPlaybooks Tools plugin](./hermes-portable-agents.md).

## Install and configure

Use Hermes **0.22.4 or later**. Compatibility is tested against the upstream
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

Select **agentplaybooks-memory** in the setup wizard and enter the private playbook GUID,
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

Install CLI 0.8.0, then preview and apply the profile-scoped setup:

```bash
npm install -g @agentplaybooks/cli@0.8.1
apb memory setup PRIVATE_PLAYBOOK_GUID --target=hermes --profile=work
apb memory setup PRIVATE_PLAYBOOK_GUID --target=hermes --profile=work --apply
HERMES_HOME=~/.hermes/profiles/work hermes memory setup
HERMES_HOME=~/.hermes/profiles/work hermes memory status
```

`--hermes-home` selects the installation home; `--profile` selects its named
profile. Existing differing plugin files must be updated through Hermes or
reconciled explicitly. Setup never overwrites them or migrates existing memory.
Memory 0.3.0 uses Hermes's exact `previous_content` for mirrored replacement and
removal. Ambiguous/missing identity fails closed and requires reconciliation.

Memory 0.3.1 checks private visibility and memory access in one authenticated
`private_check=1` API request, without the expected anonymous 404 of older
clients. It identifies requests as `AgentPlaybooks-Hermes-Memory/0.3.1`. Each
write still rechecks privacy and credentials; older servers retain the legacy
check. Already installed plugins and pinned catalog/npm bundles require an
update to use this behavior; deploying the server alone does not update them.

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
automatic recall searches personal and configured team playbooks; read-only sources are queried explicitly. The CLI equivalent is
`--shared=<guid>,<guid>`.

Public shared sources require no key. For a private shared source, configure a
separate read-only key in the profile's secret environment:
`AGENTPLAYBOOKS_SHARED_<GUID_WITHOUT_HYPHENS_UPPERCASE>_API_KEY`. The provider never
reuses the personal playbook key for shared sources.

Personal writes reject public and unlisted playbooks. Keep the playbook private:
changing its visibility later exposes existing contents according to the
service's access model. Visibility checks and writes are separate requests, not
an atomic visibility lock.

### Team memory

A team working on the same matter can share a **writable** memory: a private
playbook for that team. List it in `team_playbooks` (CLI: `--team=<guid>`) and
give each member's profile its key as
`AGENTPLAYBOOKS_TEAM_<GUID_WITHOUT_HYPHENS_UPPERCASE>_API_KEY`. A playbook-scoped
key with `memory:read` and `memory:write` works.

- Write, archive and delete reach it with `source` set to the team GUID.
  Without `source`, writes still go to personal memory.
- Automatic recall searches personal memory and up to seven configured team playbooks. Team
  results are labelled with the team GUID.
- Team writes are refused if the playbook is public or unlisted, like personal
  ones. A source listed as shared stays read-only. A GUID listed both as shared
  and as team counts as team.
- Mirroring of Hermes's built-in memory always goes to personal memory.

When the matter is closed, archive or delete the team playbook and remove it
from `team_playbooks`.

## Search and current limits

Automatic recall extracts up to four keywords, searches personal and team
sources concurrently (up to eight sources, four workers, a four-second budget),
and ranks/deduplicates matches. It injects at most eight short records and 8,000
characters; use `apb_memory_read` for full content. Slow sources do not suppress
completed results. English and Hungarian stopwords are filtered; this is lexical
matching, not embeddings or morphological/semantic search. Explicit
`apb_memory_search` remains literal and unchanged.

The plugin does not upload full conversations, extract facts automatically,
bulk-import existing local memories, or add a persistent content cache, offline queue or automatic retries. Failed API operations are reported rather than queued for later.

See the [memory API guide](./memory.md) for tiers, timestamps, history, and
archiving, and the [provider source and tests](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/hermes-memory)
for implementation details. The automated checks exercise the REST contract and
the real Hermes loader, Desktop schema, tool injection, memory-write hooks, and
profile switching against a local HTTP test server; they do not use a live account.

## Avoiding unnecessary traffic (0.3.2)

There is no polling timer. Short English/Hungarian acknowledgements (including
`köszönöm`, `rendben`, and `oké`) skip automatic recall. The same query in the same
session and source set is suppressed for 30 seconds; only a bounded in-memory
digest is kept, and no recalled content is cached or replayed. A successful
explicit memory mutation clears this suppression. Explicit search/read tools
always remain available.

Automatic recall serializes keywords within each source while searching different
sources in parallel. A failed source stops immediately and is skipped for 60
seconds, so a failure does not fan out into four requests. Other sources continue.
The next user-triggered recall after that interval can try again; no background
retry is scheduled. Private visibility is still checked afresh before every write.
