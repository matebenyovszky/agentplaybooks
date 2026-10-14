/**
 * A key pasted at `apb login` or `apb secrets login` must not appear on screen:
 * it would stay in the scrollback and in any screen share of the terminal.
 */
import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";

import { promptForKey, promptForLine } from "../src/prompt.js";

const KEY = "apb_live_THE-ACTUAL-KEY-1234567890";

// Enough of a tty.ReadStream and tty.WriteStream for readline: the input can
// be switched to raw mode, and everything written to the output is kept.
function fakeTerminal() {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.rawModes = [];
  input.setRawMode = (mode) => {
    input.isRaw = mode;
    input.rawModes.push(mode);
    return input;
  };
  let screen = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      screen += chunk;
      callback();
    },
  });
  output.isTTY = true;
  output.columns = 80;
  return { input, output, screen: () => screen };
}

test("a pasted key is read without being echoed", async () => {
  const terminal = fakeTerminal();
  const answer = promptForKey("Paste your key: ", terminal);
  assert.equal(terminal.input.isRaw, true, "the terminal must not echo while the key is read");
  terminal.input.write(`${KEY}\r`);

  assert.equal(await answer, KEY);
  assert.equal(terminal.screen(), "Paste your key: \n");
  assert.deepEqual(terminal.input.rawModes, [true, false], "the terminal is left as it was found");
});

test("a key typed by hand can still be corrected", async () => {
  const terminal = fakeTerminal();
  const answer = promptForKey("Key: ", terminal);
  // A typo fixed with Backspace, then a false start cleared with Ctrl+U.
  terminal.input.write("apb_x\x7fy");
  terminal.input.write("\x15");
  terminal.input.write(`${KEY}\r`);

  assert.equal(await answer, KEY);
  assert.equal(terminal.screen(), "Key: \n");
});

test("Ctrl+C cancels instead of carrying on with half a key", async () => {
  const terminal = fakeTerminal();
  const answer = promptForKey("Key: ", terminal);
  terminal.input.write("apb_half\x03");

  await assert.rejects(answer, /Cancelled/);
  assert.equal(terminal.screen(), "Key: \n");
  assert.equal(terminal.input.isRaw, false);
});

test("Ctrl+D on an empty line cancels too", async () => {
  const terminal = fakeTerminal();
  const answer = promptForKey("Key: ", terminal);
  terminal.input.write("\x04");

  await assert.rejects(answer, /Cancelled/);
  assert.equal(terminal.input.isRaw, false);
});

test("piped input is read to the end with no prompt, as before", async () => {
  const input = new PassThrough();
  const terminal = fakeTerminal();
  const answer = promptForKey("Key: ", { input, output: terminal.output });
  input.end(`${KEY}\n`);

  assert.equal(await answer, KEY);
  assert.equal(terminal.screen(), "");
});

test("a value that is not secret, such as a client ID, is still shown", async () => {
  const terminal = fakeTerminal();
  const answer = promptForLine("Client ID: ", terminal);
  terminal.input.write("my-oauth-client\r");

  assert.equal(await answer, "my-oauth-client");
  // readline draws the prompt with cursor movements, so only the order of the
  // two is fixed.
  assert.match(terminal.screen(), /Client ID: .*my-oauth-client/s);
});
