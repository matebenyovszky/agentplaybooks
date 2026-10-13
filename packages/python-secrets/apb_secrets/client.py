from __future__ import annotations

import json
import math
import os
import re
import ssl
from collections.abc import Iterable, Mapping, MutableMapping
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_.-]{0,127}\Z")
_ENV_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\Z")
_MAX_RESPONSE = 4 * 1024 * 1024
SecretSelection = Iterable[str] | Mapping[str, str]


class SecretsError(RuntimeError):
    """Safe-to-log failure: never includes response bodies or credentials."""


class ConfigurationError(SecretsError):
    pass


class _NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _names(names: Iterable[str]) -> list[str]:
    if isinstance(names, str):
        raise ConfigurationError("Pass secret names as a list, not a string.")
    result = list(names)
    if len(result) > 100 or any(not isinstance(name, str) or not _NAME.fullmatch(name) for name in result):
        raise ConfigurationError("Use at most 100 valid secret names.")
    if len(set(result)) != len(result):
        raise ConfigurationError("Duplicate secret names are not allowed.")
    return result


def _selection(names: SecretSelection) -> dict[str, str]:
    if isinstance(names, Mapping):
        result = dict(names)
        _names(set(result.values()))
    else:
        result = {name: name for name in _names(names)}
    if any(not isinstance(name, str) or not _ENV_NAME.fullmatch(name) for name in result):
        raise ConfigurationError("Environment names must contain only letters, digits, and underscores.")
    return result


def _pending(required, optional, environ, override):
    required, optional = _selection(required), _selection(optional)
    if required.keys() & optional.keys():
        raise ConfigurationError("An environment variable cannot be both required and optional.")
    return tuple({key: value for key, value in selection.items() if override or key not in environ}
                 for selection in (required, optional))


