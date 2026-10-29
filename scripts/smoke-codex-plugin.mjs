/** Read a marketplace plugin with the real Codex parser, without login or installation. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = path.resolve(option("marketplace") ?? path.join(import.meta.dirname, ".."));
const executable = option("codex") ?? process.env.CODEX_CLI_PATH ?? (process.platform === "win32" ? "codex.exe" : "codex");
const home = await mkdtemp(path.join(os.tmpdir(), "apb-codex-parser-"));
const child = spawn(executable, ["app-server", "--stdio", "--enable", "plugins", "--disable", "apps"], {
  env: { ...process.env, CODEX_HOME: home }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
});
let buffer = "", parseFailure = false;
const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
try {
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Codex plugin/read timed out")), 25000);
    const finish = (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value); };
    child.on("error", error => finish(error));
    child.on("exit", code => finish(new Error(`Codex exited before plugin/read completed (${code})`)));
    child.stderr.on("data", data => { if (/failed to parse plugin MCP server/.test(data.toString())) parseFailure = true; });
    child.stdout.on("data", data => {
      buffer += data;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let response; try { response = JSON.parse(line); } catch { continue; }
        if (response.error) return finish(new Error(`Codex RPC error ${response.error.code}: ${response.error.message}`));
        if (response.id === 1) {
          send({ method: "initialized" });
          send({ id: 2, method: "plugin/read", params: { marketplacePath: path.join(root, ".agents", "plugins", "marketplace.json"), pluginName: "agentplaybooks" } });
        }
        if (response.id === 2) finish(null, response.result);
      }
    });
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "apb-plugin-smoke", version: "1" }, capabilities: { experimentalApi: true } } });
  });
  const servers = result.plugin?.mcpServers ?? [];
  const ok = !parseFailure && servers.includes("agentplaybooks-account");
  console.log(JSON.stringify({ ok, marketplace: root, mcpServers: servers, parseFailure }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  const closed = once(child, "close").catch(() => {});
  child.kill();
  await closed;
  // Only remove the fresh isolated home created above, never a user Codex home.
  const relative = path.relative(os.tmpdir(), home);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) await rm(home, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
