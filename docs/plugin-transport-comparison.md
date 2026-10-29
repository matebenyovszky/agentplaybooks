# MCP and REST/OpenAPI with skills

AgentPlaybooks already offers both surfaces. Account operations are available
through `POST /api/control/<operation>` with a JSON argument object, described
by `/api/manage/openapi.json`. For example, a small local CLI can submit
`{"playbook_id":"<UUID>"}` to `/api/control/list_skills`.

These routes invoke the same management and playbook operation handlers as MCP.
REST therefore removes the wire protocol envelope and client MCP discovery
dependency, not the backend authorization, database access or operation work.
OpenAPI describes a contract; it does not itself execute requests or provide
authentication. A skill needs an available shell/runtime and a credential-aware
client to use this path.

## Measurement on 2026-10-29

`scripts/benchmark-hosted-transports.mjs --playbook=<UUID>` performs one warm-up
per transport and ten measured requests per transport, alternating order. It
uses the same CLI credential, operation and playbook, verifies the same skill
IDs, stops on any refusal, and prints timings and byte counts without response
bodies or credentials. It only calls the read-only `list_skills` operation.

| Warm HTTP operation | MCP | REST |
|---|---:|---:|
| Samples | 10 | 10 |
| Median | 690 ms | 686 ms |
| Minimum–maximum | 656–821 ms | 646–706 ms |
| Mean response size | 2954 bytes | 1278 bytes |

This small sample shows essentially equal HTTP latency and a 57% smaller REST
response. It does not establish a model-level speed or token-cost advantage.
Model turns, cached MCP discovery, shell process startup, schema context,
OAuth connection/refresh and the execution host's network are excluded. Both
transports use Node fetch from the same process with connection reuse.

### Token estimate

Counting the same responses and live schemas with `o200k_base` gives the
following illustrative counts. This is a tokenizer proxy, not measured billing
or the actual context sent by a particular host/model.

| Serialized material | Estimated tokens |
|---|---:|
| Complete MCP wire response | 988 |
| REST response | 423 |
| MCP structured result alone | 423 |
| MCP text result alone | 496 |
| MCP single `list_skills` tool definition | 330 |
| REST single OpenAPI operation | 384 |
| MCP compact core catalog (16 tools) | 5281 |
| Complete management OpenAPI document | 24410 |

The MCP wire response carries both structured and text forms. A host need not
show both to the model, so comparing raw wire envelopes exaggerates a possible
REST advantage. The equivalent structured data costs the same. Loading the
entire OpenAPI specification is substantially more expensive than focused
operation discovery; the same principle applies to loading every MCP schema.

For interactive model use, prefer native MCP with deferred/focused schemas,
bounded results and the workflow skill. A CLI/REST wrapper is useful when it
filters or aggregates many authorized operations before returning a small
result. That saving comes from controlling context and model turns, not from
REST itself. [OpenAI tool search](https://developers.openai.com/api/docs/guides/tools-tool-search)
documents deferred loading and cache preservation for this purpose.

## Choosing a surface

| Concern | Native MCP with skill | Local CLI/REST with skill |
|---|---|---|
| Discovery | Host-managed structured tools; compact core plus focused discovery | CLI commands or focused OpenAPI operation lookup |
| Credentials | Host OAuth connection | Separate CLI login/store or environment reference |
| Execution requirements | Compatible MCP host and remote endpoint | Shell/runtime, networking and configured CLI credentials |
| Permissions | Server enforces account scope and playbook role | Same server enforcement; no broader access |
| Batching/filtering | Host code mode where supported | Script can process results and issue authorized reads in one invocation |
| Operational costs | Host tool loading, OAuth lifecycle | Process startup, CLI distribution, credential lifecycle |

Keep native MCP as the connected chat surface, with an explicitly selected
CLI/REST option for desktop/headless workflows that have a runtime. Both can
reuse the existing operation implementation. Avoid automatic transport fallback
after an authorization refusal, and never copy host OAuth tokens into a CLI.
The local CLI should resolve its own login internally, accept operation inputs
from stdin or files, hide credentials and return bounded structured output.
It must preserve effect annotations and the user's authorized scope.

Sources: [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins),
[skills](https://developers.openai.com/plugins/build/skills), and the repository's
`src/app/api/control/[operation]/route.ts` and `_shared/operation-http.ts`.
