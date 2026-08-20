import { decryptSecret } from "@/lib/crypto";
import { referencedSecretNames } from "@/lib/mcp/secret-references";
import { decryptMcpSecrets } from "@/lib/mcp/secrets";
import { checkSecretDestination } from "@/lib/secret-destinations";
import { getServiceSupabase } from "./supabase";
import type { MCPServer, Secret } from "@/lib/supabase/types";

/**
 * Secret resolution for federated MCP/OpenAPI calls.
 *
 * A server's transport config references credentials by name
 * (`auth.token_secret: "SEARCH_TOKEN"`). Those names used to resolve only from
 * the server's own encrypted payload (`mcp_server_secrets`), which forced the
 * same credential to be stored twice when it also lived in the playbook's
 * Secrets vault. Resolution is now two steps:
 *
 *   1. the server's own payload — authoritative when it defines the name, so
 *      nothing that works today changes meaning;
 *   2. the playbook vault, by exact name.
 *
 * Vault decryption happens only for the names the config actually references,
 * never wholesale. Injecting a vault value into an outbound federated request is
 * proxy-style use — the value goes to the upstream service, not to the caller —
 * so it is allowed regardless of the secret's reveal flag, exactly like
 * `use_secret`. An `allowed_hosts` list set on the secret is honoured against
 * every destination the server config can reach; a blocked or undecryptable
 * secret is simply left unresolved, and federation reports MISSING_SECRET with
 * the name, which is a far clearer failure than a silently absent header.
 */


function serverDestinations(transportConfig: unknown): string[] {
  const config = transportConfig as Record<string, unknown> | null | undefined;
  return ["url", "spec_url", "base_url"]
    .map((key) => config?.[key])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

async function recordVaultUse(secrets: Secret[]) {
  const service = getServiceSupabase();
  const now = new Date().toISOString();
  await Promise.all(secrets.map((secret) =>
    service
      .from("secrets")
      .update({ last_used_at: now, use_count: (secret.use_count || 0) + 1 })
      .eq("id", secret.id)
  ));
}

/**
 * Decrypt the credentials a federated server needs: its own payload first,
 * then the playbook vault for referenced names the payload does not define.
 */
export async function loadFederationSecrets(
  server: MCPServer,
  playbookId: string,
): Promise<Record<string, unknown>> {
  const service = getServiceSupabase();

  const { data: row } = await service
    .from("mcp_server_secrets")
    .select("encrypted_payload, iv")
    .eq("mcp_server_id", server.id)
    .maybeSingle();
  const own = row ? await decryptMcpSecrets(row.encrypted_payload, row.iv, server.id) : {};

  const missing = referencedSecretNames(server.transport_config)
    .filter((name) => own[name] === undefined);
  if (missing.length === 0) return own;

  // The vault key is derived per owner, so the owner id is required to decrypt.
  const { data: playbook } = await service
    .from("playbooks")
    .select("id, user_id")
    .eq("id", playbookId)
    .maybeSingle();
  if (!playbook) return own;

  const { data: vaultRows } = await service
    .from("secrets")
    .select("*")
    .eq("playbook_id", playbookId)
    .in("name", missing);
  if (!vaultRows || vaultRows.length === 0) return own;

  const destinations = serverDestinations(server.transport_config);
  const resolved: Record<string, unknown> = { ...own };
  const used: Secret[] = [];

  for (const secret of vaultRows as Secret[]) {
    // Deployment-wide requireAllowList policy applies here the same way it
    // applies to the use_secret proxy: checkSecretDestination reads it itself.
    const blocked = destinations.some((url) =>
      !checkSecretDestination(url, secret.allowed_hosts).allowed);
    if (blocked) continue;
    try {
      resolved[secret.name] = await decryptSecret(
        {
          encrypted_value: secret.encrypted_value,
          iv: secret.iv,
          auth_tag: secret.auth_tag,
        },
        playbook.user_id,
        { playbookId, secretName: secret.name },
      );
      used.push(secret);
    } catch {
      // An undecryptable row (rotated master key, tampering) stays unresolved;
      // federation will name the missing secret.
      continue;
    }
  }

  if (used.length > 0) {
    await recordVaultUse(used).catch(() => {});
  }
  return resolved;
}

// Re-exported so existing imports keep one entry point on the server side.
export { referencedSecretNames };
