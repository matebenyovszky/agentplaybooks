# ChatGPT directory notes (reviewer blockers)

This is an in-repo checklist. It does **not** claim a listing in the ChatGPT
Plugins Directory, the official Claude marketplace, or any other catalog.

Do not submit from this PR. Verified identity (Mate) is outside this change.

The **Skills-only** ZIP (plugin.json + SKILL.md, no account MCP) is a separate
upload path. How to build it, what it contains, and the Mate-yes hold for
listing copy: [`openai-skills-directory-zip.md`](./openai-skills-directory-zip.md).

## Remote MCP (hosted)

- Transport: Streamable HTTP
- URL: `https://agentplaybooks.ai/api/mcp/manage`
- Auth, two modes on the same endpoint:
  - **OAuth 2.1 with PKCE (default).** An unauthenticated call returns `401`
    with `WWW-Authenticate: Bearer resource_metadata="https://agentplaybooks.ai/.well-known/oauth-protected-resource/api/mcp/manage"`.
    That metadata names the Supabase Auth authorization server, which
    advertises dynamic client registration, `authorization_code` +
    `refresh_token`, and `S256` PKCE. The user approves on `/oauth/consent`.
  - **API key.** `Authorization: Bearer <user API key>`, for automation and CI.
    Key shape: `apb_live_…` (also accepted as `apb_…`).

Playbook-scoped MCP (`/api/mcp/<guid>`) answers with the same OAuth challenge
(pointing at its own protected-resource metadata) and accepts the same Bearer
key pattern.

An earlier version of this file said the endpoint was not OAuth and had no
protected-resource metadata. That was true when it was written and is not any
more; describe OAuth as the default.

## Tool surface (do not shrink)

`tools/list` on `/api/mcp/manage` advertises **50** tools:

- 7 account tools
- 43 playbook tools, including `find_tools`, `use_secret_write` and
  `get_memory_history`

Playbook tools on the manage endpoint require `playbook_id`.

## Positive test cases (5)

Use a valid user API key with at least `playbooks:read`, `skills:read`, and
`memory:read`. Replace `$KEY` and `$PLAYBOOK_ID`.

1. **list_playbooks** — account tool, no `playbook_id`.
   `tools/call` name `list_playbooks` with `Authorization: Bearer $KEY`.
   Expect a list of playbooks for that user (possibly empty).
2. **get_playbook** — `playbook_id` of a playbook the key can read.
   Expect persona, skills summary, servers, and memory for that playbook.
3. **list_skills** — same `playbook_id`.
   Expect the skills attached to that playbook.
4. **search_memory** — same `playbook_id`, optional `search` string.
   Expect matching memory summaries (possibly empty).
5. **find_tools** — same `playbook_id`, `query` e.g. `memory`.
   Expect catalog hits with name, description, and input schema. `find_tools`
   must remain on the surface.

## Negative test cases (3)

1. **Missing Bearer / missing key.** Call `list_playbooks` with no
   `Authorization` (and no `X-API-Key`). Expect `401` with the OAuth
   `WWW-Authenticate` challenge; the tool must not run.
2. **Invalid key.** Call `list_playbooks` with `Authorization: Bearer apb_live_not-a-real-key`.
   Expect rejection; the tool must not run.
3. **Mutating method on `use_secret`.** Call `use_secret` with
   `method: "POST"` (or PUT/PATCH/DELETE). Expect refusal. Writes go through
   `use_secret_write` only (`method` enum GET/HEAD on `use_secret`).

## Other blockers (not this PR)

- Live privacy URL after deploy: `https://agentplaybooks.ai/privacy` (must be
  HTTP 200, not 404). Same path on `apbks.com` if it is the same worker.
- Directory identity verification is Mate’s, not this PR.
- Marketing does not submit Cursor Marketplace, Claude Console, or the ChatGPT
  directory from this change.
