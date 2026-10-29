# CLI and plugin 0.9.1

Codex desktop could load the AgentPlaybooks skill from 0.9.0 but silently omit
the account MCP server. Its installed portable MCP loader rejected the new
server-level `extensions` field: `unknown field extensions, expected url or
headers`. Commit 159b2a6 introduced that field in the 0.9.0 release.

The installed portable `mcp.json` now uses the compatible HTTPS server shape.
OAuth discovery remains at the same endpoint. The separate OpenAI remote ZIP
adds the explicit OAuth declaration during packaging, so the hosted submission
format keeps it without breaking the desktop package. No credentials or
permissions change.

Validation includes the portable configuration, remote ZIP contents and the
real Codex `plugin/read` parser through `scripts/smoke-codex-plugin.mjs`. The
smoke check uses a fresh isolated Codex home, does not install a plugin or log
in, and checks that the account server appears in the parsed plugin details.

## Authentication diagnosis

Successful CLI account discovery does not imply vault permission. The default
account key permissions deliberately omit `secrets:read`, `secrets:write` and
`full`. `secrets:read` is an explicit opt-in because it permits outbound
authenticated requests through the vault proxy. A regression test confirms
that a default key authenticates for playbook reads while vault access remains
denied, and that an explicit read grant does not imply secret writes.

## MCP and REST

See [the transport comparison](../plugin-transport-comparison.md) for the
existing REST/OpenAPI alternative, measured HTTP performance and boundaries.

This prepares a release; publication and authenticated Codex OAuth acceptance
remain separate from the local parser and server tests.
