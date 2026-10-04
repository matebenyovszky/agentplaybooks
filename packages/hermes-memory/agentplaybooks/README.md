# AgentPlaybooks Memory for Hermes

![AgentPlaybooks Memory for Hermes](https://agentplaybooks.ai/plugin-catalog/hermes-memory.png)

A native Hermes memory provider backed by [AgentPlaybooks](https://agentplaybooks.ai).
Remember durable facts across sessions, inspect and correct them in AgentPlaybooks,
and share selected knowledge with other agents through explicitly configured playbooks.
For playbook skills, MCP and OpenAPI tools, and authentication in Hermes, see
the [AgentPlaybooks Tools plugin](https://agentplaybooks.ai/docs/hermes-portable-agents).

## Install

From a checkout of the AgentPlaybooks repository:

```bash
npm --prefix packages/cli install
npm --prefix packages/cli run build
node packages/cli/bin/agentplaybooks.js memory setup PRIVATE_PLAYBOOK_GUID --target=hermes
node packages/cli/bin/agentplaybooks.js memory setup PRIVATE_PLAYBOOK_GUID --target=hermes --apply
hermes memory setup
hermes memory status
```

Select **agentplaybooks-memory** in the Hermes setup wizard. Create a **private** playbook
and a playbook-scoped key with `memory:read` and `memory:write` in its Integrations
tab. Supply the key through Hermes's secret setup or the profile-scoped
`AGENTPLAYBOOKS_MEMORY_API_KEY` environment variable. The AgentPlaybooks CLI never
copies a credential. An account-management key is not a substitute for this key.

The CLI command is `apb memory setup <guid> --target=hermes` in a CLI release that
includes this provider. It honors `HERMES_HOME`; `--hermes-home=<directory>` selects
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

Requires Hermes **0.21.4 or later**, with `agent.memory_provider.MemoryProvider`, profile-scoped
`agent.secret_scope.get_secret`, and memory-write provenance (`old_text`). Tested
against the upstream revision recorded in this repository's compatibility workflow.
Hermes Desktop also presents native configuration fields for this provider. CLI
and Desktop share `$HERMES_HOME/agentplaybooks/config.json` and the profile's secret store.

## What it does

- Automatically recalls current memories using AgentPlaybooks' existing **literal
  text search**. Search is not semantic: the exact query must occur in a memory.
  Use `apb_memory_search` with short terms when automatic recall returns nothing.
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
extraction, import existing local memory, add embeddings/ranking, or implement a
local cache, offline queue, retries or circuit breaker. A failed API operation is
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
uses the personal playbook only.

For a private shared playbook, supply a read-only key using
`AGENTPLAYBOOKS_SHARED_<GUID_WITHOUT_HYPHENS_UPPERCASE>_API_KEY` in the profile's
secret environment. Public sources need no key. Personal credentials are never
sent to shared sources. Tags and metadata organize data; they are not access controls.

Personal writes are refused if the playbook is public or unlisted. The plugin
checks anonymous visibility and authenticated access before writing using existing
AgentPlaybooks APIs. Keep this playbook private: changing its visibility later
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
