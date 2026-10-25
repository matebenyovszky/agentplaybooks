#!/bin/sh
# Realistic secrets flow against the isolated self-host stack.
# Every URL is an allow-listed compose service name. Do not add public hosts.
set -eu

APP="${APP_URL:-http://app:3000}"
KONG="${KONG_URL:-http://kong:8000}"
ANON="${ANON_KEY:?ANON_KEY is required}"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

json() {
  # usage: json FILE FILTER
  jq -e "$2" "$1" >/dev/null
}

http() {
  # usage: http OUTFILE METHOD URL [curl args...]
  out=$1
  method=$2
  url=$3
  shift 3
  code=$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "$url" "$@")
  if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
    echo "HTTP $code $method $url" >&2
    cat "$out" >&2
    echo >&2
    return 1
  fi
}

echo "== health"
http "$tmp/health.json" GET "$APP/api/health"
json "$tmp/health.json" '.status == "ok"'

echo "== signup"
http "$tmp/auth.json" POST "$KONG/auth/v1/signup" \
  -H "apikey: $ANON" \
  -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"email":"airgap@example.test","password":"AirgapTestPassw0rd!"}'

TOKEN=$(jq -r '.access_token // empty' "$tmp/auth.json")
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "== login (signup returned no session)"
  http "$tmp/token.json" POST "$KONG/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON" \
    -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" \
    -d '{"email":"airgap@example.test","password":"AirgapTestPassw0rd!"}'
  TOKEN=$(jq -r '.access_token // empty' "$tmp/token.json")
fi
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "GoTrue did not issue an access_token" >&2
  cat "$tmp/auth.json" >&2
  exit 1
fi

echo "== create playbook"
http "$tmp/playbook.json" POST "$APP/api/playbooks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Airgap secrets probe","visibility":"private","description":"no-egress CI"}'
GUID=$(jq -r '.guid // empty' "$tmp/playbook.json")
if [ -z "$GUID" ]; then
  echo "Playbook create did not return a guid" >&2
  cat "$tmp/playbook.json" >&2
  exit 1
fi

echo "== create playbook API key"
http "$tmp/key.json" POST "$APP/api/playbooks/$GUID/api-keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"airgap","role":"admin","permissions":["full"]}'
APB_KEY=$(jq -r '.key // empty' "$tmp/key.json")
if [ -z "$APB_KEY" ]; then
  echo "API key create did not return a key" >&2
  cat "$tmp/key.json" >&2
  exit 1
fi

echo "== store secret"
http "$tmp/secret.json" POST "$APP/api/playbooks/$GUID/secrets" \
  -H "Authorization: Bearer $APB_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"ECHO_TOKEN","value":"airgap-secret-value","category":"token","allowed_hosts":["echo"],"allow_api_key_reveal":true}'
json "$tmp/secret.json" '.name == "ECHO_TOKEN"'

echo "== reveal secret"
http "$tmp/reveal.json" GET "$APP/api/playbooks/$GUID/secrets/reveal/ECHO_TOKEN" \
  -H "Authorization: Bearer $TOKEN"
json "$tmp/reveal.json" '.value == "airgap-secret-value"'

echo "== use_secret via proxy to echo"
http "$tmp/proxy.json" POST "$APP/api/playbooks/$GUID/secrets/proxy" \
  -H "Authorization: Bearer $APB_KEY" \
  -H "Content-Type: application/json" \
  -d '{"secret_name":"ECHO_TOKEN","url":"http://echo/","method":"GET"}'
json "$tmp/proxy.json" '.status == 200 and .body.ok == true and .body.service == "echo"'

echo "== audit log"
http "$tmp/audit.json" GET "$APP/api/playbooks/$GUID/audit?operation=secret.&limit=50" \
  -H "Authorization: Bearer $TOKEN"
json "$tmp/audit.json" '[.logs[].operation] | index("secret.create") != null'
json "$tmp/audit.json" '[.logs[].operation] | index("secret.reveal") != null'
json "$tmp/audit.json" '[.logs[].operation] | index("secret.use") != null'
json "$tmp/audit.json" '[.logs[] | select(.operation == "secret.use")] | any(.target == "echo" and .status == "success")'

echo "no-egress secrets flow passed (playbook $GUID)"
