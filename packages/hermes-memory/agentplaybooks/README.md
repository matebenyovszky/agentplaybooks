# AgentPlaybooks Memory for Hermes

![AgentPlaybooks Memory for Hermes](https://agentplaybooks.ai/plugin-catalog/hermes-memory.png)

A native Hermes memory provider backed by [AgentPlaybooks](https://agentplaybooks.ai).
Remember durable facts across sessions, inspect and correct them in AgentPlaybooks,
and share selected knowledge with other agents through explicitly configured playbooks.
For playbook skills, MCP and OpenAPI tools, and authentication in Hermes, see
the [AgentPlaybooks Tools plugin](https://agentplaybooks.ai/docs/hermes-portable-agents).

## Install

On the gateway host/container, as the user running Hermes:

```bash
npm install -g @agentplaybooks/cli@0.8.1
apb memory setup PRIVATE_PLAYBOOK_GUID --target=hermes
apb memory setup PRIVATE_PLAYBOOK_GUID --target=hermes --apply
hermes memory setup
hermes memory status
```

Select **agentplaybooks-memory** in the Hermes setup wizard. Create a **private** playbook
and a playbook-scoped key with `memory:read` and `memory:write` in its Integrations
tab. Supply the key through Hermes's secret setup or the profile-scoped
`AGENTPLAYBOOKS_MEMORY_API_KEY` environment variable. The AgentPlaybooks CLI never
copies a credential. An account-management key is not a substitute for this key.

The CLI command is `apb memory setup <guid> --target=hermes` in a CLI release that
includes this provider. `--profile=work` selects a named profile; `--profile=default`
returns to the installation root even from another active profile. It honors `HERMES_HOME`; `--hermes-home=<directory>` selects
an explicit profile. Existing settings and different plugin files are reported as
conflicts. No existing memory is imported or overwritten.

Alternatively, install the Python package into **Hermes's own Python environment**:

```bash
python -m pip install ./packages/hermes-memory
hermes memory setup
```

The plugin is listed in the Hermes catalog and can be installed with
`hermes plugins install agentplaybooks-memory`. The catalog pins a reviewed source
commit. Direct repository installation also works with
`hermes plugins install matebenyovszky/agentplaybooks/packages/hermes-memory/agentplaybooks`.
Use `--ref <full-commit-sha>` to pin a direct installation, then run `hermes memory setup`.

Hermes discovers its `hermes_agent.memory_providers` entry point. The
[catalog entry](https://github.com/NousResearch/hermes-agent/pull/119450) was
merged and is present in the live plugin catalog.

Requires Hermes **0.22.4 or later**, with `agent.memory_provider.MemoryProvider`, profile-scoped
`agent.secret_scope.get_secret`, and authoritative memory-write provenance (`previous_content`). Tested
against the upstream revision recorded in this repository's compatibility workflow.
Hermes Desktop also presents native configuration fields for this provider. CLI
and Desktop share `$HERMES_HOME/agentplaybooks/config.json` and the profile's secret store.

## What it does

- Recalls with up to four keywords across personal and team sources in parallel.
  Four workers, a four-second deadline and an 8,000-character/eight-record limit
  bound latency and context. Up to eight sources are searched; explicit tools
  remain available for every configured source. Matching is lexical, not semantic.
- Mirrored replacement/removal uses exact Hermes `previous_content`. Missing or
  ambiguous identity requires reconciliation and never mutates another entry.
- Exposes `apb_memory_search`, `apb_memory_read`, `apb_memory_write`,
  `apb_memory_archive`, `apb_memory_delete`, and `apb_memory_history`.
- Mirrors explicit built-in Hermes memory additions, replacements and removals.
  The original entry key survives a replacement, preserving remote history.
- Records agent, session, author, platform and source on writes.
- Keeps Hermes's built-in MEMORY.md and USER.md active. Correcting remote memory
  does not rewrite those files: also correct a mirrored local entry with Hermes's
  memory tool. Permanent forgetting must remove both copies; remote deletion also
  deletes remote history. Archive retains content and is not forgetting.

The provider does **not** upload conversation transcripts, run automatic fact
extraction, import existing local memory, add embeddings, or implement a
persistent content cache, offline queue or automatic retries. A failed API operation is
reported, not queued for later delivery. The HTTP transport has a finite timeout;
Hermes itself supplies its normal external-provider execution deadline.

Only primary-agent contexts write. Session switches update provenance, and
per-turn author metadata follows gateway participants. One private playbook is the
memory boundary for a profile: **everyone allowed to use that profile shares its
memory**. Use separate profiles and private playbooks for users needing isolation.

## Shared knowledge

Set `shared_playbooks` to comma-separated GUIDs in `hermes memory setup`, or pass
`--shared=<guid>,<guid>` to the AgentPlaybooks setup command. These are read-only
sources selectable with the memory tools' `source` argument; automatic recall
uses personal and configured team playbooks; read-only sources are queried explicitly.

For a private shared playbook, supply a read-only key using
`AGENTPLAYBOOKS_SHARED_<GUID_WITHOUT_HYPHENS_UPPERCASE>_API_KEY` in the profile's
secret environment. Public sources need no key. Personal credentials are never
sent to shared sources. Tags and metadata organize data; they are not access controls.

Personal writes are refused if the playbook is public or unlisted. Version 0.3.1
checks current private visibility and authenticated memory access in one small
request (`GET /api/playbooks/:guid/memory?private_check=1&limit=1`) before each
write and on initialization. It does not fetch memory contents for this check or
cache a privacy proof. Older servers that return an ordinary memory list retain
the anonymous metadata check: its expected 404 conceals a private playbook and is
not a failed memory read. The client identifies its requests with
`AgentPlaybooks-Hermes-Memory/0.3.1` rather than Python's generic user agent.
Keep this playbook private: changing its visibility later
publishes existing contents according to the service's access model. Visibility
checks and writes are separate requests, not a transaction locking visibility.

## Verify

1. Ask Hermes to save a new fact with `apb_memory_write`.
2. Start a new session and read/search that key.
3. Correct it in the AgentPlaybooks editor, then read it again from Hermes.
4. Inspect history, archive it, and confirm normal search no longer returns it.
5. Permanently delete it when finished.

Development tests use an HTTP fake of the existing REST API and do not touch a
real account. From the repository root:

```bash
python -m unittest discover -s packages/hermes-memory/tests -v
npm --prefix packages/cli test
```

## License

MIT. The plugin has no third-party Python runtime dependencies beyond Hermes.

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
