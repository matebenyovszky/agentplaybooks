"""Small REST client. No SDK, embeddings, cache, automatic retries or transcript ingestion."""
from __future__ import annotations

import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class MemoryAPIError(RuntimeError):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


class NoRedirects(HTTPRedirectHandler):
    # Never forward a playbook credential to a redirected origin.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def validate_guid(guid):
    if not isinstance(guid, str) or not re.fullmatch(r"(?:[0-9a-fA-F]{8,}|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})", guid):
        raise ValueError("Use the playbook GUID from its AgentPlaybooks URL.")
    return guid


def validate_url(url):
    parsed = urlsplit(url)
    if (parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment
            or (parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"))):
        raise ValueError("Use an HTTPS AgentPlaybooks URL (HTTP is allowed only on localhost).")
    return url.rstrip("/")


class Client:
    def __init__(self, base_url, guid, api_key=""):
        self.base_url = validate_url(base_url)
        self.guid = validate_guid(guid)
        self.api_key = api_key
        self.path = f"/api/playbooks/{quote(guid, safe='')}/memory"
        self.opener = build_opener(NoRedirects())

    def request(self, method, path, body=None, authenticated=True):
        headers = {"Accept": "application/json"}
        if authenticated and self.api_key:
            headers["X-API-Key"] = self.api_key
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        try:
            with self.opener.open(Request(self.base_url + path, data=data, headers=headers, method=method), timeout=15) as response:
                return json.loads(response.read())
        except HTTPError as exc:
            # Do not expose response bodies, credentials or request headers to the model/log.
            raise MemoryAPIError(f"AgentPlaybooks request failed (HTTP {exc.code}).", status=exc.code) from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise MemoryAPIError("AgentPlaybooks is unavailable or returned invalid JSON; the operation was not confirmed.") from None

    def assert_private(self):
        """Public AND unlisted playbooks are anonymously readable. Fail closed.

        Existing APIs need no backend deployment: anonymous metadata must be 404,
        then an authenticated memory read must succeed. A missing playbook or wrong
        key fails the second check. Do this before every write, not just at startup.
        """
        if not self.api_key:
            raise MemoryAPIError("A playbook-scoped memory API key is required.")
        try:
            self.request("GET", f"/api/playbooks/{self.guid}", authenticated=False)
        except MemoryAPIError as exc:
            if exc.status != 404:
                raise
        else:
            raise MemoryAPIError("Personal memory requires a private playbook. Public and unlisted playbooks are refused.")
        self.search(limit=1)

    def search(self, **params):
        query = urlencode({k: v for k, v in params.items() if v is not None})
        return self.request("GET", self.path + ("?" + query if query else ""))

    def read(self, key):
        return self.search(key=key)

    def write(self, key, body):
        self.assert_private()
        return self.request("PUT", self.path + "/" + quote(key, safe=""), body)

    def delete(self, key):
        self.assert_private()
        return self.request("DELETE", self.path + "/" + quote(key, safe=""))
