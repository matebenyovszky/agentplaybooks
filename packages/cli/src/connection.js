/** On-demand, credential-redacted MCP connection diagnostics. Never polls. */
import { createHash } from "node:crypto";

export function connectionEndpoint(base) {
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash ||
      !["https:", "http:"].includes(url.protocol) ||
      (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("Connection checks require HTTPS (or localhost HTTP), without credentials or query parameters in the URL.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/api/mcp/manage")) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/mcp/manage`;
  }
  return url.toString();
}

async function messageFrom(response, id) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty-response");
  const decoder = new TextDecoder();
  const sse = response.headers.get("content-type")?.includes("text/event-stream");
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      text += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      if (text.length > 1_048_576) throw new Error("response-too-large");
      if (sse) {
        const events = text.split(/\r?\n\r?\n/);
        text = events.pop();
        for (const event of events) {
          const data = event.split(/\r?\n/).filter(line => line.startsWith("data:"))
            .map(line => line.slice(5).trim()).join("\n");
          if (!data) continue;
          const message = JSON.parse(data);
          if (message.id === id) return message;
        }
      }
      if (done) break;
    }
    return JSON.parse(text);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function checkConnection(base, { apiKey, fetchImpl = fetch, timeoutMs = 5000, profile = true } = {}) {
  const endpoint = connectionEndpoint(base);
  const resource = new URL(endpoint);
  const metadataUrl = `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`;
  const report = { endpoint, ok: false, stages: [], nextSteps: [] };
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (apiKey) headers["X-API-Key"] = apiKey;
  let nextId = 0;
  const fetchAt = (url, options) => fetchImpl(url, { ...options, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });

  try {
    // Public discovery receives no user credential and never follows redirects.
    const response = await fetchAt(metadataUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`http-${response.status}`);
    }
    const metadata = await messageFrom(response, null);
    if (metadata.resource !== endpoint || !Array.isArray(metadata.authorization_servers) || !metadata.authorization_servers.length) {
      throw new Error("invalid-resource-metadata");
    }
    if (!metadata.authorization_servers.every(value => {
      try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
    })) throw new Error("invalid-authorization-server");
    report.stages.push({ stage: "oauth-discovery", status: "ok" });
    try {
      const issuer = new URL(metadata.authorization_servers[0]);
      const discovery = `${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname.replace(/\/+$/, "")}`;
      const authorization = await fetchAt(discovery, { headers: { Accept: "application/json" } });
      if (!authorization.ok) { await authorization.body?.cancel(); throw new Error("authorization-metadata-http-error"); }
      const document = await messageFrom(authorization, null);
      if (typeof document.issuer !== "string" || document.issuer.replace(/\/+$/, "") !== issuer.toString().replace(/\/+$/, "")
          || ![document.authorization_endpoint, document.token_endpoint].every(value => {
            try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
          }) || !document.code_challenge_methods_supported?.includes("S256")) throw new Error("invalid-authorization-metadata");
      report.stages.push({ stage: "oauth-authorization-server", status: "ok" });
      report.oauthRegistration = document.registration_endpoint ? "dcr"
        : document.client_id_metadata_document_supported === true ? "cimd" : "provided-client-required";
    } catch {
      report.stages.push({ stage: "oauth-authorization-server", status: "failed" });
      report.nextSteps.push("Check authorization-server discovery, issuer, HTTPS authorization/token endpoints, and S256 PKCE support.");
    }
  } catch {
    report.stages.push({ stage: "oauth-discovery", status: "failed" });
    report.nextSteps.push("Check protected-resource metadata and the canonical OAuth resource URL.");
  }

  async function call(stage, method, params, notification = false) {
    const id = ++nextId;
    let response;
    try {
      response = await fetchAt(endpoint, { method: "POST", headers,
        body: JSON.stringify({ jsonrpc: "2.0", ...(!notification ? { id } : {}), method, ...(params ? { params } : {}) }) });
      if (!response.ok) {
        await response.body?.cancel();
        report.stages.push({ stage, status: "failed", httpStatus: response.status });
        if ([401, 403].includes(response.status)) {
          report.nextSteps.push("Reconnect the selected account in the host plugin settings. For CLI use, run apb login; an environment key takes precedence over a stored key.");
        }
        return null;
      }
      if (response.headers.get("mcp-session-id")) headers["Mcp-Session-Id"] = response.headers.get("mcp-session-id");
      if (notification) {
        await response.body?.cancel();
        report.stages.push({ stage, status: "ok" });
        return {};
      }
      const message = await messageFrom(response, id);
      if (message.jsonrpc !== "2.0" || message.id !== id || message.error || !message.result) throw new Error("invalid-mcp-response");
      report.stages.push({ stage, status: "ok" });
      return message.result;
    } catch {
      report.stages.push({ stage, status: "failed", reason: response ? "response-or-protocol-error" : "transport-error" });
      report.nextSteps.push(response ? "Check the MCP response format and negotiated protocol revision." : "Check DNS, TLS, connectivity, and the execution environment's network allowlist.");
      return null;
    }
  }

  const init = await call("initialize", "initialize", {
    protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "agentplaybooks-self-check", version: "1" },
  });
  if (!init) return report;
  if (typeof init.protocolVersion !== "string") {
    report.stages.at(-1).status = "failed";
    return report;
  }
  headers["MCP-Protocol-Version"] = init.protocolVersion;
  report.protocolVersion = init.protocolVersion;
  if (!await call("initialized", "notifications/initialized", undefined, true)) return report;
  const listed = await call("tools/list", "tools/list");
  if (!listed) return report;
  if (!Array.isArray(listed.tools) || listed.tools.some(tool => typeof tool.name !== "string")) {
    report.stages.at(-1).status = "failed";
    return report;
  }
  report.toolCount = listed.tools.length;
  report.toolCatalogDigest = `sha256:${createHash("sha256").update(JSON.stringify(listed.tools)).digest("hex")}`;
  report.moreTools = Boolean(listed.nextCursor);
  if (report.toolCount === 0) {
    report.nextSteps.push("The server returned an empty tool catalog. Check server permissions and refresh tools in the host, then start a new conversation.");
    return report;
  }
  if (profile && listed.tools.some(tool => tool.name === "get_profile")) {
    const result = await call("profile", "tools/call", { name: "get_profile", arguments: {} });
    if (!result || result.isError || typeof result.structuredContent?.id !== "string" || !result.structuredContent.id.trim()) {
      if (result) report.stages.at(-1).status = "failed";
      return report;
    }
    const { id, name, email, nickname } = result.structuredContent;
    report.profile = { id, ...(typeof name === "string" ? { name } : {}), ...(typeof email === "string" ? { email } : {}), ...(typeof nickname === "string" ? { nickname } : {}) };
  }
  report.ok = report.stages.every(stage => stage.status === "ok");
  report.nextSteps.push("If tools are still missing in ChatGPT/Codex cloud, refresh the registered plugin connection and start a new conversation. This check verifies the server path, not the host's cached catalog or account consent.");
  return report;
}

export function printConnection(report, log = console.log) {
  log(`AgentPlaybooks connection: ${report.endpoint}`);
  for (const stage of report.stages) log(`  ${stage.stage}: ${stage.status}${stage.httpStatus ? ` (HTTP ${stage.httpStatus})` : ""}${stage.reason ? ` (${stage.reason})` : ""}`);
  if (report.toolCount !== undefined) log(`  Tools: ${report.toolCount}${report.moreTools ? "+ (paginated)" : ""}`);
  if (report.profile) log(`  Account: ${report.profile.email ?? report.profile.name ?? report.profile.id}`);
  for (const step of report.nextSteps) log(`  ${step}`);
}
