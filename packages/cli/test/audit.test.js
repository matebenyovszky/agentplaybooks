import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditQueryFromFlags, collectExportGuids, validateExportFormat } from "../src/audit.js";
import { run } from "../src/cli.js";

test("the packaged executable includes the audit commands", () => {
  const executable = fileURLToPath(new URL("../bin/agentplaybooks.js", import.meta.url));
  const result = spawnSync(process.execPath, [executable, "--help"], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agentplaybooks audit export/);
  assert.match(result.stdout, /agentplaybooks audit verify/);
});

function fakeFetch(routes) {
  return async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url);
    const handler = routes[`${init.method ?? "GET"} ${pathname}`] ?? routes[pathname];
    if (!handler) return { ok: false, status: 404, text: async () => JSON.stringify({ error: "missing" }), json: async () => ({ error: "missing" }) };
    const result = handler(searchParams, init);
    const body = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
    return {
      ok: (result.status ?? 200) < 400,
      status: result.status ?? 200,
      headers: { get: () => result.contentType ?? "application/json" },
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  };
}

test("audit flags become query parameters", () => {
  const flags = new Map([
    ["--format", "csv"],
    ["--since", "2026-01-01T00:00:00.000Z"],
    ["--actor", "owner-1"],
    ["--action", "secret.use"],
  ]);
  assert.deepEqual(auditQueryFromFlags(flags), {
    format: "csv",
    since: "2026-01-01T00:00:00.000Z",
    actor: "owner-1",
    action: "secret.use",
  });
  assert.equal(validateExportFormat("ndjson"), "jsonl");
});

test("apb audit export writes JSONL from the export endpoint", async () => {
  const fetchImpl = fakeFetch({
    "GET /api/playbooks/guid-1/audit/export": (params) => {
      assert.equal(params.get("format"), "jsonl");
      assert.equal(params.get("action"), "secret.");
      return { body: '{"id":"1","operation":"secret.use"}\n', contentType: "application/x-ndjson" };
    },
  });
  const chunks = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true; };
  const originalKey = process.env.AGENTPLAYBOOKS_API_KEY;
  process.env.AGENTPLAYBOOKS_API_KEY = "apb_test_key";
  try {
    const { fetchAuditExport: fetchExport } = await import("../src/audit.js");
    const text = await fetchExport("https://remote.test", "apb_test_key", "guid-1", { format: "jsonl", action: "secret." }, { fetchImpl });
    assert.match(text, /secret.use/);
  } finally {
    process.stdout.write = originalWrite;
    process.env.AGENTPLAYBOOKS_API_KEY = originalKey;
  }
});

test("collectExportGuids keeps owner and auditor playbooks", async () => {
  const fetchImpl = fakeFetch({
    "GET /api/manage/playbooks": () => ({
      body: [
        { guid: "owned", current_user_role: "owner" },
        { guid: "edited", current_user_role: "editor" },
        { guid: "audited", current_user_role: "auditor" },
      ],
    }),
  });
  const guids = await collectExportGuids("https://remote.test", "apb_test_key", null, { fetchImpl });
  assert.deepEqual(guids, ["owned", "audited"]);
});

test("apb audit verify reports a 409 broken chain instead of throwing", async () => {
  const { fetchAuditVerify } = await import("../src/audit.js");
  const fetchImpl = fakeFetch({
    "GET /api/playbooks/guid-1/audit/verify": () => ({
      status: 409,
      body: { ok: false, first_broken_link: { index: 1, reason: "hash" } },
    }),
  });
  const report = await fetchAuditVerify("https://remote.test", "apb_test_key", "guid-1", { fetchImpl });
  assert.equal(report.ok, false);
  assert.equal(report.first_broken_link.reason, "hash");
});

test("help lists the audit commands", async () => {
  const lines = [];
  const original = console.log;
  console.log = (...parts) => lines.push(parts.join(" "));
  try {
    await run(["--help"]);
  } finally {
    console.log = original;
  }
  const output = lines.join("\n");
  assert.match(output, /agentplaybooks audit export/);
  assert.match(output, /agentplaybooks audit verify/);
});
