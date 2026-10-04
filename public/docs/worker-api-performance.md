# Cloudflare API execution

`worker.ts` dispatches native Request/Hono API routes directly, using the same
route exports and authorization helpers as Next.js. MCP, operation HTTP
projections, memory, canvas, secrets, runs, and the Hono REST catch-all therefore
avoid the Next server wrapper and its response lifecycle `waitUntil` task.
Frontend pages and Next-specific API handlers still use OpenNext.

`scripts/generate-worker-api-routes.mjs` generates the dispatch manifest during
prebuild. It includes reservations for Next-specific routes so the REST catch-all
cannot shadow them. Specific routes take precedence over dynamic segments;
unsupported methods, HEAD, and OPTIONS retain route-handler semantics. API
responses use the same security headers as Next and default to `Cache-Control:
no-store`. Authentication is checked on every request before cached discovery
content is returned; this is not a response cache or an authentication cache.

Federation timeouts cover response bodies as well as headers. SSE responses are
read incrementally until the matching JSON-RPC result/error, then cancelled;
notifications and other request IDs cannot satisfy the request. Upstream bodies
are limited to 8 MiB. This also applies to OpenAPI specifications, operations, and
OAuth token requests. Initialization notification responses are cancelled without
waiting for an unnecessary body.

Connection logs record bounded, client-declared names/versions, User-Agent, and
validated key prefixes (never tokens or request arguments). Discovery logs are
sampled at 2%; they can help diagnose reconnect/discovery loops without logging
every tool call. Client-declared identity is an attribution hint, not proof of
which program or person sent a request.
