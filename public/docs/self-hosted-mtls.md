---
title: Self-hosted mTLS for secret clients
---

# Self-hosted mTLS for secret clients

Hosted AgentPlaybooks authenticates certificate clients from Cloudflare's
trusted TLS context. Self-hosted Docker, Node, and local installs do not have
that context, so certificate mode fails closed there unless a TLS terminator in
front of the app verifies the client certificate and forwards the identity.

API-key authentication is unchanged. A failed mTLS check never falls back to a
bearer key.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MTLS_MODE` | `cloudflare` | `cloudflare` (production default), `proxy` (trusted terminator), or `off`. Unknown values fail closed. |
| `MTLS_PROXY_FINGERPRINT_HEADER` | unset | Request header set by the proxy after verification. Required in `proxy` mode. |
| `MTLS_PROXY_VERIFY_HEADER` | unset | Required in proxy mode. The header must equal `SUCCESS` or the request is rejected. |
| `MTLS_TRUSTED_PROXIES` | unset | Comma-separated IPs or CIDRs of the TLS terminator. Required in `proxy` mode. Empty or invalid entries fail closed. |

`MTLS_MODE=cloudflare` is the production default so existing Cloudflare
deployments stay unchanged. Do not enable `proxy` on the public hosted
instance.

The origin hashes SHA-256 of the certificate DER, matching
`openssl x509 -noout -fingerprint -sha256`. The fingerprint header may be:

- 64 hexadecimal characters, with or without colons, any case
- the PEM (or URI-escaped PEM) of the verified client certificate

Stock nginx `$ssl_client_fingerprint` is SHA-1 and will not match a
registration. Forward `$ssl_client_escaped_cert` instead, or use Caddy's SHA-256
placeholder.

## Trust model

The fingerprint is not a secret; it is public metadata. Proof is that the
**proxy verified the client presented the matching private key**, then
**overwrote** the identity headers, and authenticated the private proxy channel with `MTLS_PROXY_SHARED_SECRET`.
The proxy stamps `X-APB-Proxy-Address`, checked against `MTLS_TRUSTED_PROXIES`;
X-Forwarded-For and Request.ip are not transport authentication.

1. Do not publish the app port. Only the proxy should be able to reach it.
2. The proxy must **strip / overwrite** client-supplied copies of the fingerprint
   and verify headers. Use `proxy_set_header` / `header_up` with values from the
   TLS session, never `$http_x_ssl_client_fingerprint`.
3. Allowlist the proxy address (`172.28.0.10/32` in the example), not the whole
   Docker bridge. A client connecting directly with spoofed headers is rejected.
4. Unknown `MTLS_MODE`, a missing allowlist, a missing fingerprint header name,
   a failed verify header, or an unverified certificate all fail closed.

`ssl_verify_client optional` (nginx), Caddy `mode verify_if_given`, and Traefik
`VerifyClientCertIfGiven` keep the dashboard and API keys working on the same
host. Use `on` / `require_and_verify` / `RequireAndVerifyClientCert` only on a
dedicated runtime hostname.

## Generate a test CA and client certificate

```bash
./deploy/self-host/generate-test-certs.sh
```

The script writes `deploy/self-host/certs/` (CA, server, client) and prints the
client SHA-256 fingerprint. Register that fingerprint under **API Keys →
Certificate access for applications**. Never upload the private key.

Equivalent openssl:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 3650 -subj "/CN=AgentPlaybooks test CA"
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=localhost"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 3650 \
  -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n")
openssl req -newkey rsa:2048 -nodes -keyout client.key -out client.csr -subj "/CN=apb-secret-client"
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out client.crt -days 3650 \
  -extfile <(printf "extendedKeyUsage=clientAuth\n")
openssl x509 -in client.crt -noout -fingerprint -sha256
```

Replace the test CA with your organisation's CA before production.

## Docker Compose (nginx)

```bash
./deploy/self-host/generate-test-certs.sh
export MTLS_PROXY_SHARED_SECRET="$(openssl rand -hex 32)"
docker compose -f deploy/self-host/docker-compose.mtls.yml up --build
```

The example binds nginx at `172.28.0.10` and the app at `172.28.0.20` on an
internal network, publishes only `8443:443`, and sets:

```bash
MTLS_MODE=proxy
MTLS_PROXY_FINGERPRINT_HEADER=X-SSL-Client-Fingerprint
MTLS_PROXY_VERIFY_HEADER=X-SSL-Client-Verify
MTLS_TRUSTED_PROXIES=172.28.0.10/32
# MTLS_PROXY_SHARED_SECRET: same private random token in app and proxy (43–128 URL-safe characters)
```

