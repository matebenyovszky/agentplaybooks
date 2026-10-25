import { listPlaybooks, request, resolveApiKey } from "./remote.js";

const EXPORT_FORMATS = new Set(["json", "jsonl", "ndjson", "csv"]);

export function auditQueryFromFlags(flags) {
  const query = {};
  const format = flags.get("--format");
  if (typeof format === "string") query.format = format === "ndjson" ? "jsonl" : format;
  const since = flags.get("--since");
  if (typeof since === "string") query.since = since;
  const until = flags.get("--until");
  if (typeof until === "string") query.until = until;
  const actor = flags.get("--actor");
  if (typeof actor === "string") query.actor = actor;
  const action = flags.get("--action") ?? flags.get("--operation");
  if (typeof action === "string") query.action = action;
  const secret = flags.get("--secret");
  if (typeof secret === "string") query.secret = secret;
  const limit = flags.get("--limit");
  if (typeof limit === "string") query.limit = limit;
  return query;
}

function queryString(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export async function fetchAuditExport(url, apiKey, guid, query, { fetchImpl = fetch } = {}) {
  const path = `/api/playbooks/${guid}/audit/export${queryString(query)}`;
  const response = await fetchImpl(`${url}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      message = JSON.parse(text).error || message;
    } catch {
      // keep status
    }
    const error = new Error(`GET ${path} failed: ${message}`);
    error.status = response.status;
    throw error;
  }
  return text;
}

export async function fetchAuditVerify(url, apiKey, guid, { fetchImpl = fetch } = {}) {
  const path = `/api/playbooks/${guid}/audit/verify`;
  const response = await fetchImpl(`${url}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON error bodies fall through to the status check below.
  }
  // 409 is a successful verify that found a broken link, not a transport failure.
  if (!response.ok && response.status !== 409) {
    const message = payload?.error || `HTTP ${response.status}`;
    const error = new Error(`GET ${path} failed: ${message}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function fetchAuditPurge(url, apiKey, guid, days, { fetchImpl } = {}) {
  return await request(url, `/api/playbooks/${guid}/audit/purge`, {
    method: "POST",
    apiKey,
    body: days ? { days } : {},
    fetchImpl,
  });
}

export function resolveAuditGuids(positional, flags) {
  const fromFlag = typeof flags.get("--playbook") === "string" ? flags.get("--playbook") : null;
  const fromPositional = positional[1] || null;
  return fromFlag || fromPositional || null;
}

export async function collectExportGuids(url, apiKey, requested, { fetchImpl } = {}) {
  if (requested) return [requested];
  const playbooks = await listPlaybooks(url, apiKey, { fetchImpl });
  return playbooks
    .filter((playbook) => playbook.current_user_role === "owner" || playbook.current_user_role === "auditor")
    .map((playbook) => playbook.guid)
    .filter(Boolean);
}

export function validateExportFormat(format) {
  if (!format) return "jsonl";
  if (!EXPORT_FORMATS.has(format)) throw new Error("format must be jsonl or csv (json is also accepted).");
  return format === "ndjson" ? "jsonl" : format;
}

export async function requireUserKey(url) {
  const apiKey = await resolveApiKey(url);
  if (!apiKey) {
    throw new Error(`No API key for ${url}. Run 'agentplaybooks login' or set AGENTPLAYBOOKS_API_KEY.`);
  }
  return apiKey;
}
