import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter } from "node:path";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const python = process.platform === "win32" ? "python" : "python3";
const helper = resolve("scripts/self-host/archive.py");
const temporary: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "apb-archive-test-"));
  temporary.push(root);
  mkdirSync(join(root, "db"));
  mkdirSync(join(root, "storage"));
  writeFileSync(join(root, "db/postgres.dump"), "fixture dump");
  execFileSync(python, ["-c", "import tarfile,sys; tarfile.open(sys.argv[1], 'w').close()", join(root, "storage/files.tar")]);
  const hash = (name: string) => createHash("sha256").update(readFileSync(join(root, name))).digest("hex");
  writeFileSync(join(root, "manifest.json"), JSON.stringify({
    version: 1, encryption_master_key_included: false, components: ["postgres", "storage"],
    postgres_dump_sha256: hash("db/postgres.dump"), storage_tar_sha256: hash("storage/files.tar"),
  }));
  return root;
}
afterEach(() => {
  for (const path of temporary.splice(0)) {
    if (dirname(resolve(path)) !== resolve(tmpdir()) || !path.includes("apb-archive-test-")) throw new Error("Unsafe test cleanup");
    rmSync(path, { recursive: true, force: true });
  }
});
describe("backup preflight", () => {
  it("refuses a corrupt archive before invoking the target stack", () => {
    const root = fixture();
    writeFileSync(join(root, "db/postgres.dump"), "corruption");
    const archive = join(root, "bad.tar.gz");
    execFileSync(python, ["-c", "import tarfile,sys; t=tarfile.open(sys.argv[1],'w:gz'); [t.add(sys.argv[2]+'/'+n,arcname=n) for n in ['db','storage','manifest.json']]; t.close()", archive, root]);
    const bin = join(root, "bin"); mkdirSync(bin);
    writeFileSync(join(bin, "docker"), '#!/bin/sh\necho called >> "$DOCKER_CALLS"\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(bin, "python3"), '#!/bin/sh\nexec python "$@"\n', { mode: 0o755 });
    const shell = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
    const calls = join(root, "docker-calls");
    const result = spawnSync(shell, ["scripts/self-host/restore.sh", "--archive", archive], {
      encoding: "utf8", env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, DOCKER_CALLS: calls },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Checksum mismatch");
    expect(existsSync(calls)).toBe(false);
  });
  it("accepts intact components and rejects corrupt or missing data", () => {
    const root = fixture();
    expect(spawnSync(python, [helper, "validate", root]).status).toBe(0);
    writeFileSync(join(root, "db/postgres.dump"), "corruption");
    const result = spawnSync(python, [helper, "validate", root], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Checksum mismatch: db/postgres.dump");
    rmSync(join(root, "storage/files.tar"));
    expect(spawnSync(python, [helper, "validate", root]).status).not.toBe(0);
  });
  it("keeps no environment values, including unknown keys, exports and multiline secrets", () => {
    const root = fixture();
    const source = join(root, "env"); const dest = join(root, "redacted");
    writeFileSync(source, '# secret-comment\n export SECRETS_ENCRYPTION_KEY = "private\ncontinuation"\n NEW_VENDOR_TOKEN=unknown-secret\nURL=https://user:password@db\n');
    execFileSync(python, [helper, "inventory", source, dest]);
    expect(readFileSync(dest, "utf8")).toBe("NEW_VENDOR_TOKEN=<redacted>\nSECRETS_ENCRYPTION_KEY=<redacted>\nURL=<redacted>\n");
  });
  it.each(["../escape", "/absolute", "symlink"])("rejects unsafe outer archive member %s", name => {
    const root = fixture(); const archive = join(root, "unsafe.tar.gz");
    execFileSync(python, ["-c", "import tarfile,sys; t=tarfile.open(sys.argv[1],'w:gz'); m=tarfile.TarInfo(sys.argv[2]); m.type=tarfile.SYMTYPE if sys.argv[2]=='symlink' else tarfile.REGTYPE; m.linkname='/tmp'; t.addfile(m); t.close()", archive, name]);
    const result = spawnSync(python, [helper, "extract", archive, join(root, "extracted")], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unsafe archive member");
  });
});
