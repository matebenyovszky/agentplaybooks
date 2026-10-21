import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyHermesSetup, checkHermesTools, planHermesSetup, publicHermesSetup } from "../src/hermes-setup.js";

const guid = "0123456789abcdef";
const id = "11111111-1111-1111-1111-111111111111";
async function fixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), "apb-setup-"));
  const root = path.join(base, "project");
  const hermesHome = path.join(base, "hermes");
  await mkdir(root); await mkdir(hermesHome);
  const fetchImpl = async url => {
    if (url.endsWith("/snapshots/latest")) return Response.json({ error: "not found" }, { status: 404 });
    if (url.endsWith("/playbooks")) return Response.json([{ id, guid }]);
    return Response.json({ id, guid, name: "Fixture", skills: [{ name: "hello", description: "Say hello", content: "Hello" }], instructions: "Do not install me", mcp_servers: [{ name: "hosted-api", transport_type: "openapi" }] });
  };
  return { root, options: { playbook: guid, hermesHome, profile: "work", env: {}, apiKey: "apb_test-not-a-real-key", fetchImpl, execute: async () => ({ stdout: "Hermes" }) } };
}

test("setup previews without writes, then restores files and merges one selected config idempotently", async () => {
  const { root, options } = await fixture();
  const profile = path.join(options.hermesHome, "profiles/work");
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, "config.yaml"), "# keep\nmodel: existing\n");
  await writeFile(path.join(profile, ".env"), "APBKS_KEY_AGENTPLAYBOOKS=secret-do-not-print\n");
  const plan = await planHermesSetup(root, options);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.diagnostics.keyDeclaredInProfile, true);
  assert.equal(plan.diagnostics.keyInProcess, false);
  assert.ok(!JSON.stringify(publicHermesSetup(plan)).includes("secret-do-not-print"));
  assert.ok(!JSON.stringify(plan).includes(options.apiKey));
  await assert.rejects(readFile(path.join(root, ".agents/skills/hello/SKILL.md")), { code: "ENOENT" });
  await applyHermesSetup(plan);
  const config = await readFile(path.join(profile, "config.yaml"), "utf8");
  assert.match(config, /# keep/); assert.match(config, /model: existing/);
  assert.match(config, /external_dirs/); assert.match(config, /\$\{APBKS_KEY_AGENTPLAYBOOKS\}/);
  assert.match(await readFile(path.join(root, ".agents/skills/hello/SKILL.md"), "utf8"), /Hello/);
  await assert.rejects(readFile(path.join(root, "AGENTS.md")), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(root, ".agents/mcp.json")), { code: "ENOENT" });
  assert.equal((await planHermesSetup(root, options)).changed, false);
  await assert.rejects(readFile(path.join(options.hermesHome, "config.yaml")), { code: "ENOENT" });
});

test("permission and missing-runtime diagnostics prevent all setup writes", async () => {
  const { root, options } = await fixture();
  const plan = await planHermesSetup(root, { ...options, writable: async () => false, execute: async () => { throw new Error("missing"); } });
  assert.ok(plan.conflicts.some(x => x.name === "profile"));
  assert.ok(plan.conflicts.some(x => x.name === "hermes"));
  await assert.rejects(applyHermesSetup(plan), /no files were written/);
  await assert.rejects(readFile(path.join(root, ".agents/skills/hello/SKILL.md")), { code: "ENOENT" });
});

test("conflicting local skill and stale profile never get overwritten", async () => {
  const { root, options } = await fixture();
  await mkdir(path.join(root, ".agents/skills/hello"), { recursive: true });
  await writeFile(path.join(root, ".agents/skills/hello/SKILL.md"), "my version");
  const plan = await planHermesSetup(root, options);
  assert.ok(plan.conflicts.length);
  await assert.rejects(applyHermesSetup(plan), /no files were written/);
  const clean = await fixture();
  const planned = await planHermesSetup(clean.root, clean.options);
  const profile = planned.diagnostics.profile;
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, "config.yaml"), "model: concurrent-edit\n");
  await assert.rejects(applyHermesSetup(planned), /changed after preview/);
});

