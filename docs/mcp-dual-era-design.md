# Serving both MCP eras

Status: phases 0-2 done; phase 3 unscheduled

## What happened

A playbook could not be added as a custom connector in Claude. Three fixes went
in before the real cause surfaced, and all three were the same mistake in
different clothes: **the endpoint claimed to be something it is not.**

- `404` for a private playbook claimed the URL did not exist, so clients
  reported a dead server instead of asking for a credential.
- `WWW-Authenticate: Bearer` claimed to be an OAuth protected resource, so
  clients started a flow that cannot complete — there is no metadata endpoint.
- `400 {"error": "Unsupported MCP protocol version"}` claimed to be a modern
  server that could not serve the version, but carried neither `-32022` nor a
  `data.supported` list to retry against.

None of it showed up in tests, because our own clients speak the same dialect we
serve. Only a spec-conforming stranger found it.

## The actual gap

Revision **2026-07-28** is current, and it is not an increment. It removed the
`initialize` handshake and protocol-level sessions. Version, identity and
capabilities travel as per-request `_meta`, mirrored into required HTTP headers.
The spec calls the two worlds *modern* (2026-07-28 and later) and *legacy*
(2025-11-25 and earlier), and its compatibility matrix is blunt about the two
combinations we are in:

| Client | Server | Outcome |
|---|---|---|
| Dual-era | Legacy | **Works** — if the legacy server does not pretend to be modern |
| Legacy | Modern | **Fails** — legacy clients have no fall-forward |

We are on both sides of that table, and only one side is currently safe:

- **As a server**, we are legacy. A dual-era client (Claude) reaches us by
  falling back, which now works — that was the third fix. Good enough to
  connect, but every modern client pays a wasted round trip, and a
  *modern-only* client cannot reach us at all.
- **As a client**, our MCP federation is legacy: it opens with `initialize` and
  tracks `Mcp-Session-Id`. Against a modern-only upstream that fails outright,
  and the failure lands on the user as "the federated server does not work".
  This is the more urgent half, because the upstreams people actually add —
  Cloudflare's and Supabase's hosted MCP servers — are being built for the
  current revision.

## What modern requires of a server

Mandatory, and mostly envelope work rather than new features:

- `server/discover` — a **MUST** implement RPC returning `supportedVersions`,
  `capabilities`, `_meta['io.modelcontextprotocol/serverInfo']` and optional
  `instructions`. It is the one thing a modern client can call before it knows
  anything about us.
- Per-request `_meta`: `io.modelcontextprotocol/protocolVersion`, `clientInfo`,
  `clientCapabilities` inside `params`.
- Header/body agreement: `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name`
  (for `tools/call`, `resources/read`, `prompts/get`) must match the body, with
  the `=?base64?…?=` sentinel decoded first. A mismatch is `400` and `-32020`.
- An unsupported version is `400` and `-32022` **with** `data.supported`.
- An unknown method is `404` and `-32601` — the status is what distinguishes a
  modern server from a legacy one that simply does not host the endpoint.
- `Origin` validation: if present and invalid, `403`. We do not do this today,
  and it is the transport's stated defence against DNS rebinding.
- `GET`/`DELETE` on the endpoint: `405`. `Mcp-Session-Id` and `Last-Event-ID`:
  ignore. (The 405 for GET already landed.)

Not required for us, and deliberately out of scope until something needs them:

- **MRTR** (server→client input embedded in results) — only for sampling,
  elicitation and roots, none of which we ask for.
- **`subscriptions/listen`** — only for pushing change notifications. Nothing
  here changes under the client's feet today.
- **Per-request SSE streams** — a server MAY answer a request with plain JSON,
  which is what we do and will keep doing until there is progress to report.

## Phases

**Phase 0 — stop lying (done).** 401 instead of 404 for a protected playbook,
no OAuth challenge, no rejection of unknown protocol revisions. This is what
makes the documented fallback work at all.

**Phase 1 — modern era, server side.** Era detection in front of the existing
dispatch, envelope validation, `server/discover`, the four status/code
corrections, `Origin` validation. The tool and resource handlers are unchanged:
what differs between eras is the envelope, not the payload. A dual-era server is
explicitly allowed to serve both on one endpoint, selecting behaviour from how
the client opens — modern `_meta` means modern, `initialize` means legacy.

**Phase 2 — modern era, federation client (done).** Opens modern: one POST
carrying per-request `_meta` and the mirrored headers, no handshake and no
session. Falls back to `initialize` only when a 4xx carries no recognized
modern error, and caches that verdict per origin, because the era belongs to
the server rather than to one request. An `UnsupportedProtocolVersionError` is
followed rather than surfaced: the newest version it advertises is tried before
giving up. The connection test reports which era answered, so "reached, legacy"
shows up as the warning it is — that upstream breaks when it drops the
handshake.

**Phase 3 — the optional surface**, if and when we need it: `subscriptions/listen`
for change notifications, MRTR if a tool ever needs to ask the user something.

## The rule this leaves behind

Say what we are. A server that reports an older version honestly interoperates;
a server that hints at a capability it lacks strands the client with nothing to
fall back to. Every one of the four bugs above was a hint we could not honour.
