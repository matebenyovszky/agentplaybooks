/**
 * Who the current API request is acting as, for the database's audit triggers.
 *
 * Configuration changes (playbooks, skills, MCP servers, API keys,
 * collaborators) are recorded by triggers in the database, so that no write
 * path can skip the trail. The application writes with the service role, so
 * the database cannot tell on its own which user or key asked for the change.
 * This module carries that answer to it:
 *
 * 1. Each API entry point runs its handler inside `runWithAuditRequest`, which
 *    remembers the incoming Request for everything the handler awaits.
 * 2. The credential helpers in auth.ts call `noteAuditActor` once they have
 *    resolved who is calling.
 * 3. The server-side Supabase client's fetch adds `x-apb-actor` (and a request
 *    id) to every write it sends. PostgREST exposes request headers to the
 *    triggers, which trust this header only on service_role requests.
 *
 * Reads carry no header: there is nothing to attribute, and the credential
 * lookups themselves are reads, made before the actor is known.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditActorType } from "@/lib/supabase/types";

type AuditActor = { type: AuditActorType; id: string | null };

type RequestScope = { request: Request };

const scope = new AsyncLocalStorage<RequestScope>();
const actors = new WeakMap<Request, AuditActor>();

// A session outranks a key, matching auditActor() in audit.ts: when a request
// carries both, the handlers act for the signed-in user.
const PRECEDENCE: Record<string, number> = { owner: 3, api_key: 2, mtls: 1 };

export function runWithAuditRequest<T>(request: Request, fn: () => T): T {
  return scope.run({ request }, fn);
}

/** Wrap a Next.js route handler so its database writes are attributed. */
export function withAuditRequest<Args extends [Request, ...unknown[]], Result>(
  handler: (...args: Args) => Result,
): (...args: Args) => Result {
  return (...args: Args) => runWithAuditRequest(args[0], () => handler(...args));
}

export function noteAuditActor(request: Request, actor: AuditActor): void {
  if (!actor.id) return;
  const current = actors.get(request);
  if (!current || (PRECEDENCE[actor.type] ?? 0) > (PRECEDENCE[current.type] ?? 0)) {
    actors.set(request, actor);
  }
}

/** Headers attributing the current request's writes, or none outside a request. */
export function auditRequestHeaders(): Record<string, string> {
  const request = scope.getStore()?.request;
  if (!request) return {};
  const headers: Record<string, string> = {};
  const actor = actors.get(request);
  if (actor?.id) headers["x-apb-actor"] = `${actor.type}:${actor.id}`;
  const requestId = request.headers.get("x-request-id") || request.headers.get("cf-ray");
  if (requestId) headers["x-apb-request-id"] = requestId.slice(0, 128);
  return headers;
}

/** fetch for the server-side Supabase clients: writes carry the actor. */
export const auditedFetch: typeof fetch = (input, init) => {
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD") return fetch(input, init);
  const extra = auditRequestHeaders();
  if (Object.keys(extra).length === 0) return fetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return fetch(input, { ...init, headers });
};
