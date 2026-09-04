# Portable Bot Teams: Grok Bot and Hermes Bot Mode

Last verified: **2026-08-18**

Grok Bot and Hermes Bot Mode both treat agents as persistent teammates rather
than disposable chats. AgentPlaybooks can complement them as a vendor-neutral
source of truth for the agent definition while each platform remains the
execution runtime.

This page separates integrations that work today from the deployment features
we intend to build. It does not imply an API or connector that a platform has
not published.

## Verified platform capabilities

### Grok Bot

xAI announced [Grok Bot](https://x.ai/news/introducing-grok-bot) in early beta
on August 11, 2026. The launch describes:

- an always-on cloud computer for each Bot;
- work across websites and applications, including surfaces without an API or
  MCP server;
- conversations shared between desktop and mobile;
- routines learned by watching a user perform a workflow;
- multiple Bots working in parallel, direct Bot-to-Bot messages, and group
  chats;
- approval handoffs when human judgment is needed.

The launch material does **not** document a public Bot management API, an MCP
attachment point, or a portable Bot import/export format. Treat any current
AgentPlaybooks connection as web/computer-use based, not as a native Grok Bot
adapter.

### Hermes Bot Mode

[Hermes Bot Mode](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/bot-mode.md)
is built into Hermes Desktop. A Bot is a
[Hermes profile](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md),
with isolated configuration, model, `SOUL.md`, memory, sessions, skills,
credentials, cron jobs, and gateway state.

Bot Mode adds a roster, persistent Bot Chat, routines, direct mentions, group
chats, and cross-machine peers. Hermes also supports standard Agent Skills and
[local or remote MCP servers](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md).

Hermes profiles can already be exported or published as Hermes-specific Git
distributions. AgentPlaybooks should complement that format: a Hermes
distribution is one deployment output, while the playbook remains portable to
other runtimes.

## Integration status

| Capability | Grok Bot | Hermes Bot Mode |
|---|---|---|
| Read a public playbook | Available through web/Markdown exports | Available through web exports or MCP |
| Use hosted playbook MCP | No documented attachment point | Supported as remote HTTP MCP |
| Use Agent Skills locally | No documented import surface | Current CLI syncs standard skills to `~/.hermes/skills/` |
| Create a platform Bot/profile | Not available through a documented external API | Hermes CLI supports profiles; AgentPlaybooks does not automate this yet |
| Full playbook deployment | Planned after a supported xAI surface exists | Planned profile-aware CLI adapter |
| Drift detection | Planned | Existing skill drift detection; full profile drift planned |

## Recommended product model

Do not make a runtime-specific Bot the canonical object.

### Playbook

One playbook defines one agent:

- persona and standing instructions;
- Agent Skills;
- MCP and OpenAPI connections;
- durable memory and memory policy;
- secret names and requirements, never portable secret values;
- workflow and artifact conventions.

### Deployment

A deployment binds a playbook to a runtime instance:

```json
{
  "playbook": "research-agent-guid",
  "target": "hermes",
  "externalId": "researcher",
  "sourceRevision": "sha256:...",
  "lastSyncedAt": "2026-08-18T10:00:00Z",
  "status": "in_sync"
}
```

The deployment owns target-specific settings and tracks drift. It does not
become the source of truth for the agent.

### Team or fleet

A team combines multiple playbooks without merging their identities or
memories:

```yaml
name: product-launch
members:
  - playbook: coordinator
    role: chief-of-staff
  - playbook: researcher
    role: research
  - playbook: writer
    role: communications
groups:
  - name: launch-room
    members: [coordinator, researcher, writer]
handoffs:
  - from: researcher
    to: writer
    artifact: research-brief
```

This is the portable equivalent of a Grok Bot group or Hermes Bot Mode roster.
Each member stays independently deployable.

## Hermes deployment mapping

The first native implementation should target Hermes because the relevant
formats and commands are open.

| AgentPlaybooks component | Hermes deployment output |
|---|---|
| Persona | profile `SOUL.md` |
| General instructions | preserved as distribution/project instructions |
| Skills | profile `skills/<name>/SKILL.md` |
| MCP servers | profile `mcp.json` or `config.yaml` `mcp_servers` entries |
| Required secrets | `.env.EXAMPLE`; values remain local |
| Routines | profile `cron/` definitions once routines enter the portable schema |
| Runtime memory | opt-in import/export only; never silently overwritten |

Proposed CLI:

```bash
# Preview only
apb deploy <id-or-guid> --target=hermes --profile=researcher

# Apply after reviewing the plan
apb deploy <id-or-guid> --target=hermes --profile=researcher --apply

# Compare target state with the canonical playbook
apb deployments diff --target=hermes --profile=researcher
```

The adapter must retain the existing CLI guarantees: plan first, backups,
explicit conflicts, no silent overwrite, and no secret values in the portable
manifest.

## Grok Bot bridge

Until xAI publishes a supported Bot integration surface, use the least
privileged route that fits the task:

1. For public, read-only material, give the Bot the playbook's Markdown URL:

   ```text
   https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=markdown
   ```

2. For browser work, let the Bot use the AgentPlaybooks application as it
   would another website. Do not place account-wide API keys in chat messages.
3. For private or write-back workflows, wait for scoped access grants or use a
   dedicated playbook-scoped credential through a secure credential flow.
4. Keep the canonical persona, skills, and selected durable memory in the
   playbook so a future native connector can deploy them without migration.

The planned access-grant model is particularly important for computer-using
Bots: one short-lived, revocable grant should authorize one Bot, one playbook,
an explicit operation allowlist, and optionally one workflow run.

## Shared API surface

Both runtime adapters should call the same canonical playbook operations that
already power the dashboard:

```text
User control-plane MCP:  POST /api/mcp/manage
Playbook MCP:            POST /api/mcp/:guid
User OpenAPI/REST:       POST /api/control/:operation
Playbook OpenAPI/REST:   POST /api/playbooks/:guid/operations/:operation
Playbook OpenAPI spec:   GET  /api/playbooks/:guid?format=openapi
```

A platform adapter translates configuration and credentials. It must not
reimplement playbook business logic.

## Delivery roadmap

1. Add the scoped access-grant primitive for safe computer-use and external
   agent access.
2. Extend the CLI with a profile-aware Hermes deployment adapter.
3. Introduce deployment records, revision hashes, and two-way drift reports.
4. Add a portable team/fleet manifest and routine schema.
5. Build a native Grok Bot adapter only when xAI exposes a supported API or
   import/export surface.

This ordering gives Hermes users a concrete integration quickly and prepares a
safe connection model for Grok Bot without reverse-engineering a private beta.
