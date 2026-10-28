# Local MCP transport

The hosted service uses Streamable HTTP. For clients and build inspectors that
require stdio, the repository also provides a local entrypoint:

```sh
npm ci
npm run --silent mcp:stdio
```

The MCP SDK handles the stdio protocol. The tool catalog is built from the same
`ACCOUNT_TOOLS` and playbook projection used by `/api/mcp/manage`. Tool execution
calls that route's handler **in the local process**, retaining its API-key,
ownership and permission checks. It does not proxy a hosted MCP endpoint.
Standard output is reserved for MCP messages.

The default catalog contains 15 common tools, including `find_tools` for discovering
additional operations. Set `AGENTPLAYBOOKS_TOOLSET=full` to advertise all tools for
clients that require every schema in the initial list. The `runtime`, `memory`,
`canvas`, `secrets`, and `admin` views also restrict calls to the chosen domain;
normal account permissions still apply. Unknown values fail startup.

Initialize, ping and tools/list work without a database or credentials. Calls
return an explicit configuration error until the instance is configured. To
operate on your own Supabase project, supply these environment variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your self-hosted instance's Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | That project's anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service key for that project |
| `AGENTPLAYBOOKS_API_KEY` | User API key created in that same AgentPlaybooks instance; its permissions apply |
| `SECRETS_ENCRYPTION_KEY` | Existing instance's encryption key, required for vault operations |

Apply the application's database migrations before executing tools. Keep service
and encryption keys in the server environment; never publish them in an image,
client-side bundle, source file or inspection placeholders. For the hosted
service, use its HTTP endpoint and OAuth/API-key connection instead.

## Glama configuration

Build steps: `["npm ci"]`

CMD arguments: `["./node_modules/.bin/tsx", "scripts/mcp-stdio.ts"]`

No placeholder credentials are needed for startup or introspection. The
inspector sees the real shared tool schemas; it cannot read or mutate an account
without valid instance configuration and a user API key. The web application's
root Dockerfile remains its separate HTTP deployment image.
