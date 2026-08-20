import test from "node:test";
import assert from "node:assert/strict";
import { decidePush } from "../src/remote.js";
import { pushableInventory } from "../src/doctor.js";

/**
 * `push` used to print a plan and stop, requiring a second invocation with
 * --apply. These pin the rules that replaced that: an upload leaves the machine,
 * so consent is required, but the interactive case should not need two runs.
 *
 * The property that matters most is the last group — nothing uploads without
 * explicit consent or a human answering.
 */

const base = {
  apply: false,
  yes: false,
  json: false,
  interactive: true,
  actionCount: 3,
};

test("--apply uploads without asking, as it always did", () => {
  assert.deepEqual(decidePush({ ...base, apply: true }), {
    upload: true,
    reason: "explicit",
  });
});

test("--yes uploads without asking", () => {
  assert.deepEqual(decidePush({ ...base, yes: true }), {
    upload: true,
    reason: "explicit",
  });
});

test("--yes works on a pipe, which is the point of it", () => {
  // A CI runner has no TTY; this is the flag that lets it push at all.
  assert.equal(decidePush({ ...base, yes: true, interactive: false }).upload, true);
});

test("an interactive run with something to do asks", () => {
  assert.deepEqual(decidePush(base), { upload: false, reason: "ask" });
});

test("an empty plan neither asks nor uploads", () => {
  // Asking whether to upload nothing spends a decision on a non-event.
  assert.deepEqual(decidePush({ ...base, actionCount: 0 }), {
    upload: false,
    reason: "nothing-to-do",
  });
});

test("--json never asks: its reader is a program, not a person", () => {
  assert.deepEqual(decidePush({ ...base, json: true }), {
    upload: false,
    reason: "needs-explicit-flag",
  });
});

test("a pipe with no consent flag reports rather than guessing", () => {
  assert.deepEqual(decidePush({ ...base, interactive: false }), {
    upload: false,
    reason: "needs-explicit-flag",
  });
});

test("nothing uploads unless consent was explicit or a human can answer", () => {
  // The safety property, stated over the whole input space rather than by
  // example: an upload is only ever reached through --apply/--yes, or through a
  // prompt an interactive user sees.
  for (const apply of [false, true]) {
    for (const yes of [false, true]) {
      for (const json of [false, true]) {
        for (const interactive of [false, true]) {
          for (const actionCount of [0, 1, 7]) {
            const decision = decidePush({ apply, yes, json, interactive, actionCount });
            if (decision.upload) {
              assert.ok(apply || yes, `uploaded without consent: ${JSON.stringify({ apply, yes, json, interactive, actionCount })}`);
            }
            if (decision.reason === "ask") {
              assert.ok(interactive && !json && actionCount > 0);
            }
          }
        }
      }
    }
  }
});

test("--apply still wins over an empty plan, so scripts stay predictable", () => {
  // applyPush on an empty plan is a no-op; short-circuiting it here would make
  // --apply mean different things depending on state.
  assert.equal(decidePush({ ...base, apply: true, actionCount: 0 }).upload, true);
});

/**
 * `doctor` now answers "what would leave this machine?" before anyone runs
 * push. The exclusion is the part worth pinning: an MCP client config carries
 * auth headers, and a playbook can be shared with people the credential was
 * never meant for.
 */

const report = (inventory) => ({
  score: 100,
  findings: [],
  inventory: { instructions: [], skills: [], mcpConfigs: [], mcpServers: [], ...inventory },
});

test("doctor reports what a push would upload", () => {
  const { uploads } = pushableInventory(report({
    skills: [{}, {}, {}],
    instructions: [{}],
  }));
  assert.deepEqual(uploads, [
    { kind: "skill", count: 3 },
    { kind: "instruction file", count: 1 },
  ]);
});

test("doctor names MCP client configs as excluded, with the reason", () => {
  const { excluded } = pushableInventory(report({
    skills: [{}],
    mcpConfigs: [{}, {}],
  }));
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].kind, "MCP client config");
  assert.equal(excluded[0].count, 2);
  assert.match(excluded[0].why, /auth header/);
});

test("nothing is reported as excluded when there is no MCP config", () => {
  assert.deepEqual(pushableInventory(report({ skills: [{}] })).excluded, []);
});

test("an empty project reports nothing to upload", () => {
  assert.deepEqual(pushableInventory(report({})).uploads, []);
});

test("MCP server definitions are not counted as uploads or exclusions", () => {
  // They travel inside the playbook, unlike a client config. Counting them in
  // either list would misdescribe what push does.
  const result = pushableInventory(report({ mcpServers: [{}, {}] }));
  assert.deepEqual(result.uploads, []);
  assert.deepEqual(result.excluded, []);
});
