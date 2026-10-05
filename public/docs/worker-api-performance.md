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

## Public HTML produced during deployment

`generate-public-html.ts` starts the built standalone Next server on loopback
during the Worker build and produces complete HTML for every reviewed public
path in English, Hungarian, German and Spanish. Only public Markdown and
localized README files are supplied. Requests have no cookies or credentials;
private secret/token/password environment variables are removed from the
renderer's environment and their values are checked against the generated HTML.
The build fails for non-200 responses, cookies, an incorrect locale, missing
client assets, loopback URLs or HTML exceeding 2 MiB. The output is deployment
assets, not embedded Worker source; no snapshot content is loaded by API calls.

Eligible anonymous GET/HEAD requests read the locale-specific file through the
ASSETS binding before initializing Next or using the fallback HTML Cache API.
This also avoids Next rendering on the first request in a new location when
the asset cache is empty. `X-APB-Page-Source: STATIC` and
`X-APB-Page-Cache: ASSET` identify this path. The same private-cookie, credential,
query, router/RSC and conditional/range exclusions apply. HEAD has no body,
security headers are restored, and browser responses remain `no-store` to
prevent locale mixing. Asset ETags/Last-Modified are not exposed as validators
for the locale-varying public URL.

Missing/unavailable assets fall back to Next and the bounded HTML Cache API.
Private pages, RSC navigation and requests excluded from the public policy still
need Next; this change does not promise every such cold render fits the
free-plan CPU allowance.
