"use client";

import { useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-fetch";

export function AuditDownload({ playbookId }: { playbookId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await authFetch(`/api/playbooks/${encodeURIComponent(playbookId)}/audit/bundle`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Could not download the audit bundle. Please try again.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "agentplaybooks-audit.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border border-neutral-200 p-5 dark:border-slate-700">
      <h3 className="font-semibold">Audit evidence</h3>
      <p className="text-sm text-neutral-600 dark:text-slate-400">
        Download retained audit events, integrity checks and a description of the data the application stores.
        The ZIP can contain personal or confidential audit metadata. Share it only with authorised reviewers.
        It supports review; it is not a compliance certificate or a complete personal-data export.
      </p>
      <button type="button" disabled={busy} onClick={() => void download()}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {busy ? "Preparing audit ZIP…" : "Download audit ZIP"}
      </button>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <p className="text-sm"><Link href="/docs/audit-logs" className="underline">Contents and limits</Link> · <Link href="/privacy" className="underline">Privacy notice</Link></p>
    </section>
  );
}
