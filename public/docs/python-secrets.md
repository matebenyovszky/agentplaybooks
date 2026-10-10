---
title: Python Secrets — Local Apps, Docker and CI
---

# Python secrets at application startup

The `agentplaybooks-secrets` Python package loads vault credentials directly into
application memory. It needs Python 3.10+ and has no runtime dependencies or Node.js
requirement. Existing applications can retain their `os.environ` configuration:

```python
from apb_secrets import load_env
load_env(["DATABASE_URL", "SERVICE_API_KEY"])

# Import application settings and start the app after loading succeeds.
```

Existing environment variables win, including empty strings. When CI/CD already
provides all selected variables, this call requires no APBKS credentials or network.
Missing variables are loaded in one request; failures leave the environment unchanged
and raise `SecretsError`. Optional names and local-to-vault name mappings are supported.

## Install from source

The package is not yet published to PyPI. From the AgentPlaybooks repository:

```sh
python -m pip install ./packages/python-secrets
```

For production, build a wheel or pin a reviewed repository commit containing the
package. See the [package guide](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/python-secrets)
for installation, configuration, and runnable examples.

## API keys

Set `AGENTPLAYBOOKS_PLAYBOOK_GUID` and supply a playbook-scoped key with `secrets:read`
through `AGENTPLAYBOOKS_PLAYBOOK_KEY` or a mounted `AGENTPLAYBOOKS_PLAYBOOK_KEY_FILE`.
The account-management key is not a substitute. Enable **Allow API Key Reveal** on
each secret used locally; proxy-only secrets remain server-side.

## Client certificates (mTLS)

For certificate authentication, set these paths instead of an API key:

```text
AGENTPLAYBOOKS_CLIENT_CERT_FILE=/run/secrets/apb_client_cert
AGENTPLAYBOOKS_CLIENT_KEY_FILE=/run/secrets/apb_client_key
```

In the playbook's **API Keys** panel, open **Certificate access for applications**.
Register the application's certificate SHA-256 fingerprint, the exact allowed secret
names, and an optional access expiry. The certificate itself must also be valid and
verified by Cloudflare for the API hostname. The existing reveal flag applies to
both API-key and mTLS runtime access.

```sh
openssl x509 -in apb-client.crt -noout -fingerprint -sha256
```

Paste the hexadecimal fingerprint after `=`; never upload the private key. Use a
separate certificate for each application/environment. Revocation in this panel
blocks the next load, but cannot remove credentials already held by running apps.
Rotate vault secrets and restart consumers when previously delivered values must change.

This server implementation takes identity only from Cloudflare/OpenNext's trusted
TLS context. Certificate forwarding headers are not trusted. Self-hosted Node/Next
deployments can use API keys; mTLS there requires an additional trusted termination
adapter. Local Python and Docker clients can both connect to the Cloudflare deployment.

## Docker and existing CI

The package includes separate API-key and mTLS Compose examples. Credentials are
mounted at runtime under `/run/secrets`, not included in the image. Compose file
secrets use host bind mounts; protect the source files and give the application user
read access. The same loader works on a workstation with ordinary protected file paths.

If you retain `load_dotenv()` during migration, run it before `load_env()` to preserve
local precedence. Use `override=True` only when deliberately replacing existing
environment values. Remove migrated secrets from `.env` after switching consumers.

Call the loader before importing modules that read settings and before starting
worker threads. Environment values are inherited by child processes. For a value
that should stay in Python only:

```python
from apb_secrets import SecretsClient

vault = SecretsClient.from_env()
password = vault.get("DB_PASSWORD")
# Pass password directly to the existing database driver or SDK.
```

SQL connections remain direct connections through the usual database driver.
The APBKS HTTP proxy does not carry native SQL traffic. Startup loading has no
automatic refresh or disk cache; rotation affects the next load/restart.

## Server rollout

Apply the `secret_clients` migration through the existing Supabase deployment,
then deploy the runtime API. API-key mode can now be used. For mTLS, additionally
enable Cloudflare client certificate verification on the chosen API hostname,
register each application identity, and test from its actual runtime. Existing
browser and API-key traffic does not need to be forced behind an mTLS-only rule.

Runtime endpoint: `POST /api/playbooks/:guid/secrets/resolve`, with `names`, optional
`optional_names`, and `auth_mode` (`api_key` or `mtls`). At most 100 distinct names
are accepted. Success returns `values` and `missing_optional`; failure returns no
secret values. An optional name tolerates absence, never an authorization failure.

Owner-only management: `GET/POST /api/playbooks/:guid/secret-clients` and
`DELETE /api/playbooks/:guid/secret-clients/:id`. Registration accepts `name`,
`certificate_sha256`, `secret_names`, and optional `expires_at`. API keys and
certificate clients cannot enroll themselves. The registry is service-role-only
with RLS; audit events retain names and identity, never values.

The complete [package guide and examples](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/python-secrets)
include the rollout checklist, Docker commands, and limitations.
