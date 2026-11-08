"""Offline tests; no real credentials, terminal input or network requests."""

import argparse
import contextlib
import getpass
import importlib.util
import io
import json
import sys
from pathlib import Path
import unittest
from unittest.mock import patch, Mock, MagicMock
import urllib.error
import warnings


path = Path(__file__).resolve().parents[1] / "skills/agentplaybooks/scripts/store-vault-secret.py"
spec = importlib.util.spec_from_file_location("store_vault_secret", path)
helper = importlib.util.module_from_spec(spec)
with patch.object(sys, "dont_write_bytecode", True):
    spec.loader.exec_module(helper)

KEY = "apb_TEST_ONLY_WRITE_KEY"
VALUE = "  TEST_ONLY_password_ä 🔒  "
ARGS = ["--playbook", "test-guid", "--name", "SERVICE_PASSWORD", "--category", "password"]


class UploadTests(unittest.TestCase):
    def setUp(self):
        self.output = io.StringIO()
        self.output.isatty = lambda: True
        self.stdin = Mock()
        self.stdin.isatty.return_value = True
        self.opener = MagicMock()
        response = self.opener.open.return_value.__enter__.return_value
        response.status = 201
        response.read.side_effect = AssertionError("Response bodies must not be read")
        self.context = contextlib.ExitStack()
        self.addCleanup(self.context.close)
        self.context.enter_context(contextlib.redirect_stdout(self.output))
        self.context.enter_context(contextlib.redirect_stderr(self.output))
        self.context.enter_context(patch.object(helper.sys, "stdin", self.stdin))
        self.confirm = self.context.enter_context(patch("builtins.input", return_value="yes"))
        self.hidden = self.context.enter_context(patch.object(helper.getpass, "getpass", side_effect=[KEY, VALUE, VALUE]))
        self.build = self.context.enter_context(patch.object(helper.urllib.request, "build_opener", return_value=self.opener))

    def assert_no_leak(self):
        for value in (KEY, VALUE, VALUE.strip()):
            self.assertNotIn(value, self.output.getvalue())

    def test_create_preserves_value_without_requesting_reveal(self):
        self.assertEqual(helper.main(ARGS), 0)
        request = self.opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://agentplaybooks.ai/api/playbooks/test-guid/secrets")
        self.assertEqual(request.method, "POST")
        self.assertEqual(request.get_header("Authorization"), "Bearer " + KEY)
        self.assertEqual(json.loads(request.data), {
            "value": VALUE, "name": "SERVICE_PASSWORD", "category": "password",
        })
        self.assertEqual(self.opener.open.call_args.kwargs["timeout"], 30)
        self.assertIsInstance(self.build.call_args.args[0], helper.NoRedirects)
        self.assert_no_leak()

    def test_rotation_only_updates_value(self):
        self.assertEqual(helper.main(ARGS + ["--rotate"]), 0)
        request = self.opener.open.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/secrets/SERVICE_PASSWORD"))
        self.assertEqual(request.method, "PUT")
        self.assertEqual(json.loads(request.data), {"value": VALUE})
        self.assert_no_leak()

    def test_refuses_noninteractive_input_before_prompting(self):
        self.stdin.isatty.return_value = False
        self.assertEqual(helper.main(ARGS), 1)
        self.hidden.assert_not_called()
        self.opener.open.assert_not_called()

    def test_cancel_sends_nothing(self):
        self.confirm.return_value = "no"
        self.assertEqual(helper.main(ARGS), 0)
        self.hidden.assert_not_called()
        self.opener.open.assert_not_called()

    def test_echo_fallback_aborts_before_reading_value(self):
        def fallback(*args, **kwargs):
            warnings.warn("Input would echo", getpass.GetPassWarning)
            self.fail("Echo fallback must be stopped by the warning")
        self.hidden.side_effect = fallback
        self.assertEqual(helper.main(ARGS), 1)
        self.assertIn("Hidden input is unavailable", self.output.getvalue())
        self.opener.open.assert_not_called()

    def test_mismatched_confirmation_does_not_upload(self):
        self.hidden.side_effect = [KEY, VALUE, "different-test-value"]
        self.assertEqual(helper.main(ARGS), 1)
        self.opener.open.assert_not_called()
        self.assert_no_leak()

    def test_http_errors_are_sanitized_and_not_retried(self):
        for status in (307, 401, 403, 409, 500):
            with self.subTest(status=status):
                self.hidden.side_effect = [KEY, VALUE, VALUE]
                body = io.BytesIO((VALUE + KEY).encode())
                self.opener.open.reset_mock()
                self.opener.open.side_effect = urllib.error.HTTPError(
                    "https://example.invalid/" + KEY, status, VALUE, {}, body,
                )
                self.assertEqual(helper.main(ARGS), 1)
                self.opener.open.assert_called_once()
                self.assertTrue(body.closed)
                self.assert_no_leak()

    def test_unexpected_exception_is_not_printed(self):
        self.opener.open.side_effect = RuntimeError(KEY + VALUE)
        self.assertEqual(helper.main(ARGS), 1)
        self.assert_no_leak()

    def test_network_failure_is_sanitized_and_not_retried(self):
        self.opener.open.side_effect = urllib.error.URLError(KEY + VALUE)
        self.assertEqual(helper.main(ARGS), 1)
        self.opener.open.assert_called_once()
        self.assert_no_leak()

    def test_invalid_cli_arguments_are_not_echoed(self):
        with self.assertRaises(SystemExit) as raised:
            helper.main(ARGS + ["--value", VALUE])
        self.assertEqual(raised.exception.code, 2)
        self.assert_no_leak()


class DestinationTests(unittest.TestCase):
    def test_https_only_and_no_url_credentials(self):
        for url in ("http://example.com", "https://user:password@example.com", "https://example.com/path",
                    "https://example.com/?value=secret", "https://example.com/#fragment", "https://example.com:bad"):
            with self.subTest(url=url), self.assertRaises(argparse.ArgumentTypeError):
                helper.server_origin(url)
        self.assertEqual(helper.server_origin("https://vault.example.com:8443/"), "https://vault.example.com:8443")

    def test_redirect_handler_does_not_forward_request(self):
        with self.assertRaises(helper.SafeError):
            helper.NoRedirects().redirect_request(Mock(), Mock(), 307, "redirect", {}, "https://other.invalid")


if __name__ == "__main__":
    unittest.main()
