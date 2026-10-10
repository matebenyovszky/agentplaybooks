import io
import json
import os
import ssl
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from apb_secrets import ConfigurationError, SecretsClient, SecretsError, load_env


class Response(io.BytesIO):
    status = 200

    def __init__(self, values):
        super().__init__(json.dumps({"values": values}).encode())


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.client = SecretsClient("test-guid", api_key="apb_fixture")

    def reply(self, values):
        return patch.object(self.client._opener, "open", return_value=Response(values))

    def test_ci_with_existing_values_needs_no_config_files_or_network(self):
        env = {"DATABASE_URL": "from-ci", "SERVICE_API_KEY": "", "AGENTPLAYBOOKS_PLAYBOOK_KEY_FILE": "/absent"}
        with patch("apb_secrets.client.SecretsClient.from_env") as factory:
            self.assertEqual(load_env(["DATABASE_URL", "SERVICE_API_KEY"], environ=env), ())
            factory.assert_not_called()

    def test_batch_aliases_optional_and_existing_precedence(self):
        env = {"EXISTING": "from-ci"}
        with self.reply({"DEV_DB": "db-value"}) as call:
            loaded = self.client.load_env({"DATABASE_URL": "DEV_DB", "EXISTING": "UNUSED"},
                                          optional=["OPTIONAL"], environ=env)
        self.assertEqual(loaded, ("DATABASE_URL",))
        self.assertEqual(env, {"EXISTING": "from-ci", "DATABASE_URL": "db-value"})
        payload = json.loads(call.call_args.args[0].data)
        self.assertEqual(payload, {"names": ["DEV_DB"], "optional_names": ["OPTIONAL"], "auth_mode": "api_key"})
        self.assertEqual(call.call_args.args[0].get_header("Authorization"), "Bearer apb_fixture")
        self.assertEqual(call.call_args.kwargs["timeout"], 15)

    def test_override_is_explicit(self):
        env = {"TOKEN": "old"}
        with self.reply({"TOKEN": "new"}):
            self.client.load_env(["TOKEN"], override=True, environ=env)
        self.assertEqual(env["TOKEN"], "new")

    def test_incomplete_and_invalid_responses_leave_environment_unchanged(self):
        for values in ({"A": "first"}, {"A": "first", "B": 42},
                       {"A": "first", "B": "bad\0value"}, {"A": "first", "B": "ok", "EXTRA": "unexpected"}):
            with self.subTest(values_type=list(values)):
                env = {"ORIGINAL": "untouched"}
                with self.reply(values), self.assertRaises(SecretsError):
                    self.client.load_env(["A", "B"], environ=env)
                self.assertEqual(env, {"ORIGINAL": "untouched"})

    def test_http_failure_never_prints_response_body_or_key(self):
        failure = HTTPError("https://example.test", 403, "private-info", {}, io.BytesIO(b"secret-value"))
        with patch.object(self.client._opener, "open", side_effect=failure):
            with self.assertRaises(SecretsError) as caught:
                self.client.get("TOKEN")
        self.assertEqual(str(caught.exception), "Secret loading failed (HTTP 403).")
        self.assertNotIn("apb_fixture", repr(self.client))

    def test_unavailable_service_does_not_fall_back_or_change_env(self):
        env = {"EXISTING": "ci"}
        with patch.object(self.client._opener, "open", side_effect=URLError("sensitive details")):
            with self.assertRaises(SecretsError) as caught:
                self.client.load_env(["TOKEN"], environ=env)
        self.assertNotIn("sensitive", str(caught.exception))
        self.assertEqual(env, {"EXISTING": "ci"})

    def test_direct_get_does_not_populate_environment(self):
        with self.reply({"APB_TEST_TOKEN": "value"}), patch.dict(os.environ, {}, clear=True):
            self.assertEqual(self.client.get("APB_TEST_TOKEN"), "value")
            self.assertNotIn("APB_TEST_TOKEN", os.environ)

    def test_configuration_validates_auth_tls_and_names(self):
        for config in ({"base_url": "http://example.com"}, {"base_url": "https://example.com/path"},
                       {"base_url": "https://user:pass@example.com"}, {"timeout": 0},
                       {"timeout": float("nan")}, {"certificate": "cert"},
                       {"certificate": "cert", "private_key": "key"}):
            with self.subTest(config=config), self.assertRaises(ConfigurationError):
                SecretsClient("guid", api_key="apb_fixture", **config)
        with self.assertRaises(ConfigurationError):
            self.client.load_env({"BAD-NAME": "TOKEN"})
        with self.assertRaises(ConfigurationError):
            self.client.get_many("TOKEN")
        with self.assertRaises(ConfigurationError):
            self.client.get_many(["TOKEN"], optional=["TOKEN"])

    def test_key_file_and_explicit_configuration(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "key"
            path.write_text("apb_from_file\n")
            client = SecretsClient.from_env(environ={
                "AGENTPLAYBOOKS_PLAYBOOK_GUID": "guid", "AGENTPLAYBOOKS_PLAYBOOK_KEY_FILE": str(path),
            })
            self.assertEqual(client._api_key, "apb_from_file")
        client = SecretsClient.from_env(environ={"AGENTPLAYBOOKS_PLAYBOOK_KEY_FILE": "/absent"},
                                        playbook="guid", api_key="apb_explicit")
        self.assertEqual(client._api_key, "apb_explicit")


class TLSHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.received.append((body, self.headers.get("Authorization"), bool(self.connection.getpeercert())))
        if self.path.endswith("/redirect/secrets/resolve"):
            self.send_response(302)
            self.send_header("Location", "/api/playbooks/target/secrets/resolve")
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"values": {name: "in-memory-fixture" for name in body["names"]}}).encode())


class RealTLSTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        root = Path(cls.folder.name)

        def openssl(*args):
            subprocess.run(["openssl", *args], cwd=root, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

        openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.crt",
                "-days", "1", "-subj", "/CN=APB Test CA", "-addext", "keyUsage=critical,keyCertSign,cRLSign")
        (root / "ext.cnf").write_text("subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth,clientAuth\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\n")
        for identity in ("server", "client"):
            openssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", f"{identity}.key",
                    "-out", f"{identity}.csr", "-subj", f"/CN={identity}")
            openssl("x509", "-req", "-in", f"{identity}.csr", "-CA", "ca.crt", "-CAkey", "ca.key",
                    "-CAcreateserial", "-out", f"{identity}.crt", "-days", "1", "-extfile", "ext.cnf")
        cls.root = root

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), TLSHandler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(self.root / "server.crt", self.root / "server.key")
        context.load_verify_locations(self.root / "ca.crt")
        context.verify_mode = ssl.CERT_REQUIRED
        self.server.socket = context.wrap_socket(self.server.socket, server_side=True)
        self.server.received = []
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"https://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def client(self, playbook="guid", **overrides):
        config = dict(certificate=self.root / "client.crt", private_key=self.root / "client.key",
                      base_url=self.base_url, ca_bundle=self.root / "ca.crt", timeout=3)
        config.update(overrides)
        return SecretsClient(playbook, **config)

    def test_certificate_authentication_and_batch_over_real_tls(self):
        env = {}
        self.assertEqual(self.client().load_env(["TOKEN"], environ=env), ("TOKEN",))
        self.assertEqual(env["TOKEN"], "in-memory-fixture")
        body, bearer, certificate_present = self.server.received[0]
        self.assertEqual(body["auth_mode"], "mtls")
        self.assertIsNone(bearer)
        self.assertTrue(certificate_present)

    def test_absent_client_certificate_is_rejected_by_tls(self):
        with self.assertRaises(SecretsError):
            self.client(certificate=None, private_key=None, api_key="apb_fixture").get("TOKEN")
        self.assertEqual(self.server.received, [])

    def test_api_key_authentication_over_real_tls(self):
        self.server.socket.context.verify_mode = ssl.CERT_OPTIONAL
        client = self.client(certificate=None, private_key=None, api_key="apb_fixture")
        self.assertEqual(client.get("TOKEN"), "in-memory-fixture")
        body, bearer, certificate_present = self.server.received[0]
        self.assertEqual(body["auth_mode"], "api_key")
        self.assertEqual(bearer, "Bearer apb_fixture")
        self.assertFalse(certificate_present)

    def test_untrusted_server_is_rejected(self):
        with self.assertRaises(SecretsError):
            self.client(ca_bundle=None).get("TOKEN")
        self.assertEqual(self.server.received, [])

    def test_redirect_is_not_followed(self):
        with self.assertRaisesRegex(SecretsError, "HTTP 302"):
            self.client("redirect").get("TOKEN")
        self.assertEqual(len(self.server.received), 1)


if __name__ == "__main__":
    unittest.main()
