# HTTP 503 and repeated private-playbook 404 investigation

Reviewed 25 October 2026, approximately 21:40 UTC (22:40 Europe/Budapest).
Source: Cloudflare production Worker events and deployment/version metadata,
cross-checked with the completed local account-consolidation operation report.
No database records, credentials, client settings or firewall rules were changed
as part of the investigation.

## HTTP 503

The 24-hour event search for `$workers.event.response.status = 503` returned 109
events. All belonged to these temporary maintenance versions:

| Version | Purpose in its deployment annotation |
| --- | --- |
| `15b295a1-6c52-4361-9526-df9c9be3b4c9` | Backed-up audit-compliance migration; restore the application afterward |
| `628cb87d-9570-4a56-a944-153e7d3dafb8` | Approved account consolidation with server-only vault re-encryption |
| `8f46af03-eb55-4085-a3a9-1135d3a7f351` | Approved account consolidation with server-only vault re-encryption |

Excluding all three versions returned **zero events**. The most recent event
was at 12:35:03 UTC. Inspected events had `outcome: ok`, 0 ms CPU and 0–1 ms
wall time: the maintenance handler deliberately returned 503, rather than the
runtime aborting execution. The account-consolidation handler used `no-store`,
`Retry-After: 120` and an `X-APB-Maintenance` marker.

Zone HTTP-error counts and Worker runtime-error counts measure different things.
An intentionally returned 503 can be marked as an error-level invocation log
while its runtime outcome remains `ok`. Do not attribute historical 503s to CPU
exhaustion without checking the invocation and deployed version.

## Private-playbook 404 pattern

The repeated anonymous playbook GETs used `Python-urllib/3.14`. Inspected 404s
had no authentication header; subsequent memory GETs from the same client IP
had an API-key header and returned 200. Request bodies, keys and memory values
were not needed for diagnosis.

This sequence matches `Client.assert_private()` in the Hermes memory provider:
an anonymous 404 is the legacy privacy proof, followed by an authenticated
memory read. It is not evidence that the private playbook is missing or that
its valid memory credential is failing. The provider invokes the check during
initialization and before writes; it has no polling timer of its own. Host
session/health/heartbeat scheduling needs to be checked on the originating
machine to establish why initialization recurs. IP address and generic user
agent alone do not establish an individual's identity.

Do not block these requests as attack traffic: doing so could break legitimate
private-memory use. Anonymous requests must continue concealing private content.

## Changes

- Hermes memory 0.3.1 uses an authenticated `private_check=1` memory request.
  The server rechecks current key permission and visibility, returns only an
  explicit privacy proof, and avoids reading memory contents for the check.
- Older servers returning an ordinary list retain the anonymous-404 check.
  Successful HTTP status alone is never accepted as proof of privacy. Neither
  credential access nor private visibility is cached across operations.
- Requests identify the provider and version in `User-Agent` for attribution.
- Anonymous full-playbook GETs filter to public/unlisted visibility in the
  database before loading content. This preserves the existing private 404
  response while avoiding transfer of a private instructions/persona payload
  that would immediately be discarded.

Existing installed clients must update the memory plugin before their expected
404 probes disappear. The GitHub source plugin can be installed independently of
a future npm CLI release; pinned catalog entries also need a source-pin update,
and an already-published CLI bundle still contains its previous provider. A
server deployment cannot remotely update someone else's Hermes installation.
