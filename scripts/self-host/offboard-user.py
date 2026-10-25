#!/usr/bin/env python3
"""Offboard a user from a self-hosted instance: ban the account and revoke every credential.

    SUPABASE_URL=https://supabase.example.org SUPABASE_SERVICE_ROLE_KEY=... \
        python3 scripts/self-host/offboard-user.py person@example.org

1. Bans the account in Supabase Auth (no new sign-in, no token refresh).
2. Calls public.revoke_account_credentials: the account's user API keys and the
   API keys and certificate clients of the playbooks it owns are deactivated.

The API also refuses a banned account's remaining credentials and unexpired
session tokens on their next request (public.account_is_active), so step 2 is
the durable record rather than the only barrier. Playbooks, memberships and the
audit trail are left as they are; reassign or delete the playbooks separately.

The service-role key is read from the environment, never from the command line.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BAN_DURATION = "876000h"  # 100 years: GoTrue's way of saying "until unbanned"


def request(base: str, key: str, method: str, path: str, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        base.rstrip("/") + path,
        data=data,
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")[:300]
        raise SystemExit(f"{method} {path} failed: HTTP {error.code} {detail}") from None
    return json.loads(raw) if raw else None


def find_user(base: str, key: str, email: str) -> dict:
    wanted = email.strip().lower()
    page = 1
    while True:
        query = urllib.parse.urlencode({"page": page, "per_page": 200})
        result = request(base, key, "GET", f"/auth/v1/admin/users?{query}")
        users = result.get("users", []) if isinstance(result, dict) else []
        for user in users:
            if (user.get("email") or "").strip().lower() == wanted:
                return user
        if len(users) < 200:
            raise SystemExit(f"No account with email {email}")
        page += 1


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[0], file=sys.stderr)
        print("usage: offboard-user.py <email>", file=sys.stderr)
        return 2
    base = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set", file=sys.stderr)
        return 2

    user = find_user(base, key, sys.argv[1])
    request(base, key, "PUT", f"/auth/v1/admin/users/{user['id']}", {"ban_duration": BAN_DURATION})
    revoked = request(base, key, "POST", "/rest/v1/rpc/revoke_account_credentials", {"p_user_id": user["id"]})
    print(json.dumps({"user_id": user["id"], "banned": True, "revoked": revoked}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
