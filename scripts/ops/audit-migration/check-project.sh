#!/usr/bin/env bash
# Abort unless PROD_DB_URL identifies the heap production project.
# Parses the URI only — does not connect, does not print the URL or password.
# Same host/user rules as scripts/prepare-supabase-deploy.mjs.
set -euo pipefail

HEAP_REF="${AUDIT_HEAP_PROJECT_REF:-zcphxfospbvqplonkvco}"
RETIRED_REF="${AUDIT_RETIRED_PROJECT_REF:-bydcjwxfiiolmnddzbpy}"

if [[ -z "${PROD_DB_URL:-}" ]]; then
  echo "NO-GO: PROD_DB_URL is not set. Copy the URI from the Supabase dashboard for project ${HEAP_REF} (Connect, or Project Settings → Database). Direct: db.${HEAP_REF}.supabase.co:5432. Session pooler: *.pooler.supabase.com:5432 with user postgres.${HEAP_REF}. Do not use the transaction pooler (port 6543)." >&2
  exit 1
fi

export HEAP_REF RETIRED_REF
python3 - <<'PY'
import os
import sys
from urllib.parse import unquote, urlparse

heap = os.environ["HEAP_REF"]
retired = os.environ["RETIRED_REF"]
raw = os.environ["PROD_DB_URL"]

if retired in raw:
    print(
        f"NO-GO: connection string identifies retired project {retired}. "
        f"Production is heap project {heap}.",
        file=sys.stderr,
    )
    sys.exit(1)

try:
    url = urlparse(raw)
except Exception:
    print("NO-GO: PROD_DB_URL is not a valid URI.", file=sys.stderr)
    sys.exit(1)

if url.scheme not in ("postgres", "postgresql"):
    print("NO-GO: PROD_DB_URL must be a PostgreSQL URL.", file=sys.stderr)
    sys.exit(1)

username = unquote(url.username or "")
host = (url.hostname or "").lower()
port = url.port or 5432

if retired in username or retired in host:
    print(
        f"NO-GO: connected identity is retired project {retired}. "
        f"Target is heap project {heap}.",
        file=sys.stderr,
    )
    sys.exit(1)

if port == 6543:
    print(
        "NO-GO: transaction pooler (port 6543) is forbidden for pg_dump and this backfill. "
        "Use Direct (5432) or Session pooler (5432).",
        file=sys.stderr,
    )
    sys.exit(1)

direct = host == f"db.{heap}.supabase.co"
pooler = host.endswith(".pooler.supabase.com") and username == f"postgres.{heap}"
if not direct and not pooler:
    print(
        f"NO-GO: PROD_DB_URL does not identify heap project {heap} "
        f"(host={host or '(none)'}, user={username.split('.')[0] if username else '(none)'}). "
        f"Dashboard: https://supabase.com/dashboard/project/{heap} → Connect / "
        f"Project Settings → Database. Direct host db.{heap}.supabase.co; "
        f"session pooler user postgres.{heap}.",
        file=sys.stderr,
    )
    sys.exit(1)

kind = "direct" if direct else "session-pooler"
print(f"GO: target is heap project {heap} ({kind}, host={host}, port={port})")
PY
