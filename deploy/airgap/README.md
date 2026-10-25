# Air-gapped no-egress test

GitHub Actions workflow **No egress** brings this stack up on a Docker network
with `internal: true` and fails the job if anything tries to leave.

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
