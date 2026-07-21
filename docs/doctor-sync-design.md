# AgentPlaybooks Doctor & Sync

Status: working design for the first CLI release (`v0.1`)

## Product promise

AgentPlaybooks keeps an agent's operating configuration consistent across AI
clients, teams, edge runtimes, and physical robots. The portable unit is a
Playbook: instructions, skills, tool connections, memory policy, secret
references, deployment targets, and safety policy.

The first user-facing wedge is intentionally smaller:

```text
agentplaybooks doctor  -> inspect locally, make risk and drift visible
agentplaybooks sync    -> create a safe, reviewable synchronization plan
```

Both commands are local-only by default. Neither command uploads telemetry or
configuration without an explicit opt-in.

## Doctor

`doctor` discovers agent configuration beneath a project directory and reports:

- Agent instruction files such as `AGENTS.md`, `CLAUDE.md`, and platform files.
- Agent Skills (`SKILL.md`) and basic Agent Skills specification violations.
- MCP configuration in known JSON and Codex TOML locations.
- Likely hard-coded credentials without printing credential values.
- Insecure remote MCP URLs.
- Same-named skills or MCP servers whose definitions drift across platforms.
- An inventory and a deterministic 0-100 health score.

The default command is diagnostic and exits successfully even when it finds
warnings. `--strict` makes high or critical findings fail CI. `--json` provides
stable machine-readable output. Home-directory configuration is out of scope
unless the user explicitly passes `--global`.

Future doctor adapters can add runtime checks without changing the core report:

- MCP handshake and tool-schema checks (`--network`).
- Skill malware and prompt-injection scanning.
- ROS 2 package, node, topic, service, action, and QoS validation.
- OPC UA and industrial gateway validation.
- Signed artifact, policy, approval, and audit checks for enterprise targets.

## Sync lifecycle

Sync is deliberately not blind two-way copying.

1. **Discover** local platform files.
2. **Normalize** them into `agentplaybook.json`.
3. **Plan** a diff against the last synchronized state and optional remote state.
4. **Review** conflicts, secret references, and target-specific changes.
5. **Apply** only with an explicit `--apply`.
6. **Verify** generated files and record hashes for the next three-way diff.

The initial CLI implements local manifest planning and atomic manifest writes.
Platform file generation, remote push/pull, and three-way conflict resolution
will be added behind this same lifecycle.

Safety rules:

- `agentplaybooks sync` is plan-only.
- Non-interactive mutation requires `agentplaybooks sync --apply`.
- Existing files are backed up before replacement.
- Secret values never enter the manifest; only environment, vault, or platform
  references are allowed.
- Conflicts never silently use last-write-wins.
- A robot configuration deployment does not authorize physical actuation.
- Physical actions default to deny and require a separate runtime policy,
  approval path, and emergency-stop capability.

## Portable manifest

The first canonical representation is JSON so it can be parsed without adding
a runtime dependency. A JSON Schema lives at
`schemas/agentplaybook-v1alpha1.schema.json`. YAML can be supported as a view
later while JSON remains the wire format.

The manifest is extensible through deployment targets:

- Developer agents: Codex, Claude, Cursor, Copilot, Gemini, generic MCP.
- Robot and edge: ROS 2, OPC UA, generic edge runtime.
- Enterprise: approved gateway, environment promotion, signing and policy.

Robot support belongs in the core model, but hardware-specific execution stays
in adapters. A Playbook describes capabilities and policy; a ROS 2 adapter, for
example, maps approved capabilities to nodes, topics, services, and actions.

Enterprise scope is layered rather than forked:

```text
organization policy -> team playbook -> project playbook -> device/runtime overlay
```

The closest layer may specialize behavior but cannot weaken enforced parent
policy. Production promotion can later require approval and a signed immutable
manifest digest.

## Brand and domains

Recommended domain policy:

- `agentplaybooks.ai`: canonical website, documentation, dashboard, and brand.
- `api.agentplaybooks.ai`: canonical public API and MCP endpoints.
- `apbks.com`: short links and redirects only, for example `apbks.com/p/<id>`.
- CLI/package: `apb` and `@agentplaybooks/cli`.

This keeps the memorable descriptive brand while retaining the useful short
domain. Search engines and documentation see one canonical host; QR codes,
robots, terminals, and spoken links can use the short domain.

## Delivery sequence

1. Local doctor, JSON output, strict CI mode.
2. Local manifest plan/apply with backups.
3. Platform adapters and three-way sync state.
4. Authenticated remote push/pull and team collaboration.
5. GitHub Action, health badge, and opt-in aggregate health index.
6. ROS 2 inventory/validation adapter.
7. Enterprise policies, approvals, signing, audit, and gateway deployment.
