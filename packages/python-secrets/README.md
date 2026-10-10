# AgentPlaybooks Secrets for Python

Load secrets once at application startup, then keep using `os.environ`, your
existing database driver, and your existing SDKs. Python 3.10+, no runtime
dependencies, no Node/npm, no subprocess, no disk cache.

## Install

This package is built from this repository; it has not yet been published to PyPI.
From the repository root:

```sh
python -m pip install ./packages/python-secrets
```

For another repository, build a wheel in your release job and install that wheel,
or pin a reviewed Git commit:

```sh
python -m pip install 'agentplaybooks-secrets @ git+https://github.com/matebenyovszky/agentplaybooks.git@COMMIT_SHA#subdirectory=packages/python-secrets'
```

The commit must contain this package. Do not use a floating branch in production.

## Two-line migration

Place this before imports that read settings, and before starting worker threads:

```python
from apb_secrets import load_env
load_env(["DATABASE_URL", "SERVICE_API_KEY"])

# Existing application code continues unchanged:
import os
database_url = os.environ["DATABASE_URL"]
```

Configure `AGENTPLAYBOOKS_PLAYBOOK_GUID` and one of the authentication methods below.
In the playbook vault, enable **Allow API Key Reveal** (`allow_api_key_reveal`) for
each secret that the application needs. That existing flag applies to both API-key
and certificate runtime access. Proxy-only secrets cannot be loaded locally.

Existing environment variables win, **including empty strings**. If every selected
variable already exists, no client is created and no network, certificate files,
APBKS credentials, or playbook configuration are needed. Existing CI/CD can keep
injecting its values exactly as before. If only some variables exist, APBKS fills
the rest in one request. Set `override=True` explicitly to replace existing values.

If you keep `load_dotenv()` during migration, call it before `load_env()` to preserve
local precedence, or use `load_env(..., override=True)` to deliberately prefer the
vault. Remove migrated secret values from `.env`; keep non-secret configuration there.

All requested values are checked before any environment changes. Missing required
secrets, failed authentication, unavailable service, expired secrets, and disabled
reveal raise `SecretsError` and leave the environment unchanged. Start the app only
after this call succeeds. Errors and the return value contain no secret values.

## API-key authentication

Use a playbook-scoped API key with `secrets:read`. The account-management key is not
a substitute. Supply it using either:

- `AGENTPLAYBOOKS_PLAYBOOK_KEY`: an existing CI secret/environment variable.
- `AGENTPLAYBOOKS_PLAYBOOK_KEY_FILE`: a runtime-mounted file, for example
  `/run/secrets/apb_api_key`. A trailing newline is stripped.

The environment value takes precedence over the file. Neither is written back to
disk by the library. `AGENTPLAYBOOKS_URL` optionally selects another HTTPS origin.

## mTLS authentication

Configure these file paths instead of an API key:

```sh
export AGENTPLAYBOOKS_PLAYBOOK_GUID=YOUR_GUID
export AGENTPLAYBOOKS_CLIENT_CERT_FILE=/secure/apb-client.crt
export AGENTPLAYBOOKS_CLIENT_KEY_FILE=/secure/apb-client.key
```

The same `load_env()` call now presents the certificate over TLS. Its private key
stays on the client. Use a distinct identity for each application/environment.
Do not configure an API key at the same time: ambiguous authentication is rejected,
and a failed mTLS check never falls back to an API key.

The server must be deployed with the runtime endpoint and certificate registry,
Cloudflare must request/validate the client certificate for the hostname, and the
owner must register its SHA-256 fingerprint and exact allowed secret names under
**API Keys → Certificate access for applications**. A client cannot enroll itself.

Get the public fingerprint (this does not read or print the private key):

```sh
openssl x509 -in /secure/apb-client.crt -noout -fingerprint -sha256
```

Paste the hexadecimal part after `=`. Registration accepts colon-separated or
plain SHA-256 fingerprints. Access can have its own expiry and can be revoked in
the same panel. Certificate rotation uses a newly registered certificate; revoke
the old registration after switching the application.

This release uses trusted Cloudflare/OpenNext TLS context on the server. It never
trusts `Client-Cert`, `Cf-Cert-*`, or other client-supplied certificate headers.
Self-hosted Node/Next servers support API keys; certificate mode fails closed there
until a separately authenticated TLS-termination adapter is implemented.

Client keys are unattended PEM files (no interactive password prompt). A file key
can be copied; this is application identity, not hardware attestation. Protect its
permissions. TPM/non-exportable key integration is outside this release.

## Direct values, aliases, optional secrets

```python
from apb_secrets import SecretsClient, load_env

# Read configuration from the environment, or pass explicit constructor arguments.
vault = SecretsClient.from_env()
password = vault.get("DB_PASSWORD")  # In Python memory; not added to os.environ.
credentials = vault.get_many(["DB_USER", "DB_PASSWORD"])

# Mapping direction: local environment name -> vault name.
loaded_names = load_env(
    {"DATABASE_URL": "PRODUCTION_DATABASE_URL"},
    optional=["OPTIONAL_SERVICE_TOKEN"],
)
```

Optional means a missing vault entry is tolerated. Permission failures, expiry,
and proxy-only restrictions still fail. mTLS registrations must authorize optional
names too. Maximum 100 distinct vault names per call. `load_env` returns only the
tuple of names it populated. `get`/`get_many` return plaintext intentionally; do not
log those values or dump process environments.

