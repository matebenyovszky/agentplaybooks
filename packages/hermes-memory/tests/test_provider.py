"""REST-contract tests; optionally exercise the real Hermes ABC/runtime imports."""
import copy
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlsplit

PACKAGE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE))
if os.environ.get("HERMES_SOURCE"):
    sys.path.insert(0, os.environ["HERMES_SOURCE"])
else:
    # Standalone tests substitute host services only; HTTP/client/provider logic is real.
    class Base:
        def sync_turn(self, *args, **kwargs): pass
        def on_session_end(self, *args, **kwargs): pass
        def shutdown(self): pass
    for name in ("agent", "agent.memory_provider", "agent.secret_scope", "hermes_constants", "utils"):
        sys.modules[name] = types.ModuleType(name)
    sys.modules["agent.memory_provider"].MemoryProvider = Base
    sys.modules["agent.secret_scope"].get_secret = lambda key, default="": os.environ.get(key, default)
    sys.modules["hermes_constants"].get_hermes_home = lambda: Path(os.environ["HERMES_HOME"])
    sys.modules["utils"].read_json_or_empty = lambda p: json.loads(p.read_text()) if p.exists() else {}
    sys.modules["utils"].atomic_json_write = lambda p, v, **kwargs: p.write_text(json.dumps(v))

from agentplaybooks import AgentPlaybooksMemoryProvider, CONFIG_FILE, KEY_ENV, register
from agentplaybooks.client import Client, MemoryAPIError, NoRedirects

A, B = "0123456789abcdef", "abcdef0123456789"


