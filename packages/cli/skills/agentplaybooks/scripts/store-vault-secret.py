#!/usr/bin/env python3
"""User-run hidden terminal input -> one HTTPS vault write. Python 3.10+."""

import argparse
import getpass
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import warnings


class SafeError(Exception):
    """Messages in this class are fixed text, never server/input diagnostics."""


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse normally repeats invalid arguments, which could be a secret.
        self.exit(2, "Invalid metadata arguments. Use --help; never pass credentials as arguments.\n")


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SafeError("Redirect refused. Check the server address; nothing was resent.")


def server_origin(value):
    try:
        url = urllib.parse.urlsplit(value)
        port = url.port
    except ValueError:
        raise argparse.ArgumentTypeError("Use an HTTPS server origin.") from None
    if (url.scheme != "https" or not url.hostname or url.username is not None
            or url.password is not None or url.path not in ("", "/")
            or url.query or url.fragment or any(c.isspace() for c in value)
            or (port is not None and not 1 <= port <= 65535)):
        raise argparse.ArgumentTypeError("Use an HTTPS origin without credentials, path, query or fragment.")
    return urllib.parse.urlunsplit(("https", url.netloc, "", "", ""))


def identifier(value):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
        raise argparse.ArgumentTypeError("Use letters, numbers, hyphens or underscores.")
    return value


def hidden_input(prompt):
    # getpass normally falls back to echoed input. Abort before that fallback.
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        try:
            return getpass.getpass(prompt, stream=sys.stderr)
        except getpass.GetPassWarning:
            raise SafeError("Hidden input is unavailable. Use the vault web UI instead.") from None


def store(args):
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise SafeError("Run this in your own interactive terminal, outside the agent session.")
    action = "Rotate existing secret" if args.rotate else "Create new secret"
    print(f"{action}: {args.server} / playbook {args.playbook} / {args.name}")
    if input("Type yes to continue: ") != "yes":
        print("Cancelled; nothing was sent.")
        return

    key = hidden_input("Playbook API key with secrets:write (hidden): ")
    if not key or "\r" in key or "\n" in key:
        raise SafeError("A nonempty, single-line playbook API key is required.")
    value = hidden_input("Secret value (hidden): ")
    if not value.strip():
        raise SafeError("The secret value must not be empty.")
    if hidden_input("Repeat secret value (hidden): ") != value:
        raise SafeError("Values did not match; nothing was sent.")

    path = f"/api/playbooks/{args.playbook}/secrets"
    payload = {"value": value}
    if args.rotate:
        path += "/" + args.name
    else:
        # The create API defaults reveal to false; never request enabling it.
        payload.update(name=args.name, category=args.category)
    request = urllib.request.Request(
        args.server + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        method="PUT" if args.rotate else "POST",
    )
    try:
        # Default HTTPS certificate/hostname verification stays enabled.
        # Never follow a redirect carrying the credential or secret body.
        with urllib.request.build_opener(NoRedirects()).open(request, timeout=30) as response:
            if response.status not in (200, 201, 204):
                raise SafeError("Unexpected server status. Check vault metadata before retrying.")
            # Do not read/print response bodies, even on success.
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        if status == 409:
            raise SafeError("The name already exists. Rotate only if replacing it was intended.") from None
        if status in (401, 403):
            raise SafeError("Access denied. Check the playbook key and secrets:write permission.") from None
        raise SafeError("Vault write failed. Check vault metadata before retrying.") from None
    except urllib.error.URLError:
        raise SafeError("Connection or TLS failure. Check vault metadata before retrying.") from None
    print("Vault write succeeded. Secret values were not printed.")


def main(argv=None):
    parser = SafeArgumentParser(description=__doc__)
    parser.add_argument("--server", type=server_origin, default="https://agentplaybooks.ai")
    parser.add_argument("--playbook", type=identifier, required=True, help="Target playbook GUID")
    parser.add_argument("--name", type=identifier, required=True, help="Secret identifier, never its value")
    parser.add_argument("--category", choices=("api_key", "password", "token", "certificate", "connection_string", "general"), default="general")
    parser.add_argument("--rotate", action="store_true", help="Explicitly replace an existing secret value")
    args = parser.parse_args(argv)
    try:
        store(args)
        return 0
    except SafeError as error:
        print(str(error), file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        print("Cancelled. If upload had started, check vault metadata before retrying.", file=sys.stderr)
        return 130
    except Exception:
        # Exception messages/tracebacks may include request bodies or credentials.
        print("Operation failed. No diagnostic payload was printed; check vault metadata before retrying.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
