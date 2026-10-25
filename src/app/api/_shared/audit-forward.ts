/**
 * Optional, off-by-default forwarding of audit events to syslog and/or a SIEM
 * HTTPS webhook. Failures retry with backoff and never reject the caller: an
 * unreachable SIEM must not take the vault or federation path down with it.
 */

import { createHmac } from "node:crypto";
import type { AuditChainEntry } from "@/lib/audit-chain";
import { auditLogToExportRow } from "@/lib/audit-chain";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [200, 800, 3200];

/** HMAC-SHA256 key size. A human password is not enough; generate with `openssl rand -base64 32`. */
export const SIEM_HMAC_KEY_MIN_BYTES = 32;

export type AuditForwardConfig = {
  syslogUrl?: string;
  syslogHostname?: string;
  webhookUrl?: string;
  webhookHmacKey?: string;
  hmacHeader?: string;
};

function hmacKeyBytes(hmacKey: string): Buffer {
  const key = Buffer.from(hmacKey, "utf8");
  if (key.byteLength < SIEM_HMAC_KEY_MIN_BYTES) {
    throw new Error(
      `AUDIT_SIEM_WEBHOOK_SECRET must be a high-entropy random secret of at least ${SIEM_HMAC_KEY_MIN_BYTES} bytes, not a human password`,
    );
  }
  return key;
}

export function readAuditForwardConfig(env: Record<string, string | undefined> = process.env): AuditForwardConfig {
  const webhookUrl = env.AUDIT_SIEM_WEBHOOK_URL?.trim() || undefined;
  const webhookHmacKey = env.AUDIT_SIEM_WEBHOOK_SECRET || undefined;
  if (webhookHmacKey !== undefined) hmacKeyBytes(webhookHmacKey);
  if (webhookUrl && webhookHmacKey === undefined) {
    throw new Error(
      `AUDIT_SIEM_WEBHOOK_URL requires AUDIT_SIEM_WEBHOOK_SECRET (>=${SIEM_HMAC_KEY_MIN_BYTES} random bytes)`,
    );
  }
  return {
    syslogUrl: env.AUDIT_SYSLOG_URL?.trim() || undefined,
    syslogHostname: env.AUDIT_SYSLOG_HOSTNAME?.trim() || undefined,
    webhookUrl,
    webhookHmacKey,
    hmacHeader: env.AUDIT_SIEM_HMAC_HEADER?.trim() || "X-Audit-Signature",
  };
}

export function scheduleBackground(work: () => Promise<void>): void {
  const task = work().catch((error) => {
    console.error("Audit forward failed", error);
  });
  const waitUntil = (globalThis as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
  waitUntil?.(task);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function rfc5424Syslog(
  payload: string,
  hostname = "agentplaybooks",
  timestamp = new Date(),
): string {
  // local0 (16) + notice (5)
  const pri = 16 * 8 + 5;
  const ts = timestamp.toISOString();
  return `<${pri}>1 ${ts} ${hostname} agentplaybooks - audit_log - ${payload}`;
}

/** HMAC-SHA256 of the SIEM webhook body using a random >=32-byte key. */
export function siemSignature(body: string, hmacKey: string): string {
  const key = hmacKeyBytes(hmacKey);
  const digest = createHmac("sha256", key).update(body, "utf8").digest("hex");
  return `sha256=${digest}`;
}

async function sendWebhook(
  url: string,
  body: string,
  config: AuditForwardConfig,
  fetchImpl: typeof fetch,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (!config.webhookHmacKey) {
    throw new Error(
      `AUDIT_SIEM_WEBHOOK_URL requires AUDIT_SIEM_WEBHOOK_SECRET (>=${SIEM_HMAC_KEY_MIN_BYTES} random bytes)`,
    );
  }
  headers[config.hmacHeader || "X-Audit-Signature"] = siemSignature(body, config.webhookHmacKey);
  const response = await fetchImpl(url, { method: "POST", headers, body });
  if (!response.ok) {
    throw new Error(`SIEM webhook HTTP ${response.status}`);
  }
}

function parseSyslogTarget(url: string): { protocol: "udp" | "tcp" | "tls"; host: string; port: number } | null {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(":", "").toLowerCase();
    const host = parsed.hostname;
    if (!host) return null;
    if (protocol === "udp" || protocol === "syslog") {
      return { protocol: "udp", host, port: parsed.port ? Number(parsed.port) : 514 };
    }
    if (protocol === "tcp") {
      return { protocol: "tcp", host, port: parsed.port ? Number(parsed.port) : 514 };
    }
    if (protocol === "tls" || protocol === "ssl") {
      return { protocol: "tls", host, port: parsed.port ? Number(parsed.port) : 6514 };
    }
  } catch {
    return null;
  }
  return null;
}

export async function sendSyslogMessage(url: string, message: string): Promise<void> {
  const target = parseSyslogTarget(url);
  if (!target) throw new Error("AUDIT_SYSLOG_URL must be udp://, tcp://, or tls://host:port");
  const payload = Buffer.from(`${message}\n`, "utf8");

  if (target.protocol === "udp") {
    const dgram = await import("node:dgram");
    await new Promise<void>((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      socket.send(payload, target.port, target.host, (error) => {
        socket.close();
        if (error) reject(error);
        else resolve();
      });
    });
    return;
  }

  const connect = async (useTls: boolean) => {
    const net = useTls ? await import("node:tls") : await import("node:net");
    await new Promise<void>((resolve, reject) => {
      const socket = useTls
        ? (net as typeof import("node:tls")).connect({ host: target.host, port: target.port }, () => {
          socket.write(payload, (error) => {
            socket.end();
            if (error) reject(error);
            else resolve();
          });
        })
        : (net as typeof import("node:net")).connect(target.port, target.host, () => {
          socket.write(payload, (error) => {
            socket.end();
            if (error) reject(error);
            else resolve();
          });
        });
      socket.on("error", reject);
    });
  };

  await connect(target.protocol === "tls");
}

export async function forwardAuditLog(
  entry: AuditChainEntry | Record<string, unknown>,
  config: AuditForwardConfig = readAuditForwardConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!config.syslogUrl && !config.webhookUrl) return;
  const body = JSON.stringify(auditLogToExportRow(entry as AuditChainEntry));
  const syslog = config.syslogUrl
    ? rfc5424Syslog(body, config.syslogHostname)
    : null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      if (syslog && config.syslogUrl) await sendSyslogMessage(config.syslogUrl, syslog);
      if (config.webhookUrl) await sendWebhook(config.webhookUrl, body, config, fetchImpl);
      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS - 1) throw error;
      await sleep(BACKOFF_MS[attempt] ?? 3200);
    }
  }
}

export function scheduleAuditForward(entry: AuditChainEntry | Record<string, unknown>): void {
  let config: AuditForwardConfig;
  try {
    config = readAuditForwardConfig();
  } catch (error) {
    console.error("Audit SIEM forwarding not started", error);
    return;
  }
  if (!config.syslogUrl && !config.webhookUrl) return;
  scheduleBackground(() => forwardAuditLog(entry, config));
}

// Fail closed as soon as this isolate loads if the HMAC key is present but too
// short, or the webhook URL is set without a key. Unset stays off.
if (process.env.AUDIT_SIEM_WEBHOOK_SECRET || process.env.AUDIT_SIEM_WEBHOOK_URL) {
  readAuditForwardConfig();
}