Explicit configuration:

```python
vault = SecretsClient(
    playbook="YOUR_GUID",
    certificate="/run/secrets/apb_client_cert",
    private_key="/run/secrets/apb_client_key",
    timeout=15,
)
vault.load_env(["DATABASE_URL"])
```

An optional `ca_bundle` / `AGENTPLAYBOOKS_CA_BUNDLE` file changes the trust store for
verifying the **server** certificate. It does not register your client identity.
Server verification and hostname verification are always enabled; redirects are
rejected so credentials and client certificates never follow a redirect target.

## Docker and CI/CD

Working examples are in `examples/compose.api-key.yaml`, `examples/compose.mtls.yaml`,
and `examples/Dockerfile`. From the examples directory:

```sh
# Non-secret identifiers and paths only:
export AGENTPLAYBOOKS_PLAYBOOK_GUID=YOUR_GUID
export APB_CREDENTIALS_DIR=/secure/your-application
docker compose -f compose.mtls.yaml up --build
```

API-key mode expects `apb_api_key` in that directory; mTLS mode expects
`apb_client.crt` and `apb_client.key`. Compose mounts them at runtime under
`/run/secrets`. They are not copied into the image. Plain Compose bind-mounts host
files; it does not encrypt those source files. Ensure the container user can read
the required files without making private keys world-readable. The example image
uses a configurable numeric UID/GID (default 1000).

Your existing CI can continue providing `DATABASE_URL` and `SERVICE_API_KEY`.
When switching CI to the vault, inject the scoped APBKS key through your CI secret
store, or mount the job's certificate/key. Never bake credentials into build args,
image layers, or the application source.

## Runtime contract and limits

- Values are fetched at startup and retained in application/process memory. There
  is no automatic refresh, disk cache, or offline stale-value fallback.
- `os.environ` values are inherited by child processes. Use `get()` and pass values
  directly to an SDK if inheritance is unnecessary. This cannot protect values from
  the application itself, a debugger, or a privileged host process.
- Rotating a vault secret affects the next load/restart. Revoking a certificate
  blocks future loads; it does not erase values already delivered to running apps.
- SQL uses the normal local database driver after loading credentials. The APBKS
  HTTP proxy is not a PostgreSQL/MySQL transport.
- API keys keep their existing playbook/permission scope. Certificate clients have
  an additional exact-name allow-list and only access the runtime resolve endpoint.
  Requiring mTLS for a certificate identity does not revoke separately issued keys.

## Server deployment

1. Apply `supabase/migrations/20261010081252_secret_clients.sql` through the existing
   Supabase deployment workflow. It creates a service-role-only registry with RLS.
2. Deploy the APBKS server containing `POST /api/playbooks/:guid/secrets/resolve`.
   API-key loading is available at this point; existing API/CLI behavior is retained.
3. Enable client certificate validation for the chosen proxied hostname in
   Cloudflare. Issue a client certificate using Cloudflare's CA, or configure your
   trusted CA. This must be **client → Cloudflare** mTLS, not Authenticated Origin Pulls.
4. Register the certificate in the playbook's API Keys panel and enable reveal for
   its allowed secrets. Activate API Shield rules on a dedicated runtime hostname
   if certificate presentation must be mandatory for all requests to that hostname;
   do not accidentally block browser/legacy API-key traffic on a shared hostname.
5. Test from the actual machine/container. Cloudflare must report
   `certPresented=1`, `certVerified=SUCCESS`, `certRevoked=0`. The application checks
   the exact fingerprint, active registration, playbook, access expiry, secret
   names, secret expiry, and reveal permission on every load.

Cloudflare mTLS setup is infrastructure configuration, not performed by this package.
For BYO CAs, enforce your revocation policy as Cloudflare does not automatically check
all custom CA revocation lists; the APBKS registration can always be revoked locally.

Owner management endpoints (session authentication, GUID or playbook UUID):

```text
GET    /api/playbooks/:guid/secret-clients
POST   /api/playbooks/:guid/secret-clients
DELETE /api/playbooks/:guid/secret-clients/:id
```

Registration JSON: `name`, `certificate_sha256`, `secret_names`, optional `expires_at`.
DELETE revokes the registration while retaining its metadata. Runtime JSON:

```json
{"names":["DATABASE_URL"],"optional_names":[],"auth_mode":"mtls"}
```

Use `auth_mode: "api_key"` with the bearer key for API authentication. Success returns
`{"values": {"DATABASE_URL": "..."}, "missing_optional": []}`. A failed batch returns
no values. Responses are `no-store`; audit records contain names and caller identity,
never secret values. Only the owner can register or revoke certificate clients.

References: [Cloudflare mTLS](https://developers.cloudflare.com/api-shield/security/mtls/configure/),
[OpenNext request context](https://opennext.js.org/cloudflare/bindings),
[Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/).

## Tests

```sh
python -m pip install ./packages/python-secrets
python -m unittest discover -s packages/python-secrets/tests -v
```

The suite creates short-lived test certificates with OpenSSL, exercises real TLS
handshakes, rejects missing certificates/untrusted servers/redirects, and tests
atomic loading, aliases, optional names, CI precedence, and sanitized failures.
