# Cloudflare API execution

`worker.ts` dispatches native Request/Hono API routes directly, using the same
route exports and authorization helpers as Next.js. MCP, operation HTTP
projections, memory, canvas, secrets, runs, and the Hono REST catch-all therefore
avoid the Next server wrapper and its response lifecycle `waitUntil` task.
The playbook export, collaboration, snapshot, backup, connection catalogue,
registry search, and site-wide/per-playbook OAuth/skill discovery routes also use native
Request/Response handlers. Frontend pages still use OpenNext.

`scripts/generate-worker-api-routes.mjs` generates the dispatch manifest during
prebuild. It includes reservations for Next-specific routes so the REST catch-all
cannot shadow them. Specific routes take precedence over dynamic segments.
Handler modules are loaded lazily: public metadata does not initialize the MCP,
snapshot, secret, or Next page implementations. Catch-all parameters retain their
array shape, including optional empty paths. The configuration test re-export is
included explicitly. Unsupported methods, HEAD, and OPTIONS retain route-handler semantics. API
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

Only full-document GETs of `/`, `/docs`, `/blog`, and published public Markdown
document/post paths without query strings, credentials,
session cookies, conditional/range headers, or Next/RSC headers are eligible for
the public HTML Cache API. `NEXT_LOCALE` is the only accepted cookie; cache keys
use the same locale selector as SSR plus the origin and Worker version ID.
Successful HTML is retained for five minutes, concurrent fills are coalesced,
and errors, redirects, Set-Cookie, JSON, and Vary-star responses are not stored.
Browser/CDN responses remain `no-store`, avoiding implicit locale or RSC mixing.
Authenticated pages and all API responses bypass this HTML cache. Changes that
introduce personalized server rendering on any allowlisted page require
removing that page from the cache allowlist. `generate-public-page-paths.mjs`
builds this exact path list from public Markdown filenames; unknown slugs,
subroutes, and asset requests are excluded. The manifest contains paths only,
so loading the Worker does not load the embedded blog content index.

The unpublished `/.well-known/traffic-advice` policy answers its existing 404
directly, without initializing Next to render a not-found page.

Registry search has its own bounded five-minute public-data cache with eight
entries and concurrent-load coalescing; upstream headers and bodies share a
ten-second timeout and a 2 MiB body limit. Credentials are never forwarded to
the registry or stored in cache keys.

The first uncached SSR render in a location still needs Next initialization.
This design reduces repeat and new-isolate work after a page has been cached;
it does not promise that every cold render fits the free-plan CPU allowance.
