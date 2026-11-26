"""Bearer token from a helper command, for Microsoft Entra ID single sign-on.

Instead of a playbook API key, the provider can run a command that prints
``{"access_token": "...", "expires_at": <epoch seconds>}`` -- normally
``agentplaybooks token --entra --json --url=<instance>``, which renews the
signed-in user's session silently. The token is kept in memory only, until a
minute before it expires.

The command is an argument list (JSON array), never a shell string, so no
quoting rules or shell expansion apply.
"""
from __future__ import annotations

import json
import os
import subprocess
import threading
import time

TOKEN_COMMAND_ENV = "AGENTPLAYBOOKS_TOKEN_COMMAND"
RENEW_MARGIN = 60


class TokenUnavailable(RuntimeError):
    pass


def parse_token_command(value):
    """A JSON array of strings (or an already parsed list), else None."""
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        try:
            value = json.loads(value)
        except ValueError:
            raise ValueError(f"{TOKEN_COMMAND_ENV} must be a JSON array of strings.") from None
    if value is None or value == []:
        return None
    if not isinstance(value, list) or not all(isinstance(part, str) and part for part in value):
        raise ValueError("token_command must be a JSON array of non-empty strings.")
    return list(value)


class CommandTokenSource:
    def __init__(self, argv, run=None, clock=time.time, timeout=90):
        self.argv = list(argv)
        self._run = run or subprocess.run
        self._clock = clock
        self._timeout = timeout
        self._token = None
        self._expires_at = 0.0
        self._lock = threading.Lock()

    def invalidate(self):
        with self._lock:
            self._token = None
            self._expires_at = 0.0

    def token(self):
        with self._lock:
            if self._token and self._expires_at - RENEW_MARGIN > self._clock():
                return self._token
            kwargs = {"capture_output": True, "timeout": self._timeout, "check": False}
            if os.name == "nt":
                kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            try:
                result = self._run(self.argv, **kwargs)
            except (OSError, subprocess.SubprocessError):
                raise TokenUnavailable("the sign-in helper could not be started.") from None
            if result.returncode != 0:
                # stderr says what to do (e.g. sign in again); it carries no token.
                lines = (result.stderr or b"").decode("utf-8", "replace").strip().splitlines()
                raise TokenUnavailable(lines[-1][:300] if lines else "sign-in is required.")
            try:
                body = json.loads((result.stdout or b"").decode("utf-8"))
                token, expires_at = body["access_token"], float(body.get("expires_at") or 0)
            except (ValueError, KeyError, TypeError, AttributeError):
                raise TokenUnavailable("the sign-in helper returned no token.") from None
            if not isinstance(token, str) or not token:
                raise TokenUnavailable("the sign-in helper returned no token.")
            self._token, self._expires_at = token, expires_at or self._clock() + 300
            return token
