import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function probe(source: string) {
  // Bound a regression's CPU/memory cost without tying up the test worker.
  return JSON.parse(execFileSync(process.execPath, [
    "--max-old-space-size=128", "--input-type=module", "--eval", source,
  ], { cwd: process.cwd(), encoding: "utf8", timeout: 4000 }));
}

describe("glob dependency safety", () => {
  it("bounds pattern amplification during minimatch optimization", () => {
    const result = probe(`
      import { Minimatch } from 'minimatch';
      const pattern = Array(12).fill('**/../a/b').join('/');
      const matcher = new Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 64 });
      console.log(JSON.stringify({ patterns: matcher.set.length }));
    `);
    expect(result.patterns).toBeGreaterThan(0);
    expect(result.patterns).toBeLessThanOrEqual(64);
  });

  it("stops filesystem traversal when the first directory read aborts", () => {
    const result = probe(`
      import { glob } from 'glob';
      import fs from 'node:fs';
      import os from 'node:os';
      import path from 'node:path';
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apb-glob-cancel-'));
      try {
        for (let n = 0; n < 5; n++) fs.mkdirSync(path.join(root, 'a' + n, 'nested', 'deeper'), { recursive: true });
        const abort = new AbortController();
        let reads = 0;
        const observedFs = {
          readdir(directory, options, callback) {
            reads++;
            fs.readdir(directory, options, (error, entries) => {
              abort.abort(new Error('fixture abort'));
              callback(error, entries);
            });
          },
        };
        let rejected = false;
        try { await glob('**/*', { cwd: root, signal: abort.signal, fs: observedFs }); }
        catch { rejected = true; }
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log(JSON.stringify({ rejected, reads }));
      } finally {
        if (!path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'apb-glob-cancel-'))) throw new Error('Unexpected fixture path');
        fs.rmSync(root, { recursive: true, force: true });
      }
    `);
    expect(result.rejected).toBe(true);
    expect(result.reads).toBe(1);
  });
});
