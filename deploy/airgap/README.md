# Air-gapped no-egress test

GitHub Actions workflow **No egress** brings this stack up on a Docker network
with `internal: true`. External DNS lookups and emitted IPv4 packets outside
the runtime subnet fail the job. This measures the fixture, not every possible
application path or an operator's production environment.

That is the automated proof for the Hungarian design-partner row **EU
adatrezidencia, no-egress**: a full secrets flow (health, create playbook, store
a secret, reveal it, `use_secret` against an in-network echo host, read the
audit log) with outbound traffic = 0.

## What runs

| Service | Image | Role |
| --- | --- | --- |
| `observer` | built here | DNS sink (no forwarding) + `tcpdump` |
| `db` | `supabase/postgres:17.6.1.136` | Self-hosted Postgres with Auth roles |
| `auth` | `supabase/gotrue:v2.197.0` | Supabase Auth |
| `rest` | `postgrest/postgrest:v14.18` | Supabase Data API |
| `kong` | `nginx:1.27-alpine` | `/auth/v1` and `/rest/v1` gateway |
| `app` | this repo's `Dockerfile` | AgentPlaybooks |
| `echo` | `nginx:1.27-alpine` | In-network `use_secret` target |
| `tester` | alpine + curl | The flow in `flow.sh` |

Studio, Realtime, Storage, analytics, and the pooler are omitted on purpose:
they are not on the secrets path, and several of them phone home.

## Build before isolating

Geist is self-hosted with `next/font/local` (merged in #200), so `next build`
does not fetch Google Fonts. `npm ci` and pulling base images still need the
network. The workflow therefore **builds and pulls every image on the runner,
then starts this compose file**. Runtime isolation does not cover those
pre-isolation fetches.

## Operator flags

See [Self-hosting: air-gapped / no-egress](../../public/docs/self-hosting.md#air-gapped--no-egress).
The test sets `NO_EGRESS=true` and `SECRETS_REQUIRE_ALLOWED_HOSTS=true`.
`NEXT_TELEMETRY_DISABLED=1` is already baked into the production Dockerfile.

## Observation coverage

The observer container sees DNS requests and its own interface traffic. A sibling
container cannot observe all bridge unicast traffic. CI therefore starts a host
capture on all interfaces, filtered to the runtime subnet, **before stack startup**,
and keeps it active through the secrets flow. Missing logs or dead observer
processes fail the check. The internal Docker network blocks external routes;
the capture detects emitted IPv4 packets, not system calls that fail before a
packet exists. IPv6 is disabled on the fixture network. Build/pull traffic is
outside this runtime measurement.
