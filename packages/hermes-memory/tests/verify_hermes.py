"""Real Hermes discovery + multiplex scopes + REST transport. No model/account needed.

Set HERMES_SOURCE to a Hermes checkout. Uses only temporary profiles and a local
HTTP server; never reads a user's Hermes configuration or API credentials.
"""
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request

if not os.environ.get("HERMES_SOURCE"):
    raise SystemExit("Set HERMES_SOURCE to a Hermes checkout.")
sys.path.insert(0, os.environ["HERMES_SOURCE"])

# Must be set before importing any host module, including the REST fixture.
scratch = tempfile.TemporaryDirectory(prefix="apb-hermes-contract-")
os.environ["HERMES_HOME"] = str(Path(scratch.name) / "process")
from test_provider import A, B, Service, PACKAGE
from agent.secret_scope import set_secret_scope, reset_secret_scope, set_multiplex_active
from agent.memory_manager import MemoryManager
from hermes_constants import set_hermes_home_override, reset_hermes_home_override
from plugins.memory import load_memory_provider, list_memory_provider_names
from plugins.memory.config_schema import get_provider_config_schema

service = Service()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass

    def respond(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))) or None
        req = Request("http://localhost" + self.path, data=body,
                      headers={"X-API-Key": self.headers.get("X-API-Key", "")}, method=self.command)
        try:
            response = service.open(req)
            content, status = response.read(), 200
        except HTTPError as error:
            content, status = b'{"error":"denied"}', error.code
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    do_GET = do_PUT = do_DELETE = respond


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
set_multiplex_active(True)
try:
    for index, guid in enumerate((A, B, A)):
        home = Path(scratch.name) / guid
        destination = home / "plugins" / "agentplaybooks"
        if not destination.exists():
            shutil.copytree(PACKAGE / "agentplaybooks", destination,
                            ignore=shutil.ignore_patterns("__pycache__"))
            (home / "config.yaml").write_text("memory:\n  provider: agentplaybooks\n")
            (home / "agentplaybooks").mkdir()
            (home / "agentplaybooks" / "config.json").write_text(json.dumps({
                "playbook_guid": guid, "base_url": f"http://127.0.0.1:{server.server_port}"}))
        home_token = set_hermes_home_override(home)
        secret_token = set_secret_scope({"AGENTPLAYBOOKS_MEMORY_API_KEY": f"key-{guid}"})
        try:
            assert "agentplaybooks" in list_memory_provider_names()
            panel = get_provider_config_schema("agentplaybooks")
            assert panel and panel.name == "agentplaybooks"
            provider = load_memory_provider("agentplaybooks")
            assert provider is not None and provider.is_available()
            manager = MemoryManager()
            manager.add_provider(provider)
            manager.initialize_all(f"session-{index}", agent_identity=guid, agent_context="primary")
            assert provider.client.guid == guid
            assert any(t["name"] == "apb_memory_write" for t in manager.get_all_tool_schemas())
            result = json.loads(provider.handle_tool_call("apb_memory_search", {}))
            assert len(result) == (1 if index == 2 else 0), result
            if index < 2:
                manager.notify_memory_tool_write({"success": True},
                    {"action": "add", "target": "user", "content": f"Coffee preference {guid}"})
                assert len(service.books[guid]["entries"]) == 1
            else:
                manager.notify_memory_tool_write({"success": True},
                    {"action": "replace", "target": "user", "old_text": "Coffee preference", "content": "Coffee with milk"})
                assert "with milk" in manager.prefetch_all("Coffee", session_id=f"session-{index}")
                manager.notify_memory_tool_write({"success": True},
                    {"action": "remove", "target": "user", "old_text": "with milk"})
                assert not service.books[A]["entries"]
                assert len(service.books[B]["entries"]) == 1
            manager.shutdown_all()
        finally:
            reset_secret_scope(secret_token)
            reset_hermes_home_override(home_token)
    assert all(auth in (None, "", f"key-{guid}") for _, guid, auth, _ in service.calls)
    print("PASS: real Hermes discovery, Desktop settings, tool injection, memory-write hooks, recall, and A -> B -> A profile isolation over HTTP")
finally:
    set_multiplex_active(False)
    server.shutdown()
    server.server_close()
    scratch.cleanup()