class Service:
    """Fake existing REST API behind urllib; records auth and mimics version history."""
    def __init__(self):
        self.books = {guid: {"visibility": "private", "key": f"key-{guid}", "entries": {}, "history": {}} for guid in (A, B)}
        self.calls = []

    def open(self, req, timeout=None):
        parts = urlsplit(req.full_url)
        segments = parts.path.split("/")
        guid = segments[3]
        book = self.books.get(guid)
        auth = req.get_header("X-api-key")
        self.calls.append((req.method, guid, auth, req.full_url))
        def fail(code):
            raise HTTPError(req.full_url, code, "hidden error", {}, io.BytesIO(b"secret-server-body"))
        if not book:
            fail(404)
        if len(segments) == 4:
            if book["visibility"] == "private": fail(404)
            return io.BytesIO(json.dumps({"visibility": book["visibility"]}).encode())
        if auth != book["key"] and (req.method != "GET" or book["visibility"] == "private"):
            fail(401)
        params = {k: v[0] for k, v in parse_qs(parts.query).items()}
        entries = book["entries"]
        if req.method == "GET":
            if "key" in params:
                if params["key"] not in entries: fail(404)
                result = entries[params["key"]]
            elif "history_key" in params:
                result = book["history"].get(params["history_key"], [])
            else:
                result = [x for x in entries.values() if params.get("scope") == "all" or not x.get("is_archived")]
                if params.get("scope") == "all":
                    result += [{**x, "history_id": "revision"} for history in book["history"].values() for x in history]
                if "tags" in params: result = [x for x in result if params["tags"] in x.get("tags", [])]
                if "search" in params: result = [x for x in result if params["search"].lower() in json.dumps(x).lower()]
                offset, limit = int(params.get("offset", 0)), int(params.get("limit", 100))
                result = result[offset:offset + limit]
        else:
            key = unquote(segments[-1])
            if req.method == "DELETE":
                entries.pop(key, None)
                book["history"].pop(key, None)
                result = {"success": True}
            else:
                body = json.loads(req.data)
                old = entries.get(key)
                if old and old["value"] != body["value"]:
                    book["history"].setdefault(key, []).append(copy.deepcopy(old))
                entries[key] = {**(old or {}), "key": key, "memory_at": "2026-09-22T12:00:00Z", **body}
                result = entries[key]
        return io.BytesIO(json.dumps(result).encode())


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.service = Service()
        self.patch = patch("agentplaybooks.client.build_opener", return_value=self.service)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.key_patch = patch("agentplaybooks.get_secret", side_effect=lambda name, default="": self.secrets.get(name, default))
        self.key_patch.start()
        self.addCleanup(self.key_patch.stop)
        self.secrets = {KEY_ENV: f"key-{A}"}
        self.home_patch = patch("agentplaybooks.get_hermes_home", return_value=self.home)
        self.home_patch.start()
        self.addCleanup(self.home_patch.stop)
        self.config(A)

    def config(self, guid, shared=""):
        (self.home / CONFIG_FILE).parent.mkdir(parents=True, exist_ok=True)
        (self.home / CONFIG_FILE).write_text(json.dumps({"playbook_guid": guid, "base_url": "https://example.test", "shared_playbooks": shared}))

    def provider(self, session="session-1", **kwargs):
        p = AgentPlaybooksMemoryProvider()
        p.initialize(session, hermes_home=str(self.home), agent_identity="researcher", **kwargs)
        return p

    def call(self, provider, name, **args):
        return json.loads(provider.handle_tool_call("apb_memory_" + name, args))

    def test_cross_session_recall_correction_history_archive_and_forget(self):
        p = self.provider()
        self.call(p, "write", key="coffee", value="Coffee without sugar")
        p.shutdown()
        q = self.provider("session-2")
        self.assertIn("without sugar", q.prefetch("coffee"))
        # Simulate an editor update through the same REST contract.
        q.client.write("coffee", {"value": "Coffee with milk"})
        self.assertEqual(self.call(q, "read", key="coffee")["value"], "Coffee with milk")
        self.assertEqual(len(self.call(q, "history", key="coffee")), 1)
        self.call(q, "archive", key="coffee")
        self.assertEqual(q.prefetch("coffee"), "")
        self.assertTrue(self.call(q, "read", key="coffee")["is_archived"])
        self.assertEqual(len(self.call(q, "history", key="coffee")), 1)
        self.call(q, "delete", key="coffee")
        self.assertIn("error", self.call(q, "read", key="coffee"))
        self.assertEqual(self.call(q, "history", key="coffee"), [])

    def test_mirror_replace_and_remove_use_substring_and_stable_key(self):
        p = self.provider(user_id="alice")
        p.on_memory_write("add", "user", "Coffee without sugar")
        key = next(iter(self.service.books[A]["entries"]))
        p.on_session_switch("session-2")
        p.on_turn_start(2, "correction", author_id="bob")
        p.on_memory_write("replace", "user", "Coffee with milk", {"old_text": "without sugar"})
        entry = self.service.books[A]["entries"][key]
        self.assertEqual(entry["value"], "Coffee with milk")
        self.assertEqual(entry["metadata"]["session_id"], "session-2")
        self.assertEqual(entry["metadata"]["author_id"], "bob")
        self.call(p, "archive", key=key)
        p.on_memory_write("remove", "user", "", {"old_text": "with milk"})
        self.assertFalse(self.service.books[A]["entries"])
        self.assertFalse(self.service.books[A]["history"])

    def test_readding_original_text_after_replacement_keeps_both_entries(self):
        p = self.provider()
        p.on_memory_write("add", "memory", "Coffee hot")
        p.on_memory_write("replace", "memory", "Coffee cold", {"old_text": "Coffee hot"})
        p.on_memory_write("add", "memory", "Coffee hot")
        values = {e["value"] for e in self.service.books[A]["entries"].values()}
        self.assertEqual(values, {"Coffee hot", "Coffee cold"})

    def test_profile_isolation_and_explicit_shared_read_only_access(self):
        p = self.provider()
        self.call(p, "write", key="private", value="Alice's memory")
        self.config(B, A)
        self.secrets = {KEY_ENV: f"key-{B}", f"AGENTPLAYBOOKS_SHARED_{A.upper()}_API_KEY": f"key-{A}"}
        q = self.provider("other-session")
        self.assertEqual(self.call(q, "search"), [])
        self.assertEqual(self.call(q, "read", key="private", source=A)["value"], "Alice's memory")
        self.assertIn("error", self.call(q, "write", key="private", value="overwritten", source=A))
        self.assertIn("error", self.call(q, "search", source="9999999999999999"))
        self.call(q, "write", key="private", value="Bob's memory")
        self.assertEqual(self.call(p, "read", key="private")["value"], "Alice's memory")
        self.assertTrue(all(auth in (None, f"key-{guid}") for _, guid, auth, _ in self.service.calls))

    def test_public_unlisted_wrong_key_and_visibility_change_fail_closed(self):
        for visibility in ("public", "unlisted"):
            self.service.books[A]["visibility"] = visibility
            with self.assertRaisesRegex(MemoryAPIError, "private playbook"):
                self.provider()
        self.service.books[A]["visibility"] = "private"
        self.secrets[KEY_ENV] = "wrong"
        with self.assertRaises(MemoryAPIError): self.provider()
        self.secrets[KEY_ENV] = f"key-{A}"
        p = self.provider()
        self.service.books[A]["visibility"] = "public"
        self.assertIn("error", self.call(p, "write", key="secret", value="must not upload"))
        self.assertNotIn("secret", self.service.books[A]["entries"])

    def test_registration_and_availability_are_offline(self):
        collected = []
        register(types.SimpleNamespace(register_memory_provider=collected.append))
        self.assertTrue(collected[0].is_available())
        self.assertFalse(self.service.calls)
        self.assertEqual(collected[0].name, "agentplaybooks-memory")

    def test_setup_saves_no_credentials_and_accepts_native_schema(self):
        p = AgentPlaybooksMemoryProvider()
        p.save_config({"playbook_guid": B, "api_key": "should-not-be-written"}, str(self.home))
        content = (self.home / CONFIG_FILE).read_text()
        self.assertNotIn("should-not-be-written", content)
        self.assertEqual(json.loads(content)["playbook_guid"], B)
        self.assertTrue(any(s.get("secret") and s.get("env_var") == KEY_ENV for s in p.get_config_schema()))

    def test_non_primary_cannot_write_and_no_transcripts_are_uploaded(self):
        for context in ("subagent", "cron", "flush"):
            p = self.provider(agent_context=context)
            self.assertIn("error", self.call(p, "write", key="x", value="x"))
            p.on_memory_write("add", "user", "should not save")
            p.sync_turn("sensitive transcript", "answer")
            p.on_session_end([{"role": "user", "content": "sensitive transcript"}])
        self.assertFalse(self.service.books[A]["entries"])
        self.assertFalse(any(method != "GET" for method, *_ in self.service.calls))

    def test_ambiguous_mirror_does_not_delete_multiple_entries(self):
        p = self.provider()
        p.on_memory_write("add", "memory", "Coffee hot")
        p.on_memory_write("add", "memory", "Coffee cold")
        with self.assertRaisesRegex(ValueError, "uniquely"):
            p.on_memory_write("remove", "memory", "", {"old_text": "Coffee"})
        self.assertEqual(len(self.service.books[A]["entries"]), 2)

    def test_network_errors_are_visible_without_secret_or_success_claim(self):
        p = self.provider()
        with patch.object(self.service, "open", side_effect=URLError("credential=secret-value")):
            result = self.call(p, "write", key="x", value="x")
        self.assertIn("error", result)
        self.assertNotIn("secret-value", json.dumps(result))
        self.assertFalse(self.service.books[A]["entries"])

    def test_keys_are_encoded_and_search_is_literal(self):
        p = self.provider()
        self.call(p, "write", key="space / unicode árvíz", value="100%_literal")
        self.assertEqual(len(self.call(p, "search", query="100%_literal")), 1)
        self.assertEqual(self.call(p, "search", query="unrelated question"), [])
        self.assertEqual(self.call(p, "read", key="space / unicode árvíz")["value"], "100%_literal")

    def test_invalid_config_urls_and_redirects(self):
        for url in ("http://external.example", "https://user:secret@example.com", "https://example.com?key=secret", "file:///tmp"):
            with self.assertRaises(ValueError): Client(url, A, "key")
        self.assertIsNone(NoRedirects().redirect_request(None, None, 302, "", {}, "https://evil.example"))


if __name__ == "__main__":
    unittest.main()
