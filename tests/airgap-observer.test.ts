import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const shell = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("apb-egress-test-")) throw new Error("Unsafe test cleanup");
    rmSync(root, { recursive: true, force: true });
  }
});
it("fails without observation logs, and distinguishes service names from lookalike external domains", () => {
  const root = mkdtempSync(join(tmpdir(), "apb-egress-test-")); roots.push(root);
  const dns = join(root, "dns.log"); const pcap = join(root, "packets.log");
  const check = () => spawnSync(shell, ["deploy/airgap/check-egress.sh", dns, pcap], { encoding: "utf8" });
  expect(check().status).not.toBe(0);
  writeFileSync(pcap, "\n"); // tcpdump emits a blank line when stopped with SIGINT
  writeFileSync(dns, "dnsmasq: query[A] app.airgap from 172.30.0.14\n");
  expect(check().status).toBe(0);
  writeFileSync(dns, "dnsmasq: query[A] app.airgap.attacker.example from 172.30.0.14\n");
  expect(check().status).not.toBe(0);
  writeFileSync(dns, ""); writeFileSync(pcap, "172.30.0.14 > 1.1.1.1\n");
  expect(check().status).not.toBe(0);
});
