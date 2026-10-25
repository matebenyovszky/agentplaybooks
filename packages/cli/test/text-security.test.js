import test from "node:test";
import assert from "node:assert/strict";
import { resolveBaseUrl } from "../src/remote.js";
import { pluginName } from "../src/plugin-package.js";

test("long punctuation suffixes cannot trigger regex backtracking", { timeout: 2000 }, () => {
  assert.equal(resolveBaseUrl("https://example.test" + "/".repeat(250000), {}), "https://example.test");
  assert.equal(resolveBaseUrl("https://example.test/" + "/".repeat(250000) + "x", {}), "https://example.test/" + "/".repeat(250000) + "x");
  assert.equal(pluginName("hello" + ".-".repeat(125000)), "hello");
  assert.equal(pluginName(".-".repeat(125000)), "agent-playbook");
  assert.equal(pluginName("..Hello--World.."), "hello-world");
});
