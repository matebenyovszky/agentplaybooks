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

Hermes profiles can be exported or published as Hermes-specific Git
distributions, and that is now how a playbook becomes a Bot. A Hermes
distribution is one deployment output; the playbook remains portable to other
runtimes.

```bash
apb pull <playbook-guid> --apply            # the playbook onto disk
apb export hermes ./bots/research --apply   # as a Hermes distribution
hermes profile install ./bots/research --name research
apb sync --target=hermes --profile=research --apply
```

The first two commands are AgentPlaybooks', the third is Hermes' own installer,
and the fourth gives the new Bot a working configuration. That last step is not
optional: unlike `hermes profile create`, `profile install` copies no
`config.yaml`, so a Bot installed from a distribution has no providers and no
model until something seeds one. `sync --profile=<bot>` seeds it from the
installation's own configuration and merges the playbook's MCP servers into it.

A distribution deliberately carries no `config.yaml` of its own, because
`profile install` replaces that file rather than merging it: shipping one would
overwrite the providers the machine is configured for and pin the Bot's model
to whatever was true when it was exported. Which model a Bot runs is a local
decision.

Later changes travel the same way. Re-run `pull` and `export hermes`, then
`hermes profile update research`: the distribution's files are replaced, and
the Bot's sessions, memories and configuration are not touched.

Because a Bot is a playbook, sharing the playbook shares the Bot. A colleague
who accepts a collaboration invite runs the same four commands and has the same
agent, with their own memory and history.

## Integration status

| Capability | Grok Bot | Hermes Bot Mode |
|---|---|---|
| Read a public playbook | Available through web/Markdown exports | Available through web exports or MCP |
| Use hosted playbook MCP | No documented attachment point | Supported as remote HTTP MCP |
| Use Agent Skills locally | No documented import surface | CLI syncs standard skills, with the files they bundle, to `~/.hermes/skills/` or into a Bot's own profile |
| Create a platform Bot/profile | Not available through a documented external API | `apb export hermes` writes the distribution `hermes profile install` reads |
| Full playbook deployment | Planned after a supported xAI surface exists | Available: persona, skills and their bundled files as a distribution, MCP servers and model through `sync --profile` |
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
| Runtime memory | opt-in [native memory provider](./hermes-memory.md) backed by a private playbook per profile; existing local memory is not bulk-imported |

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
