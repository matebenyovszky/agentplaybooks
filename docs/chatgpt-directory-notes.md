# ChatGPT directory notes (reviewer blockers)

This is an in-repo checklist. It does **not** claim a listing in the ChatGPT
Plugins Directory, the official Claude marketplace, or any other catalog.

Do not submit from this PR. Verified identity (Mate) is outside this change.

## Remote MCP (hosted)

- Transport: Streamable HTTP
- URL: `https://agentplaybooks.ai/api/mcp/manage`
- Auth: OAuth 2.1 account login, with `Authorization: Bearer <user API key>` as
  a CLI/headless fallback.
- Key shape: `apb_live_…` (also accepted as `apb_…`).
- Protected-resource metadata is served at both
  `/.well-known/oauth-protected-resource` and
  `/.well-known/oauth-protected-resource/api/mcp/manage`.
- The authorization server is the configured Supabase Auth issuer. Before a
  hosted submission, enable Supabase's OAuth 2.1 server, set its authorization
  path to `https://agentplaybooks.ai/oauth/consent`, and verify its discovery
  document returns HTTP 200. The application consent page is implemented, but
  the resource code alone does not enable the authorization server.

Playbook-scoped MCP (`/api/mcp/<guid>`) uses the same Bearer key pattern.

## Tool surface (do not shrink)

`tools/list` on `/api/mcp/manage` advertises **49** tools:

- 7 account tools
- 42 playbook tools, including `find_tools` and `use_secret_write`

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

1. **Missing OAuth session / missing key.** Call `list_playbooks` with no
   `Authorization` (and no `X-API-Key`). Expect an error tool result with an
   `mcp/www_authenticate` challenge; the tool must not run.
2. **Invalid key.** Call `list_playbooks` with `Authorization: Bearer apb_live_not-a-real-key`.
   Expect rejection.
3. **Mutating method on `use_secret`.** Call `use_secret` with
   `method: "POST"` (or PUT/PATCH/DELETE). Expect refusal. Writes go through
   `use_secret_write` only (`method` enum GET/HEAD on `use_secret`).

## Deployment blockers (outside the resource code)

- Supabase OAuth discovery must be live at
  `/.well-known/oauth-authorization-server/auth/v1` on the configured Supabase
  project. A 404 means the OAuth server is still disabled.
- Supabase's authorization path must point to the deployed `/oauth/consent`
  page, and dynamic client registration must be enabled (or the submitting
  client must be registered explicitly).
- Complete one authorization-code + PKCE login against the deployed management
  MCP and confirm the returned access token resolves to the signed-in Supabase
  user.

## Other blockers

- Live privacy URL after deploy: `https://agentplaybooks.ai/privacy` (must be
  HTTP 200, not 404). Same path on `apbks.com` if it is the same worker.
- Directory identity verification is Mate’s, not this PR.
- Marketing does not submit Cursor Marketplace, Claude Console, or the ChatGPT
  directory from this change.
