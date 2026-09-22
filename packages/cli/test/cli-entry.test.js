/**
 * How the binary answers before it does anything: `apb --help` is what a person
 * types, and it used to print "Unknown command '--help'" before the help they
 * asked for.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../src/cli.js";

async function capture(args) {
  const lines = [];
  const original = console.log;
  console.log = (...parts) => lines.push(parts.join(" "));
  try {
    await run(args);
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

test("--help prints the help rather than rejecting it as a command", async () => {
  const output = await capture(["--help"]);
  assert.match(output, /^AgentPlaybooks CLI/);
  assert.match(output, /agentplaybooks export hermes/);
});

test("-h, help and no arguments all reach the same place", async () => {
  const expected = await capture(["help"]);
  assert.equal(await capture(["-h"]), expected);
  assert.equal(await capture([]), expected);
});

test("an unknown command is still an error", async () => {
  await assert.rejects(() => run(["nonsense"]), /Unknown command 'nonsense'/);
});
