"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileText, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { slugifyCanvasName } from "@/lib/canvas";
import type { Canvas, PlaybookRun } from "@/lib/supabase/types";
import type { StorageAdapter } from "@/lib/storage";

interface CanvasEditorProps {
  storage: StorageAdapter;
  canvases: Canvas[];
  onUpdate: (canvases: Canvas[]) => void;
  runs: PlaybookRun[];
  onRunsUpdate: (runs: PlaybookRun[]) => void;
  playbookGuid: string;
  readOnly?: boolean;
}

export function CanvasEditor({ storage, canvases, onUpdate, runs, onRunsUpdate, playbookGuid, readOnly = false }: CanvasEditorProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(runs[0]?.id || null);
  const runCanvases = useMemo(() => canvases.filter((canvas) => canvas.run_id === selectedRunId), [canvases, selectedRunId]);
  const [selectedId, setSelectedId] = useState<string | null>(runCanvases[0]?.id || null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => runCanvases.find((canvas) => canvas.id === selectedId) || null,
    [runCanvases, selectedId]
  );

  useEffect(() => {
    if (!selected) {
      setName("");
      setSlug("");
      setContent("");
      return;
    }
    setName(selected.name);
    setSlug(selected.slug);
    setContent(selected.content);
    setError(null);
  }, [selected]);

  useEffect(() => {
    if (!runCanvases.some((canvas) => canvas.id === selectedId)) setSelectedId(runCanvases[0]?.id || null);
  }, [runCanvases, selectedId]);

  const handleCreateRun = async () => {
    if (readOnly) return;
    const runName = window.prompt("Name this workflow run (for example, Acme PR #142)", `Run ${runs.length + 1}`)?.trim();
    if (!runName) return;
    setSaving(true);
    setError(null);
    const created = await storage.addRun({ name: runName, status: "active", context: {} });
    if (created) {
      onRunsUpdate([created, ...runs]);
      setSelectedRunId(created.id);
      setSelectedId(null);
    } else {
      setError("Could not create the workflow run.");
    }
    setSaving(false);
  };

  const handleCreate = async () => {
    if (readOnly) return;
    if (!selectedRunId) {
      setError("Create or select a workflow run first.");
      return;
    }
    setSaving(true);
    setError(null);
    const index = runCanvases.length + 1;
    const documentName = `Work document ${index}`;
    let documentSlug = slugifyCanvasName(documentName);
    while (runCanvases.some((canvas) => canvas.slug === documentSlug)) {
      documentSlug = `${slugifyCanvasName(documentName)}-${crypto.randomUUID().slice(0, 6)}`;
    }
    const created = await storage.addCanvas({
      name: documentName,
      slug: documentSlug,
      run_id: selectedRunId,
      content: `# ${documentName}\n\n`,
      sections: [],
      metadata: {},
      sort_order: runCanvases.length,
    });
    if (created) {
      onUpdate([...canvases, created]);
      setSelectedId(created.id);
    } else {
      setError("Could not create the canvas document.");
    }
    setSaving(false);
  };

  const handleSave = async () => {
    if (!selected || readOnly) return;
    const normalizedSlug = slugifyCanvasName(slug || name);
    if (!name.trim() || !normalizedSlug) {
      setError("Name and a valid slug are required.");
      return;
    }
    if (runCanvases.some((canvas) => canvas.id !== selected.id && canvas.slug === normalizedSlug)) {
      setError("Another canvas document already uses this slug.");
      return;
    }

    setSaving(true);
    setError(null);
    const updated = await storage.updateCanvas(selected.id, {
      name: name.trim(),
      slug: normalizedSlug,
      content,
    }, selected.version);
    if (updated) {
      onUpdate(canvases.map((canvas) => canvas.id === updated.id ? updated : canvas));
    } else {
      setError("Could not save the canvas document. Refresh and try again.");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selected || readOnly || !confirm(`Delete canvas document “${selected.name}”?`)) return;
    if (await storage.deleteCanvas(selected.id)) {
      const next = canvases.filter((canvas) => canvas.id !== selected.id);
      onUpdate(next);
      setSelectedId(next.find((canvas) => canvas.run_id === selectedRunId)?.id || null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const next = await storage.getCanvases();
    onUpdate(next);
    setRefreshing(false);
  };

  const apiPath = selected ? `/api/playbooks/${playbookGuid}/canvas/${selected.slug}?runId=${selected.run_id}` : "";
  const copyApiPath = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${apiPath}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Canvas documents</h2>
          <p className="text-sm text-neutral-500 dark:text-slate-400">
            Versioned markdown work products that agents can edit incrementally.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedRunId || ""} onChange={(event) => setSelectedRunId(event.target.value || null)} className="max-w-52 rounded-lg border border-neutral-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700" aria-label="Workflow run">
            <option value="">Select a run</option>
            {runs.map((run) => <option key={run.id} value={run.id}>{run.name} · {run.status}</option>)}
          </select>
          <button onClick={handleCreateRun} disabled={saving || readOnly} className="rounded-lg border border-green-500/30 px-3 py-2 text-sm text-green-600 disabled:opacity-50">New run</button>
          <button onClick={handleRefresh} disabled={refreshing} className="p-2 rounded-lg border border-neutral-200 dark:border-slate-700">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || readOnly}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> New document
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</div>}

      {!selectedRunId ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-slate-700 p-10 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-neutral-400" />
          <p className="font-medium text-neutral-700 dark:text-slate-300">Select or create a workflow run</p>
          <p className="mt-1 text-sm text-neutral-500">Each run keeps its company, task, and work products isolated.</p>
        </div>
      ) : runCanvases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-slate-700 p-10 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-neutral-400" />
          <p className="font-medium text-neutral-700 dark:text-slate-300">No canvas documents yet</p>
          <p className="mt-1 text-sm text-neutral-500">Create a shared work document for agents to build and revise.</p>
        </div>
      ) : (
        <div className="grid min-h-[620px] gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
            {runCanvases.map((canvas) => (
              <button
                key={canvas.id}
                onClick={() => setSelectedId(canvas.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-3 text-left transition-colors",
                  canvas.id === selectedId
                    ? "border-green-500/50 bg-green-500/10"
                    : "border-transparent hover:bg-neutral-100 dark:hover:bg-slate-800"
                )}
              >
                <span className="block truncate text-sm font-medium text-neutral-900 dark:text-white">{canvas.name}</span>
                <span className="mt-1 block truncate font-mono text-xs text-neutral-500">/{canvas.slug} · v{canvas.version}</span>
              </button>
            ))}
          </aside>

          {selected && (
            <section className="flex min-w-0 flex-col rounded-xl border border-neutral-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/50">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input value={name} onChange={(event) => setName(event.target.value)} disabled={readOnly} aria-label="Canvas name" className="rounded-lg border border-neutral-200 bg-transparent px-3 py-2 dark:border-slate-700" />
                <input value={slug} onChange={(event) => setSlug(slugifyCanvasName(event.target.value))} disabled={readOnly} aria-label="Canvas slug" className="rounded-lg border border-neutral-200 bg-transparent px-3 py-2 font-mono text-sm dark:border-slate-700" />
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving || readOnly} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                    <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={handleDelete} disabled={readOnly} className="rounded-lg border border-red-500/30 p-2 text-red-500 disabled:opacity-50" aria-label="Delete canvas">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-slate-800 dark:text-slate-400">
                <code className="min-w-0 flex-1 truncate">{apiPath}</code>
                <button onClick={copyApiPath} aria-label="Copy canvas API URL">{copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}</button>
              </div>

              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                disabled={readOnly}
                spellCheck={false}
                aria-label="Canvas markdown content"
                className="mt-3 min-h-[500px] flex-1 resize-y rounded-lg border border-neutral-200 bg-neutral-50 p-4 font-mono text-sm leading-6 outline-none focus:border-green-500 dark:border-slate-700 dark:bg-slate-950"
              />
              <div className="mt-2 flex justify-between text-xs text-neutral-500">
                <span>{content.length.toLocaleString()} characters</span>
                <span>Version {selected.version} · updated {new Date(selected.updated_at).toLocaleString()}</span>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default CanvasEditor;
