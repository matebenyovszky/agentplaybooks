# Claude Connectors Directory notes (submission prep)

This is an in-repo checklist for submitting the hosted MCP server to the
[Claude Connectors Directory](https://claude.com/docs/connectors/building/submission).
It does **not** claim a listing. Submission happens in the claude.ai submission
portal, by a person with directory access — not from this repository.

Everything below was checked against the live service or `main`; the parts
that are not code are listed at the end as blockers.

## What gets submitted

- **Server:** `https://agentplaybooks.ai/api/mcp/manage`
- **Transport:** Streamable HTTP
- **Every user connects to the same URL.** The per-playbook endpoint
  (`/api/mcp/<guid>`) is a different URL per playbook and is not what gets
  listed; the manage endpoint reaches every playbook a user can access through
  `playbook_id`.

## Portal step by step

**Connection** — the URL above, Streamable HTTP, same URL for everyone.

**Tools** — the portal syncs these from the live server and groups them by
annotation. All 50 carry a `title` and both `readOnlyHint` and
`destructiveHint`, so none land in the "no annotations" group:

| Group | Count | Preset |
|---|---|---|
| Read-only | 17 | `READ_CLOSED` ×16, `OPEN_WORLD_READ` ×1 (`use_secret`) |
| Write, non-destructive | 17 | `WRITE_CLOSED` ×8, `IDEMPOTENT_WRITE_CLOSED` ×9 |
| Write, destructive | 16 | `DESTRUCTIVE_CLOSED` ×14, `OPEN_WORLD_CALL` ×2 |

`tests/api/tool-schema-conformance.test.ts` fails CI if a tool loses its title
or a hint, so this stays true.

**Listing** — name (≤100), tagline (≤55), description (≤2000), 1–5
categories, icon, and a permanent slug. The copy is the maintainer's call.
URLs that fill the remaining fields:

- Documentation: `https://agentplaybooks.ai/docs/management-api` (has a
  "For Claude" setup section)
- Privacy policy: `https://agentplaybooks.ai/privacy` — see blockers
- Icon: `https://agentplaybooks.ai/icon.svg`

**Use cases** — reads *and* writes: the connector manages the user's own
playbooks (skills, memory, canvas documents, runs, federated servers,
secrets). Before connecting, a user needs an AgentPlaybooks account.

**Authentication** — both modes work, and the portal supports both:

- **OAuth 2.1 with PKCE (default).** An unauthenticated call returns `401` with
  `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/mcp/manage"`.
  The protected-resource metadata names the Supabase Auth authorization
  server, whose metadata advertises a `registration_endpoint` — so Claude can
  **register automatically** (dynamic client registration). Grants:
  `authorization_code` and `refresh_token`; `S256` PKCE; `none` client auth for
  public clients; `offline_access` scope. The user approves on
  `/oauth/consent`.
- **API key.** A User API Key (`apb_live_…`) as `Authorization: Bearer`, set
  under "Request headers" with "No sign in" — for shared or automated setups.

**Data handling** — first-party API (our own service, our own domain). No
personal health data, no sponsored content.

**Test & launch** — needs a *fully populated* test account (see blockers).
Every tool should be exercised through MCP Inspector or as a custom connector
before submitting.

## Pre-empting reviewer questions

- **"Memory" is the playbook's, not Claude's.** The criteria reject tools that
  query Claude's memory, chat history or files. `read_memory`,
  `write_memory`, `search_memory` and friends operate on the playbook's own
  key-value store in our database — data the user put there through this
  service. It is worth saying so in the description field.
- **`use_secret` is split.** Safe methods (`GET`, `HEAD`) on `use_secret`
  (read-only), mutating ones on `use_secret_write` (destructive). One tool
  spanning both is a listed rejection reason; the split is enforced by tests.
  Both accept a caller-chosen URL, and both descriptions point to the target
  API's own documentation, as the rule for freeform-URL tools requires.
- **`call_connected_tool`** calls a tool on a server the user federated into
  their own playbook. It is annotated destructive and open-world, so Claude
  always asks before running it.
- **Tool descriptions** were scanned for instruction-to-the-model patterns;
  the only "system prompt" mentions describe the persona *field* being edited.

## Test cases for the reviewer

Positive (OAuth or API key):

1. `list_playbooks` — no arguments. Returns the account's playbooks.
2. `get_playbook` with a `playbook_id`. Returns persona, skills summary,
   servers and memory.
3. `list_skills` with the same `playbook_id`.
4. `search_memory` with the same `playbook_id` and a `search` string.
5. `find_tools` with `query: "memory"`. Returns catalog entries with schemas.

Negative:

1. No credential → `401` with the OAuth challenge; nothing runs.
2. `Authorization: Bearer apb_live_not-a-real-key` → rejected.
3. `use_secret` with `method: "POST"` → refused, naming `use_secret_write`.

## Blockers (not code)

- **Privacy policy completeness.** `/privacy` returns `200`, but its copy is
  four short paragraphs and is marked *locked* in `src/lib/legal-copy.ts`.
  The directory states that missing or incomplete privacy policies are an
  immediate rejection, and lists what a policy must cover: data collection,
  usage and storage, third-party sharing, data retention, and contact
  information. The current copy says nothing about third-party processors
  (Supabase, Cloudflare) or retention, and offers a repository link rather
  than a contact. Expanding it is the copy owner's decision.
- **Organization.** The portal is part of claude.ai organization settings: a
  Team or Enterprise organization, submitted by an Owner (or, on Enterprise, a
  role with the Directory permission).
- **Test account.** Reviewers need credentials for a fully populated account:
  playbooks with skills, memory entries, a canvas run, and at least one secret,
  so that every tool has something real to act on.
- **Public documentation by the publish date** — the docs above are live.