Configs: `deploy/self-host/nginx/nginx.conf`, `caddy/Caddyfile`,
`traefik/traefik.yml`, `traefik/dynamic.yml`.

Smoke-test the runtime endpoint (replace GUID and names):

```bash
curl --cacert deploy/self-host/certs/ca.crt \
  --cert deploy/self-host/certs/client.crt \
  --key deploy/self-host/certs/client.key \
  --resolve localhost:8443:127.0.0.1 \
  -H "Content-Type: application/json" \
  -d '{"names":["DATABASE_URL"],"auth_mode":"mtls"}' \
  https://localhost:8443/api/playbooks/GUID/secrets/resolve
```

## nginx

```nginx
ssl_client_certificate /etc/nginx/certs/ca.crt;
ssl_verify_client optional;
ssl_verify_depth 2;

location / {
    proxy_pass http://app:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-SSL-Client-Verify $ssl_client_verify;
    proxy_set_header X-SSL-Client-Fingerprint $ssl_client_escaped_cert;
    proxy_set_header X-APB-Proxy-Token "${MTLS_PROXY_SHARED_SECRET}";
    proxy_set_header X-APB-Proxy-Address $server_addr;
}
```

`proxy_set_header` replaces the inbound header. Do not use
`$http_x_ssl_client_fingerprint`.

## Caddy

```caddy
example.org {
	tls /certs/server.crt /certs/server.key {
		client_auth {
			mode verify_if_given
			trust_pool file /certs/ca.crt
		}
	}
	reverse_proxy app:3000 {
		header_up X-SSL-Client-Fingerprint {http.request.tls.client.fingerprint}
		header_up X-SSL-Client-Verify SUCCESS
		header_up X-APB-Proxy-Token {$MTLS_PROXY_SHARED_SECRET}
		header_up X-APB-Proxy-Address 172.28.0.10
	}
}
```

Caddy's fingerprint placeholder is already SHA-256 hex. Empty fingerprint when
no client cert was presented still fails closed.

## Traefik

Traefik has no SHA-256 fingerprint variable. Pass the verified PEM and point
`MTLS_PROXY_FINGERPRINT_HEADER` at `X-Forwarded-Tls-Client-Cert`.

```yaml
tls:
  options:
    mtls:
      clientAuth:
        caFiles:
          - /certs/ca.crt
        clientAuthType: VerifyClientCertIfGiven

http:
  middlewares:
    pass-client-cert:
      passTLSClientCert:
        pem: true
    mtls-verify:
      headers:
        customRequestHeaders:
          X-SSL-Client-Verify: "SUCCESS"
```

```bash
MTLS_PROXY_FINGERPRINT_HEADER=X-Forwarded-Tls-Client-Cert
MTLS_PROXY_VERIFY_HEADER=X-SSL-Client-Verify
```

`passTLSClientCert` overwrites `X-Forwarded-Tls-Client-Cert`. The static
`SUCCESS` verify header is only safe because Traefik has already applied
`clientAuth`; without that option it would be an open relay.

## Python client

The application still presents its certificate over TLS to the proxy:

```sh
export AGENTPLAYBOOKS_URL=https://secrets.example.org
export AGENTPLAYBOOKS_PLAYBOOK_GUID=YOUR_GUID
export AGENTPLAYBOOKS_CLIENT_CERT_FILE=/secure/apb-client.crt
export AGENTPLAYBOOKS_CLIENT_KEY_FILE=/secure/apb-client.key
export AGENTPLAYBOOKS_CA_BUNDLE=/secure/ca.crt
```

See [Python Secrets](./python-secrets.md) and the
[package README](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/python-secrets).


## Proxy channel configuration (2026-10-25)

`MTLS_PROXY_SHARED_SECRET` is required in the app and TLS terminator. Generate once with `openssl rand -hex 32`; store separately from client credentials. Never send it to clients or include it in access logs. Overwrite `X-APB-Proxy-Token` and `X-APB-Proxy-Address` on every forwarded request. Keep origin access private; use TLS for the proxy-to-origin hop across hosts. The nginx compose example renders only this environment variable into its template. For Traefik, render `dynamic.yml` with `envsubst '${MTLS_PROXY_SHARED_SECRET}'` to a protected file before mounting it; apply the strip-client-cert middleware before pass-client-cert. Use Caddy 2.10+ with `verify_if_given` and `trust_pool file`. A bare IP allowlist or forwarded IP header cannot authenticate the proxy in a standard Next.js Request.
