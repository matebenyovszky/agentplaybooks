#!/bin/sh
# Fail if the observer recorded an external DNS lookup or a packet whose
# destination was outside the isolated subnet. Allow-list is compose service
# names (and their .<network> forms) plus reverse lookups for that subnet.
set -eu

DNS_LOG="${1:-/var/log/airgap/dnsmasq.log}"
PCAP_LOG="${2:-/var/log/airgap/tcpdump.log}"
[ -f "$DNS_LOG" ] && [ -f "$PCAP_LOG" ] || { echo "Missing observer logs" >&2; exit 1; }

allow_name() {
  name=$(printf '%s' "$1" | tr 'A-Z' 'a-z' | sed 's/\.$//')
  [ -z "$name" ] && return 0
  case "$name" in
    localhost) return 0 ;;
    observer|observer.airgap|db|db.airgap|rest|rest.airgap|auth|auth.airgap|kong|kong.airgap|app|app.airgap|echo|echo.airgap|tester|tester.airgap|db-init|db-init.airgap) return 0 ;;
  esac
  # Only a single IPv4 octet in this /24, not arbitrary subdomains.
  if printf '%s' "$name" | grep -Eq '^[0-9]{1,3}\.0\.30\.172\.in-addr\.arpa$'; then
    octet=${name%%.*}
    [ "$octet" -le 255 ] && return 0
  fi
  return 1
}

violations=0

if [ -f "$DNS_LOG" ]; then
  # dnsmasq --log-queries: "query[A] name from 172.30.0.x"
  while IFS= read -r line; do
    case "$line" in
      *" query["*)
        name=$(printf '%s\n' "$line" | sed -n 's/.* query\[[^]]*\] \([^ ]*\).*/\1/p')
        if [ -n "$name" ] && ! allow_name "$name"; then
          echo "external DNS lookup: $name" >&2
          echo "  $line" >&2
          violations=$((violations + 1))
        fi
        ;;
    esac
  done < "$DNS_LOG"
fi

if [ -s "$PCAP_LOG" ]; then
  echo "outbound packets outside 172.30.0.0/24:" >&2
  cat "$PCAP_LOG" >&2
  violations=$((violations + 1))
fi

if [ "$violations" -ne 0 ]; then
  echo "no-egress check failed ($violations violation group(s))" >&2
  exit 1
fi

echo "observer check passed (0 external DNS lookups, 0 locally observed outbound packets); CI host capture covers the entire bridge"