class SecretsClient:
    """Explicit in-memory access. No background refresh or implicit value cache.

    Choose either api_key, or certificate + private_key. mTLS requires a registered
    client on the APBKS server; presenting a certificate alone never creates access.
    """

    def __init__(self, playbook: str, *, api_key: str | None = None,
                 certificate: str | os.PathLike | None = None,
                 private_key: str | os.PathLike | None = None,
                 base_url: str = "https://agentplaybooks.ai",
                 ca_bundle: str | os.PathLike | None = None, timeout: float = 15):
        parsed = urlsplit(base_url)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
            raise ConfigurationError("base_url must be an HTTPS origin without credentials or a path.")
        if not isinstance(playbook, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", playbook):
            raise ConfigurationError("Provide the playbook GUID.")
        if not isinstance(timeout, (int, float)) or not math.isfinite(timeout) or timeout <= 0:
            raise ConfigurationError("timeout must be a positive number of seconds.")
        if bool(certificate) != bool(private_key):
            raise ConfigurationError("mTLS requires both certificate and private_key files.")
        if api_key and certificate:
            raise ConfigurationError("Choose API-key or mTLS authentication, not both.")
        if not api_key and not certificate:
            raise ConfigurationError("Provide a playbook API key or an mTLS certificate and key.")
        if api_key is not None and (not isinstance(api_key, str) or not api_key.startswith("apb_")
                                    or any(ch.isspace() for ch in api_key)):
            raise ConfigurationError("Invalid playbook API key.")
        self._url = f"{base_url.rstrip('/')}/api/playbooks/{quote(playbook, safe='')}/secrets/resolve"
        self._api_key = api_key
        self._mode = "mtls" if certificate else "api_key"
        self._timeout = timeout
        try:
            context = ssl.create_default_context(cafile=ca_bundle)
            if certificate:
                # An unattended process must not prompt for an encrypted key password.
                context.load_cert_chain(certificate, private_key, password=lambda: "")
            self._opener = build_opener(_NoRedirects(), HTTPSHandler(context=context))
        except (OSError, ValueError, ssl.SSLError):
            raise ConfigurationError("Cannot load TLS trust or client certificate files.") from None

    @classmethod
    def from_env(cls, *, environ: Mapping[str, str] | None = None, **overrides) -> SecretsClient:
        env = os.environ if environ is None else environ
        api_key = env.get("AGENTPLAYBOOKS_PLAYBOOK_KEY")
        key_file = env.get("AGENTPLAYBOOKS_PLAYBOOK_KEY_FILE")
        # Explicit configuration wins, including an explicit api_key=None for mTLS.
        if "api_key" not in overrides and not api_key and key_file:
            try:
                api_key = Path(key_file).read_text(encoding="utf-8").rstrip("\r\n")
            except (OSError, UnicodeError):
                raise ConfigurationError("Cannot read the playbook API key file.") from None
        config = {
            "playbook": env.get("AGENTPLAYBOOKS_PLAYBOOK_GUID", ""),
            "base_url": env.get("AGENTPLAYBOOKS_URL", "https://agentplaybooks.ai"),
            "api_key": api_key,
            "certificate": env.get("AGENTPLAYBOOKS_CLIENT_CERT_FILE"),
            "private_key": env.get("AGENTPLAYBOOKS_CLIENT_KEY_FILE"),
            "ca_bundle": env.get("AGENTPLAYBOOKS_CA_BUNDLE"),
        }
        config.update(overrides)
        return cls(**config)

    def get_many(self, names: Iterable[str], *, optional: Iterable[str] = ()) -> dict[str, str]:
        required, optional = _names(names), _names(optional)
        if set(required) & set(optional) or len(required) + len(optional) > 100:
            raise ConfigurationError("Use up to 100 distinct required and optional secret names.")
        if not required and not optional:
            return {}
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        request = Request(self._url, method="POST", headers=headers, data=json.dumps({
            "names": required, "optional_names": optional, "auth_mode": self._mode,
        }).encode("utf-8"))
        try:
            with self._opener.open(request, timeout=self._timeout) as response:
                if response.status != 200:
                    raise SecretsError(f"Secret loading failed (HTTP {response.status}).")
                raw = response.read(_MAX_RESPONSE + 1)
                if len(raw) > _MAX_RESPONSE:
                    raise SecretsError("Secret response exceeds the supported size.")
                payload = json.loads(raw)
        except HTTPError as exc:
            status = exc.code
            exc.close()
            raise SecretsError(f"Secret loading failed (HTTP {status}).") from None
        except (URLError, OSError, ValueError):
            raise SecretsError("APBKS is unavailable, TLS verification failed, or its response is invalid.") from None
        values = payload.get("values") if isinstance(payload, dict) else None
        if (not isinstance(values, dict) or set(required) - values.keys()
                or values.keys() - set(required + optional)
                or any(not isinstance(value, str) or "\0" in value for value in values.values())):
            raise SecretsError("APBKS returned an incomplete or invalid secret response.")
        return values

    def get(self, name: str) -> str:
        return self.get_many([name])[name]

    def load_env(self, names: SecretSelection, *, optional: SecretSelection = (),
                 override: bool = False, environ: MutableMapping[str, str] | None = None) -> tuple[str, ...]:
        """Load missing values together; return names only, never values.

        Mapping syntax is {environment_name: vault_name}. Existing variables,
        even empty ones, win unless override=True. Call before importing modules
        that read their configuration, and before starting worker threads.
        """
        target = os.environ if environ is None else environ
        required, optional = _pending(names, optional, target, override)
        required_names = list(dict.fromkeys(required.values()))
        optional_names = [name for name in dict.fromkeys(optional.values()) if name not in required_names]
        values = self.get_many(required_names, optional=optional_names)
        pending = {key: values[name] for key, name in (required | optional).items() if name in values}
        # Validate encoding before touching os.environ: malformed values cannot
        # leave half an application's configuration updated.
        try:
            for key, value in pending.items():
                os.fsencode(key)
                os.fsencode(value)
        except UnicodeError:
            raise SecretsError("A secret cannot be represented in this process environment.") from None
        target.update(pending)
        return tuple(pending)


def load_env(names: SecretSelection, *, optional: SecretSelection = (), override: bool = False,
             client: SecretsClient | None = None,
             environ: MutableMapping[str, str] | None = None, **configuration) -> tuple[str, ...]:
    """Startup helper. Fully configured CI needs neither APBKS access nor credentials."""
    target = os.environ if environ is None else environ
    required, optional_pending = _pending(names, optional, target, override)
    if not required and not optional_pending:
        return ()
    if client is not None and configuration:
        raise ConfigurationError("Pass a client or connection configuration, not both.")
    client = client or SecretsClient.from_env(environ=target, **configuration)
    return client.load_env(required, optional=optional_pending, override=override, environ=target)
