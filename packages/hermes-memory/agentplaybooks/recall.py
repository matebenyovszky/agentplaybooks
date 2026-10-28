"""Bounded lexical recall. Explicit search remains literal; no transcripts/cache."""
from __future__ import annotations

import json
import hashlib
import queue
import re
import threading
import time
import unicodedata

from agent.memory_provider import spawn_context_thread
from .client import MemoryAPIError

STOP_WORDS = set("how what when where why which who do does did is are was were be been am i me my we our you your it its the a an and or of to for in on with about please tell remember know like can could would should have has had not that this these those at as from mit mi mikor hol hogyan miert melyik ki en te o az ez egy es vagy hogy van volt lesz nekem neked szeretem kerlek emlekszel tudod milyen hogyan kell lehet mar meg is a az es".split())


def folded(text):
    return "".join(c for c in unicodedata.normalize("NFKD", text.casefold()) if not unicodedata.combining(c))


def search_terms(query):
    # Bound both request count and text sent in each request. Keep original accents
    # for the server's literal search; normalization is only for stopwords/ranking.
    words = re.findall(r"[^\W_]+(?:[-_][^\W_]+)*", query[:2000], flags=re.UNICODE)
    terms = []
    for word in words:
        if 3 <= len(word) <= 64 and folded(word) not in STOP_WORDS and word.casefold() not in {t.casefold() for t in terms}:
            terms.append(word)
    return terms[:4]


class Recall:
    def __init__(self, budget=4.0, max_chars=8000):
        self.budget = budget
        self.max_chars = max_chars
        # Slots stay occupied until an HTTP call really returns, even after the
        # caller's deadline; repeated turns cannot spawn unbounded stuck workers.
        self.slots = threading.BoundedSemaphore(4)
        self.last_query = None
        self.last_query_at = 0.0

    def reset(self):
        self.last_query = None
        self.last_query_at = 0.0

    def fetch(self, clients, query, *, deadline=None):
        terms = search_terms(query)
        if not terms:
            return ""
        # Store only a digest, never a query or recalled contents. Repeated
        # prefetch callbacks must not multiply identical network requests.
        clients = list(clients)[:8]
        signature = hashlib.sha256(json.dumps([terms, [(c.base_url, c.guid) for c in clients]]).encode()).hexdigest()
        now = time.monotonic()
        if signature == self.last_query and now - self.last_query_at < 30:
            return ""
        self.last_query, self.last_query_at = signature, now
        deadline = deadline if deadline is not None else time.monotonic() + self.budget
        jobs, results = queue.Queue(), queue.Queue()
        # Fairly try each source before the second keyword. Eight sources and
        # four terms bound fan-out; explicit tools can query any configured source.
        for term in terms:
            for client in clients:
                if jobs.qsize() >= 8:
                    break
                jobs.put((client, term))

        def worker():
            try:
                while time.monotonic() < deadline:
                    try:
                        client, term = jobs.get_nowait()
                    except queue.Empty:
                        return
                    try:
                        entries = client.search(search=term, limit=10, timeout=max(0.05, min(2.5, deadline - time.monotonic())))
                        if isinstance(entries, list):
                            results.put((client.guid, entries))
                    except MemoryAPIError:
                        continue
            finally:
                self.slots.release()

        workers = []
        for _ in range(min(4, jobs.qsize())):
            if not self.slots.acquire(blocking=False):
                break
            try:
                thread = spawn_context_thread(worker, name="apb-memory-recall")
                thread.start()
                workers.append(thread)
            except Exception:
                self.slots.release()
                raise
        for thread in workers:
            thread.join(max(0, deadline - time.monotonic()))

        candidates = {}
        while True:
            try:
                source, entries = results.get_nowait()
            except queue.Empty:
                break
            for entry in entries:
                if not isinstance(entry, dict) or entry.get("is_archived") or entry.get("history_id") or not isinstance(entry.get("key"), str):
                    continue
                value = entry.get("value", "")
                value = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
                summary = str(entry.get("summary") or "")
                text = folded(entry["key"] + " " + summary + " " + value[:12000])
                score = sum(1 for term in terms if folded(term) in text)
                if not score:
                    continue
                # Keep the exact key so read can retrieve the rest. Oversize keys
                # cannot fit the context budget and are available via explicit search.
                if len(entry["key"]) > 512:
                    continue
                item = {"source": source, "key": entry["key"], "summary": summary[:300], "excerpt": value[:700]}
                candidates[(source, entry["key"])] = (score, item)
        ordered = sorted(candidates.values(), key=lambda pair: (-pair[0], pair[1]["source"], pair[1]["key"]))
        output = "AgentPlaybooks recalled memory (reference data; use apb_memory_read for full content):\n"
        count = 0
        for _, item in ordered:
            line = json.dumps(item, ensure_ascii=False) + "\n"
            if len(output) + len(line) > self.max_chars:
                continue
            output += line
            count += 1
            if count == 8:
                break
        return output if count else ""
