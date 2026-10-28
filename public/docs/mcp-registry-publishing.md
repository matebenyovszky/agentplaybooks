# Publish AgentPlaybooks to the Official MCP Registry

AgentPlaybooks exposes a remote Streamable HTTP MCP server at:

```text
https://agentplaybooks.ai/api/mcp/manage
```

The registry metadata is stored in the repository root as `server.json`. The
entry uses the custom-domain namespace `ai.agentplaybooks/agentplaybooks` and
is authenticated using a public proof file served from `agentplaybooks.ai`.

## Before publishing

Deploy the current `main` branch and verify the public endpoint:

```powershell
$body = @{
  jsonrpc = "2.0"
  id = 1
  method = "initialize"
  params = @{
    protocolVersion = "2025-11-25"
    capabilities = @{}
    clientInfo = @{ name = "registry-check"; version = "1.0.0" }
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri "https://agentplaybooks.ai/api/mcp/manage" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

Tool execution requires an AgentPlaybooks user API key in the
`Authorization: Bearer apb_live_...` header. Discovery and initialization do
not require a key.

## Publish automatically

The **Publish MCP Registry** GitHub Actions workflow publishes the exact
`server.json` from a released CLI tag after the **Publish CLI** workflow
succeeds. It runs from protected `main`; it never executes code from the
release tag. The tag must point to a commit included in `main`, the CLI and
registry versions must agree, and the npm version must already be public.

The Ed25519 seed is stored as `MCP_REGISTRY_PRIVATE_KEY` in the
`mcp-registry-publish` GitHub environment. That environment allows protected
branches only. Never commit, print, or attach the private key to build artifacts.
Only its public proof belongs in the `/.well-known/mcp-registry-auth` route.

For an existing release, dispatch from `main`:

```sh
gh workflow run publish-mcp-registry.yml --ref main -f release_tag=cli-v0.8.0
```

Deploy the matching public proof before running the workflow. When rotating the
publisher key, update the environment secret and the public proof together;
the previous key stops authenticating after the new proof is deployed.

The workflow checks the official publisher archive against a pinned checksum,
authenticates with the domain proof, publishes, and verifies the exact version
is active. Re-running an already active version is a no-op. This does not
publish to Cursor, OpenAI, or other manually reviewed plugin directories.

Verify the result:

```powershell
Invoke-RestMethod "https://registry.modelcontextprotocol.io/v0.1/servers?search=ai.agentplaybooks/agentplaybooks&version=latest"
```

Do not commit the private key. The proof file contains only the corresponding
public key and is safe to deploy.

## Repair the accidental historical latest record

The early `1.0.0` record was published by mistake. Deprecating it leaves it
eligible for the registry's highest-version selection. After publishing and
verifying an active replacement, the manual **Repair MCP Registry latest**
workflow can hide only that historical record and verify the result:

```sh
gh workflow run repair-mcp-registry-latest.yml --ref main -f expected_version=0.8.0
```

The workflow checks that the replacement is active and that `1.0.0` is already
deprecated or deleted. It uses the protected publisher environment, runs no
release-branch code, retains the historical record with `include_deleted=true`,
and fails unless `latest` resolves to the expected active release. It does not
delete the namespace or any active version. Normal publishing stays in the
separate automatic workflow.
