# Hermes for Organisations

Run one Hermes Agent per employee, and manage what they share from one place.
A **bundle playbook** carries the organisation's baseline: LLM providers, MCP
servers, skills, the bots to install and the shared knowledge to read.
`apb hermes sync` applies it to a machine. Every bot is its own playbook.

This guide covers the delivery mechanism. For memory itself see
[Hermes Memory Provider](./hermes-memory.md).

## The pieces

| Playbook | Visibility | Holds |
|---|---|---|
| Bundle (one per organisation) | unlisted on an intranet instance | `config.hermes`, organisation skills |
| One per bot | unlisted | persona, instructions, skills, MCP servers |
| Shared knowledge | unlisted | curated memories: principles and methods only |
| One per employee | **private** | that person's memory |

Bundle and bot playbooks are read from the agent endpoint
(`GET /api/playbooks/<guid>?format=json`). It answers anonymously for public and
unlisted playbooks, so on an instance that only the intranet can reach, no
employee needs a credential to receive the baseline. Do not put anything secret
in a bundle: its `config` is readable by everyone who can reach the instance.

## `config.hermes`

Set it in the bundle playbook's `config` field. Every key is optional.

```json
{
  "hermes": {
    "managed": {
      "providers": {
        "local": { "name": "Local Ollama", "base_url": "http://llm.intranet:11434/v1",
                   "api_key": "no-auth", "models": ["qwen3.8:27b"], "discover_models": false }
      },
      "mcp_servers": { "sql": { "url": "http://sql-mcp.intranet:8006/mcp", "timeout": 120 } }
    },
    "defaults": { "model": { "default": "qwen3.8:27b", "provider": "local" } },
    "env": { "MSGRAPH_CLIENT_ID": "00000000-0000-0000-0000-000000000000" },
    "bots": ["<bot-playbook-guid>"],
    "shared_memory": ["<shared-knowledge-guid>"]
  }
}
```

| Key | Becomes |
|---|---|
| `managed` | Hermes's **managed scope** (`config.yaml` in the managed directory). Pinned: Hermes and its desktop app cannot change these keys. |
| `defaults` | Merged into each profile's own `config.yaml`, only where the key is unset. Users can still choose another default model. |
| `env` | The managed `.env`, which Hermes loads last. Single-line, non-secret values. |
| `bots` | Bot playbooks, each installed as a Hermes profile. |
| `shared_memory` | Read-only shared sources for the memory provider. |
| `plugins` | Hermes plugins installed into every synced profile that lacks them: catalog names (`"agentplaybooks-tools"`) or `{ "name", "source", "ref" }` with a 40-character commit. `agentplaybooks-memory` is installed by `--memory` instead. |

A bot playbook may set `config.hermes.profile_name`. Otherwise the profile name
comes from the playbook name, lowercased and with accents removed. It may also
set `config.hermes.version`.

## Sync a machine

```bash
apb hermes sync <bundle-guid> --url=https://agents.example.org \
  --managed-dir="%LOCALAPPDATA%\example\hermes-managed" \
  --memory=<personal-memory-guid> --apply
```

Without `--apply` the command only shows its plan. With it:

1. It writes `config.yaml` and `.env` into the managed directory. The bundle's
   skills go to `skills/`, which is pinned as `skills.external_dirs`.
2. It writes each bot as a profile distribution under `bots/<name>/`. Hermes
   installs it with `hermes profile install`, or `hermes profile update` once
   it exists. A same-named profile that was not installed from a distribution
   is left alone.
3. It merges `defaults`, plus a bot's own MCP servers, into each profile's
   `config.yaml` where unset.
4. With `--memory`, it configures the memory provider in every one of those
   profiles: the personal playbook, plus `shared_memory`. It reads the
   personal key from `AGENTPLAYBOOKS_MEMORY_API_KEY` once and keeps it in the
   managed `.env`.
5. It records `state.json`: bundle, time, skills, bots and any failures.

Credentials never come from the bundle. Pass them with
`--env-file=<file>`: a `KEY=VALUE` file that only the intended people can read,
for example on a protected share. Its values go into the managed `.env` and
stay there for later syncs, even when the file cannot be reached. A key that
the bundle's `env` used to set, and no longer does, is removed.

Hermes reads the managed layer only when `HERMES_MANAGED_DIR` points at the
managed directory. Set it once, as a user environment variable, in your
installer. On an intranet instance without TLS, add `--allow-insecure-http`;
see [Self-Hosting](./self-hosting.md).

Run the same command from a scheduled task, for example at logon and daily.
That keeps every machine on the current bundle. A bot update never touches the
bot's sessions or memories.

## Learning without leaking cases

Hermes keeps learning locally. Its own `MEMORY.md` and the employee's private
playbook may hold case details. Shared knowledge is kept separate:

- Every profile reads the shared knowledge playbook. It cannot write to it.
- Lessons reach it only through review. A person proposes a generalised
  principle or method, with no names, case numbers or document content. A
  curator checks it and promotes it.
- Nothing is promoted automatically.

## Limits of this version

- A user-level managed directory is advisory: the employee can edit it. Real
  enforcement needs a machine-level `HERMES_MANAGED_DIR` that users can only
  read, set by your device management.
- Bundle and bot playbooks must be public or unlisted. Organisation-only
  visibility is planned.
- Each employee creates their private memory playbook and its key once, in the
  web app.
