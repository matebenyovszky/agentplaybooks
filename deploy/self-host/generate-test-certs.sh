#!/bin/sh
# Generate a local test CA, server certificate, and client certificate.
# Does not print private keys. Run from the repository root or this directory.
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
dir="$root/certs"
mkdir -p "$dir"

if [ -f "$dir/ca.crt" ] || [ -f "$dir/server.key" ] || [ -f "$dir/client.key" ]; then
  echo "Refusing to overwrite existing files in $dir" >&2
  exit 1
fi

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$dir/ca.key" -out "$dir/ca.crt" -days 3650 \
  -subj "/CN=AgentPlaybooks test CA"

openssl req -newkey rsa:2048 -nodes \
  -keyout "$dir/server.key" -out "$dir/server.csr" \
  -subj "/CN=localhost"
openssl x509 -req -in "$dir/server.csr" -CA "$dir/ca.crt" -CAkey "$dir/ca.key" \
  -CAcreateserial -out "$dir/server.crt" -days 3650 \
  -extfile - <<'EOF'
subjectAltName=DNS:localhost,IP:127.0.0.1
extendedKeyUsage=serverAuth
EOF

openssl req -newkey rsa:2048 -nodes \
  -keyout "$dir/client.key" -out "$dir/client.csr" \
  -subj "/CN=apb-secret-client"
openssl x509 -req -in "$dir/client.csr" -CA "$dir/ca.crt" -CAkey "$dir/ca.key" \
  -CAcreateserial -out "$dir/client.crt" -days 3650 \
  -extfile - <<'EOF'
extendedKeyUsage=clientAuth
EOF

rm -f "$dir/server.csr" "$dir/client.csr"
chmod 600 "$dir/ca.key" "$dir/server.key" "$dir/client.key"
chmod 644 "$dir/ca.crt" "$dir/server.crt" "$dir/client.crt"

echo
echo "Client certificate SHA-256 fingerprint (register this, never the private key):"
openssl x509 -in "$dir/client.crt" -noout -fingerprint -sha256
echo
echo "Certificates written to $dir"
