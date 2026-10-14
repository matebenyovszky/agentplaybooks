import readline from "node:readline";
import { Writable } from "node:stream";

/**
 * Asking the person at the terminal for a line of input.
 *
 * A key pasted at a prompt that echoes it stays on screen, in the scrollback,
 * and in every screen share or recording of that terminal, so `promptForKey`
 * reads it the way `read -s` does: nothing is shown while it is typed or
 * pasted. Input that is not a terminal — a pipe from a password manager, a CI
 * job — is read to the end, exactly as before, with no prompt written.
 *
 * The streams are parameters so the tests can stand in for a terminal.
 */

async function readToEnd(input) {
  const chunks = [];
  for await (const chunk of input) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

function readLine(rl, question) {
  return new Promise((resolve, reject) => {
    let answered = false;
    // Ctrl+C, and Ctrl+D on an empty line, close the interface without a
    // line. Saying so beats waiting forever or carrying on with nothing.
    rl.on("close", () => {
      if (!answered) reject(new Error("Cancelled; nothing was entered."));
    });
    rl.question(question, (answer) => {
      answered = true;
      resolve(answer.trim());
    });
  }).finally(() => rl.close());
}

/** Read a credential without echoing it. */
export async function promptForKey(question, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY) return readToEnd(input);
  output.write(question);
  // `terminal: true` is what stops the terminal itself from echoing: readline
  // puts the input in raw mode — Windows consoles included — and does the line
  // editing on its own, so backspace, Ctrl+U and a paste still work. What it
  // would echo goes to a stream that drops it, and with no history the key is
  // not kept once the line is read.
  const discard = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const rl = readline.createInterface({ input, output: discard, terminal: true, historySize: 0 });
  try {
    return await readLine(rl, "");
  } finally {
    // The Enter that ended the line was not echoed either.
    output.write("\n");
  }
}

/** Read a value that is not secret, such as an OAuth client ID, showing it as it is typed. */
export async function promptForLine(question, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY) return readToEnd(input);
  return readLine(readline.createInterface({ input, output }), question);
}
