import JSZip from "jszip";
import { createHash } from "node:crypto";
import { DATA_INVENTORY } from "./data-inventory";
import { formatAuditJsonl, formatAuditCsv, type AuditChainEntry, type AuditChainReport } from "./audit-chain";

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

export async function buildAuditBundle(input: {
  playbookId: string;
  logs: AuditChainEntry[];
  report: AuditChainReport;
  checkpoint: unknown;
  retentionDays: number | null;
  collectionStartedAt: string;
}) {
  const files: Record<string, string> = {
    "audit.jsonl": formatAuditJsonl(input.logs),
    "audit.csv": formatAuditCsv(input.logs),
    "verification.json": json({ ...input.report, checkpoint: input.checkpoint }),
    "data-inventory.json": json(DATA_INVENTORY),
    "README.txt": [
      "AgentPlaybooks audit evidence bundle",
      "Contains the retained audit rows returned during collection, ordered by hash links, and a verification of those exact rows.",
      "This is not a transactionally consistent database snapshot. Concurrent writes may require a retry; no claim is made that every real-world event was logged.",
      "A retention checkpoint anchors the retained chain; purged events are not recoverable from this bundle. An empty trail is not evidence of no activity.",
      "SHA-256 checksums detect changes relative to this manifest, but the manifest is not signed or externally timestamped. A party able to rewrite the entire chain and manifest is outside this guarantee.",
      "audit.jsonl is the machine-verifiable record; audit.csv is for human review and escapes spreadsheet formulas.",
      "Doctor was not run: it is a local-only configuration check. Run apb doctor --json in the relevant project and retain the configuration revision with that separate report.",
      "data-inventory.json describes application data categories, not the actual contents of an account. This is not a complete GDPR access/portability export.",
      "The bundle excludes vault values, account credentials, playbook content, provider logs, backups and external SIEM records. Audit metadata can still contain personal/confidential data; share and retain it accordingly.",
      "Supports evidence collection only. No ISO 27001/42001 certification or GDPR, AI Act, CRA or other legal conformity is asserted. Operators must assess applicability and provide organisational evidence separately.",
    ].join("\n\n") + "\n",
  };
  const manifest = {
    schema_version: 1,
    product: "AgentPlaybooks",
    playbook_id: input.playbookId,
    collection_started_at: input.collectionStartedAt,
    generated_at: new Date().toISOString(),
    scope: "Retained audit rows returned during collection; no filters; not an atomic database snapshot.",
    row_count: input.logs.length,
    first_event_at: input.logs[0]?.created_at ?? null,
    last_event_at: input.logs.at(-1)?.created_at ?? null,
    audit_retention_days: input.retentionDays,
    doctor: { included: false, reason: "Local configuration was not inspected." },
    files: Object.entries(files).map(([name, content]) => ({
      name, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex"),
    })),
  };
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  zip.file("manifest.json", json(manifest));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
