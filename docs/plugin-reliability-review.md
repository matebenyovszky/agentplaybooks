# Plugin review findings and rollout

Reviewed against main e5ab047 and the current OpenAI plugin/authentication
documentation on 2026-10-28. These findings describe source and reproducible
tests, not an authenticated production ChatGPT conversation.

Release review integrated main b58337c (CLI 0.8.1) before preparing 0.9.0.
It preserves the registered MCP URL, compact core/full and pinned domain views,
stdio bridge, and upstream Hermes per-source cooldown. The new profile tool is
advertised in core and pinned navigation; full discovery is 53 tools and core 16.
Review also added protection against resurrecting locally deleted managed skill
files, backup symlink escapes, and unexpected headers in the full plugin ZIP.
The later bf51978 dashboard summary API and 7f9db23 OpenAI safety/discovery fixes
are retained. In particular, the separate hosted-directory identity uses upstream's
full-catalog URL on initial upload, without attempting to mutate an existing
registered app URL; the CLI's endpoint is unchanged.

## Hermes traffic

The memory provider had no periodic polling timer. It did perform a privacy
check on initialize and could fan out automatic lexical recall into four
keywords across eight sources (32 searches) for a nonempty conversation turn.
An otherwise unused installed provider could therefore perform HTTP requests.
The portable skills plugin itself registers no background hooks.

The patch makes initialization offline and defaults automatic recall off.
`recall_mode: automatic` restores it deliberately, with at most eight searches,
four workers, a total deadline, and digest-only duplicate suppression. Session
changes and writes invalidate the suppression state. HTTP 401/403 stops further
authenticated requests for 60 seconds. Privacy remains rechecked before writes.
Reinitialization binds new profile clients and clears recall state. Real current
Hermes imports and a temporary HTTP service verify A -> B -> A isolation.

Hermes also owns its MCP connections and reconnection behavior. This patch does
not claim to identify every production request without logs: an MCP keepalive,
host reconnect, provider prefetch, and an actual tool call are distinct sources.
Use the request User-Agent and method/path to distinguish them. Neither self-check
nor registration starts a recurring job.

## Cloud and account connections

The package already contained an HTTPS MCP URL. Its portable `mcp.json` lacked
an explicit OpenAI OAuth declaration, and the existing OpenAI directory ZIP was
intentionally skills-only. A local CLI API key also does not populate a cloud
host's OAuth connection. The skill assumed local CLI access and named a bundled
server without accounting for plugin namespaces.

The patch adds the OAuth declaration, a separate full remote ZIP, cloud-aware
skill instructions, and `get_profile` with the documented `openai/profile`
marker. Profile identity comes only from validated credentials and remains
stable across token refresh and reconnection. OAuth consent can sign out only
the current browser session and return to the same authorization request for a
different user. It does not revoke every device's session.

Management MCP now acknowledges cancellation/other notifications without a
JSON-RPC response and returns parse/envelope errors for malformed authenticated
requests. Authentication remains checked before untrusted body parsing.

`apb connection check` probes public resource and authorization-server metadata,
issuer/endpoints/PKCE, initialize, tools/list, and the profile when advertised.
Reports include a catalog digest for comparing metadata revisions. They omit
credential values and remote error bodies. A missing host tool is not proof of
a broken server, and a server probe cannot refresh a host's cached catalog.

## Cloud rollout checklist

### Hosted chat efficiency

The plugin's primary task is using hosted playbooks, skills, memory, canvas,
secrets, and connected MCP/OpenAPI tools in conversation, not running a local
CLI first. The main skill now routes these tasks directly; detailed local
doctor/sync/backup guidance lives in an optional reference packaged in both ZIPs.
Metadata and default prompts use the same chat-first positioning.

Account `list_playbooks` now selects metadata/counts only, filters a literal
case-insensitive name fragment in the database, and returns 50 entries by
default (1–100 per page). Owned and accepted-shared rows are ordered consistently,
merged before paging, and owner duplicates excluded. `offset` is bounded to
0–999 and pages stop at the first 1000 matches to keep each fetch within the
default 1000-row PostgREST window; narrow
the query to reach other names. This is not arbitrary-depth account browsing.
The existing no-options repository API still returns full rows for REST/CLI
backup compatibility. Auditor content restrictions are preserved.

Compact `get_playbook` memory is now a metadata page (20 by default, max 100),
with `memory_page.has_more` and `next_offset`; explicit `include_content=true`
keeps the full-content behavior. `find_tools` retains returned tools' effect
annotations. Neither change bypasses authorization or adds background polling.
Profile display names resolve through `profiles.auth_user_id`, not the public
publisher-profile primary key, which can differ from the authenticated ID.

Host smoke scenarios after deployment (behavioral acceptance, not yet proven
by a real cloud conversation):

| Request with known playbook ID | Expected minimal route |
|---|---|
| Read a known skill ID | `get_skill`; only requested reference sections afterward |
| Recall relevant facts | Focused `search_memory(limit=5..10)`, not a full export |
| Read one canvas section | `read_canvas` with known section ID, or TOC then section |
| GET an API using a known vault name | One `use_secret`, no secret-value read or prerequisite list |
| Use an unfamiliar connected API | Small `find_tools` result, then one matching operation |
| Switch accounts | Host reconnect → `get_profile`; discard old IDs/content |

Mocked server tests verify response bounds, continuation, literal queries,
shared/owner ordering, auditor redaction, and retained full exports. They do not
measure actual host/model latency or guarantee how many calls the host chooses.

### Registration and account checks

1. Deploy the reviewed server changes and publish the new CLI/plugin version.
2. Build `npm --prefix packages/cli run pack:openai-remote` for the remote ZIP.
   Keep the skills-only upload path separate. No listing is submitted here.
3. Connect the canonical MCP endpoint in the intended ChatGPT/Codex host with
   OAuth, or update its existing registered connection. Let the user consent.
4. Refresh tool metadata, start a new cloud conversation and request
   `get_profile`, then `list_playbooks`. Confirm the intended account.
5. Add/switch to another test account; confirm a different stable profile ID,
   then switch back and confirm the original ID. Do not test with another
   person's credentials or put keys in chat.
6. Run a negative case after disconnecting: no private data/tool execution,
   and an actionable authentication challenge. Local server tests cover this;
   the host's visible reconnection experience still needs this smoke test.

No production deployment, npm publication, host sign-out, or OAuth consent was
performed by this change. The account connection in this chat does not expose
AgentPlaybooks tools, so a cloud end-to-end success cannot be asserted here.
