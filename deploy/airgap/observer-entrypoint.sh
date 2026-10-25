#!/bin/sh
# DNS sink + packet observer for the isolated compose network.
# External names NXDOMAIN; packets whose destination is outside 172.30.0.0/24
# are logged. The CI job fails the run if either log is non-empty of violations.
set -eu
mkdir -p /var/log/airgap
: > /var/log/airgap/dnsmasq.log
: > /var/log/airgap/tcpdump.log
: > /var/log/airgap/tcpdump.meta

dnsmasq --keep-in-foreground --conf-file=/etc/dnsmasq.conf &
dns_pid=$!
echo "$dns_pid" > /var/log/airgap/dns.pid

# Give dnsmasq a moment so depends_on: service_healthy can pass.
i=0
while [ "$i" -lt 50 ]; do
  if nc -z 127.0.0.1 53 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 0.1
done

# Destination outside the isolated subnet, loopback, or multicast = attempted egress.
# ARP is not a connection. DNS to this observer is dst 172.30.0.53 (internal).
tcpdump -i eth0 -nn -l -U \
  'ip and not dst net 172.30.0.0/24 and not dst net 127.0.0.0/8 and not dst net 224.0.0.0/4 and not dst host 255.255.255.255' \
  > /var/log/airgap/tcpdump.log 2>/var/log/airgap/tcpdump.meta &
pcap_pid=$!
echo "$pcap_pid" > /var/log/airgap/pcap.pid

term() {
  kill "$dns_pid" "$pcap_pid" 2>/dev/null || true
  wait "$dns_pid" "$pcap_pid" 2>/dev/null || true
}
trap term INT TERM

while kill -0 "$dns_pid" 2>/dev/null && kill -0 "$pcap_pid" 2>/dev/null; do
  sleep 1
done
term
exit 1
