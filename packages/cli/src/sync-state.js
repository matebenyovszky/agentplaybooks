import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function fileHash(bytes) {
  return bytes === null ? null : createHash("sha256").update(bytes).digest("hex");
}

export async function hashFile(filename) {
  try { return fileHash(await readFile(filename)); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function loadSyncState(statePath) {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    if (state.version !== 1 || !state.files || Array.isArray(state.files) || typeof state.files !== "object") throw new Error("invalid state");
    return state;
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, files: {} };
    throw new Error("Cannot read sync state; restore .agentplaybooks/sync-state.json before updating managed files.");
  }
}

export async function saveSyncState(statePath, state) {
  await mkdir(path.dirname(statePath), { recursive: true, mode: 0o700 });
  const temp = `${statePath}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, statePath);
}

export async function assertSafeSyncPath(root, relative) {
  const parts = relative.split(/[\\/]/);
  if (path.isAbsolute(relative) || parts.some(part => !part || part === "." || part === "..")) throw new Error("Sync path escapes its root.");
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Sync path passes through a symlink: ${relative}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
