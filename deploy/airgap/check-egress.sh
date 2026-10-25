#!/bin/sh
# Fail if the observer recorded an external DNS lookup or a packet whose
# destination was outside the isolated subnet. Allow-list is compose service
# names (and their .<network> forms) plus reverse lookups for that subnet.
set -eu

DNS_LOG="${1:-/var/log/airgap/dnsmasq.log}"
PCAP_LOG="${2:-/var/log/airgap/tcpdump.log}"

allow_name() {
  name=$(printf '%s' "$1" | tr 'A-Z' 'a-z' | sed 's/\.$//')
  [ -z "$name" ] && return 0
  case "$name" in
    localhost|localhost.*) return 0 ;;
    observer|observer.airgap|observer.airgap.*) return 0 ;;
    db|db.airgap|db.airgap.*) return 0 ;;
    rest|rest.airgap|rest.airgap.*) return 0 ;;
    auth|auth.airgap|auth.airgap.*) return 0 ;;
    kong|kong.airgap|kong.airgap.*) return 0 ;;
    app|app.airgap|app.airgap.*) return 0 ;;
    echo|echo.airgap|echo.airgap.*) return 0 ;;
    tester|tester.airgap|tester.airgap.*) return 0 ;;
    *.0.30.172.in-addr.arpa|0.30.172.in-addr.arpa) return 0 ;;
    *.30.172.in-addr.arpa) return 0 ;;
  esac
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

echo "no-egress check passed (0 external DNS lookups, 0 outbound packets)"