test("tools-only setup needs no account login; remote-link symlinks fail before writes", async () => {
  const { root, options } = await fixture();
  const plan = await planHermesSetup(root, { ...options, apiKey: null, toolsOnly: true });
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.fileActions.length, 1);
  await applyHermesSetup(plan);
  const full = await planHermesSetup(root, options);
  const elsewhere = path.join(root, "elsewhere"); await mkdir(elsewhere);
  await symlink(elsewhere, path.join(root, ".agentplaybooks"));
  await assert.rejects(applyHermesSetup(full), /symlink/);
});

test("MCP verification handshakes, preserves session, lists tools, and never calls a tool", async () => {
  const methods = [];
  const fetchImpl = async (url, request) => {
    const body = JSON.parse(request.body); methods.push(body.method);
    assert.equal(request.headers["X-API-Key"], "not-a-real-secret");
    assert.equal(request.redirect, "error");
    if (body.method === "initialize") return Response.json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-03-26" } }, { headers: { "mcp-session-id": "fixture-session" } });
    assert.equal(request.headers["Mcp-Session-Id"], "fixture-session");
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    return new Response(`data: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "example" }] } })}\n\n`, { headers: { "Content-Type": "text/event-stream" } });
  };
  const result = await checkHermesTools("https://example.com/api/mcp/" + guid, { env: { APBKS_KEY_AGENTPLAYBOOKS: "not-a-real-secret" }, fetchImpl });
  assert.deepEqual(methods, ["initialize", "notifications/initialized", "tools/list"]);
  assert.equal(result.toolCount, 1); assert.equal(result.ok, true);
  assert.ok(!JSON.stringify(result).includes("not-a-real-secret"));
});

test("missing keys, redirects and protocol failures produce safe actionable results", async () => {
  const endpoint = "https://example.com/api/mcp/" + guid;
  assert.equal((await checkHermesTools(endpoint, { env: {} })).status, "missing-key-in-process");
  const options = { env: { APBKS_KEY_AGENTPLAYBOOKS: "test-secret" }, fetchImpl: async () => Response.json({ error: "test-secret" }, { status: 401 }) };
  assert.deepEqual(await checkHermesTools(endpoint, options), { ok: false, status: "HTTP 401" });
  await assert.rejects(checkHermesTools("http://remote.example/api/mcp/" + guid, options), /HTTPS/);
});

test("snapshot setup restores only complete skill trees and ignores unrelated local conflicts", async () => {
  const { createHash } = await import("node:crypto");
  const { SNAPSHOT_FORMAT, snapshotDigest } = await import("../src/snapshot.js");
  const { root, options } = await fixture();
  const file = (path, text) => ({ path, content: Buffer.from(text).toString("base64"), sha256: "sha256:" + createHash("sha256").update(text).digest("hex") });
  const snapshot = { format: SNAPSHOT_FORMAT, files: [file("AGENTS.md", "remote instructions"), file(".agents/skills/hello/SKILL.md", "hello"), file(".agents/skills/hello/assets/blob.bin", Buffer.from([0, 255, 1]))] };
  await writeFile(path.join(root, "AGENTS.md"), "local instructions");
  const fetchImpl = async url => url.endsWith("/snapshots/latest")
    ? Response.json({ snapshot, digest: snapshotDigest(snapshot) }) : options.fetchImpl(url);
  const plan = await planHermesSetup(root, { ...options, fetchImpl });
  assert.deepEqual(plan.conflicts, []);
  await applyHermesSetup(plan);
  assert.equal(await readFile(path.join(root, "AGENTS.md"), "utf8"), "local instructions");
  assert.deepEqual(await readFile(path.join(root, ".agents/skills/hello/assets/blob.bin")), Buffer.from([0, 255, 1]));
});


test("profile edits during a remote fetch invalidate the setup plan", async () => {
  const { root, options } = await fixture();
  const profile = path.join(options.hermesHome, "profiles/work");
  await mkdir(profile, { recursive: true });
  const config = path.join(profile, "config.yaml");
  await writeFile(config, "model: original\n");
  const fetchImpl = async url => {
    await writeFile(config, "model: edited-during-fetch\n");
    return options.fetchImpl(url);
  };
  const plan = await planHermesSetup(root, { ...options, fetchImpl });
  assert.ok(plan.conflicts.some(item => /changed while preparing/.test(item.reason)));
  await assert.rejects(applyHermesSetup(plan), /no files were written/);
  assert.equal(await readFile(config, "utf8"), "model: edited-during-fetch\n");
});
