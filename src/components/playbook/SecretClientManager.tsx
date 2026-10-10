"use client";

import { useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-fetch";
import type { SecretClientsRow } from "@/lib/supabase/types";

export function SecretClientManager({ playbookId }: { playbookId: string }) {
  const [clients, setClients] = useState<SecretClientsRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [names, setNames] = useState("");
  const [expiry, setExpiry] = useState("");
  const endpoint = `/api/playbooks/${playbookId}/secret-clients`;

  async function refresh() {
    setError("");
    setBusy(true);
    try {
      const response = await authFetch(endpoint);
      if (!response.ok) throw new Error("Could not load certificate access. Check that you own this playbook and try again.");
      setClients(await response.json());
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load certificate access."); }
    finally { setBusy(false); }
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await authFetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, certificate_sha256: fingerprint,
          secret_names: [...new Set(names.split(/[\s,]+/).filter(Boolean))],
          expires_at: expiry ? new Date(expiry).toISOString() : null,
        }),
      });
      if (!response.ok) throw new Error("Could not register certificate. Check the fingerprint, secret names, expiry, and whether it is already registered.");
      setName(""); setFingerprint(""); setNames(""); setExpiry("");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not register certificate."); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setBusy(true); setError("");
    try {
      const response = await authFetch(`${endpoint}/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not revoke certificate access.");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not revoke certificate access."); }
    finally { setBusy(false); }
  }

  const inputClass = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100";
  return (
    <section className="mt-8 rounded-xl border border-slate-700 p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-medium text-slate-100">Certificate access for applications</h3>
        <button type="button" onClick={refresh} disabled={busy} className="text-sm text-amber-400 disabled:opacity-50">
          {busy ? "Loading…" : clients === null ? "Manage certificates" : "Refresh"}
        </button>
      </div>
      <p className="text-sm text-slate-400">
        Let a Python application load selected secrets at startup using its client certificate.
        Each secret must also allow runtime reveal. Revoking access stops future loads.
        {" "}<Link className="text-amber-400 underline" href="/docs/python-secrets">Setup and Docker examples</Link>
      </p>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {clients !== null && <>
        <ul className="space-y-3">
          {clients.map(client => <li key={client.id} className="rounded-lg bg-slate-900/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-200">{client.name}</span>
              {client.is_active
                ? <button type="button" disabled={busy} onClick={() => revoke(client.id)} className="text-sm text-red-400 disabled:opacity-50">Revoke</button>
                : <span className="text-sm text-slate-500">Revoked</span>}
            </div>
            <p className="mt-1 text-sm text-slate-400 break-words">{client.secret_names.join(", ")}</p>
            <p className="mt-1 text-xs text-slate-500">
              {client.expires_at ? `Expires: ${new Date(client.expires_at).toLocaleString()}` : "No access expiry"}
              {client.last_used_at ? ` · Last used: ${new Date(client.last_used_at).toLocaleString()}` : " · Not used yet"}
            </p>
          </li>)}
        </ul>
        {clients.length === 0 && <p className="text-sm text-slate-400">No certificates registered.</p>}
        <form onSubmit={register} className="space-y-3">
          <label className="block text-sm text-slate-300">Application name
            <input required maxLength={100} className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Production import service" />
          </label>
          <label className="block text-sm text-slate-300">Certificate SHA-256 fingerprint
            <input required className={inputClass} value={fingerprint} onChange={e => setFingerprint(e.target.value)} placeholder="64 hexadecimal characters, with or without colons" />
          </label>
          <label className="block text-sm text-slate-300">Allowed secret names
            <input required className={inputClass} value={names} onChange={e => setNames(e.target.value)} placeholder="DATABASE_URL, SERVICE_API_KEY" />
          </label>
          <label className="block text-sm text-slate-300">Access expires (optional)
            <input type="datetime-local" className={inputClass} value={expiry} onChange={e => setExpiry(e.target.value)} />
          </label>
          <button disabled={busy} className="rounded-lg bg-amber-600 px-4 py-2 text-white disabled:opacity-50">Register certificate</button>
        </form>
      </>}
    </section>
  );
}
