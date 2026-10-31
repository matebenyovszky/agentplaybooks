# On-demand hosted API access

Read this when an operation is absent from the host's registered MCP functions
and an authorized HTTP executor is available. Keep the initial MCP catalog
compact. Tool discovery does not install new host functions.

## Load only the needed documentation

- `GET https://agentplaybooks.ai/api/tools?query=secret&limit=5` lists short
  public built-in summaries, without private playbooks, connected servers or values.
- `GET https://agentplaybooks.ai/api/tools/get_secret_status` returns one complete
  schema and its REST path. `?format=markdown` is a web-readable explanation;
  `?format=openapi` returns the OpenAPI document for just that operation.
- Alternatively use `find_tools` with `include_schemas=false` for short matches,
  then repeat the selected
  operation name with `include_schemas=true`. Partial keyword matches report
  `missing_terms`; they do not establish support for the missing concept.
  Older clients that omit the option still receive complete schemas.
- Connected tools are private to their playbook. Discover them through the
  authenticated connection with `playbook_id`; the public catalog contains
  built-in operation documentation only.

Do not fetch the full OpenAPI catalog, every skill body or every reference up
front. Public documentation can explain a capability without a credential;
it cannot identify an account, inspect secret state or execute an operation.

## Execute through the shared authenticated operation route

Use an existing authorized account API credential or an HTTP session the user
already configured. Never read or copy a host-owned OAuth token store. A bundled
MCP connection alone does not imply that an HTTP executor has credentials.

`POST https://agentplaybooks.ai/api/v1/control/OPERATION_NAME` accepts the operation's
JSON arguments. Playbook operations also require `playbook_id`. A direct
playbook credential can use
`POST /api/v1/playbooks/PLAYBOOK_GUID/operations/OPERATION_NAME` and omit
`playbook_id`. Both use the same permission checks and operation handlers as MCP.

Example for a locally configured account API key reference (never paste a value):

```bash
curl --fail-with-body -sS 'https://agentplaybooks.ai/api/v1/control/get_secret_status' \
  -H "X-API-Key: $AGENTPLAYBOOKS_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"playbook_id":"SELECTED_PLAYBOOK_ID","secret_name":"LOGIN"}'
```

A known secret name needs only this status lookup; no decryption, reveal call,
or complete vault listing. A successful missing-name response has
`exists=false` and `reason=secret_not_found`. An existing secret reports
`capabilities.reveal.reason=proxy_only` when reveal is disabled.
A permission or database failure means existence is unknown. REST errors
preserve `data.reason`, `data.existence` when relevant, and `data.next_steps`.

Keep credential references within the already authorized executor. Never move
tokens into web-fetch URLs or send authentication to a public documentation URL.
Do not switch transports to bypass a permission or policy denial. If no
credentialed HTTP executor or host tool refresh is available, explain that
client limit. A full MCP catalog is an explicit compatibility option, with
higher startup context cost.

## Version checks on demand

The packaged `api-compatibility.json` declares the plugin's supported API
range. Public `GET /api/versions` reports server majors, revisions and optional
features without account data or tool schemas. The unversioned REST operation
routes remain v1 aliases for older plugins. The MCP endpoint stays at its
registered OAuth resource URL; API major selection uses
`X-AgentPlaybooks-API-Version: 1` when supported. Do not confuse it with the
MCP wire-protocol revision. Refused/unknown API versions require a deliberate
client/server compatibility fix, not repeated calls or a silent fallback.
