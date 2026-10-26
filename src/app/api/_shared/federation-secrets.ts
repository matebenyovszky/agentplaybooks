import { decryptSecret } from "@/lib/crypto";
import { isSecretExpired } from "@/lib/secret-expiry";
import { referencedSecretNames } from "@/lib/mcp/secret-references";
import { checkSecretDestination } from "@/lib/secret-destinations";
import { getServiceSupabase } from "./supabase";
import { getAuthenticatedUser, validateUserApiKey } from "./auth";
import { getPlaybookAccessRole } from "./guards";
import type { MCPServer, Secret } from "@/lib/supabase/types";

/**
 * Secret resolution for federated MCP/OpenAPI calls.
 *
 * A server's transport config references credentials by name
 * (`auth.token_secret: "SEARCH_TOKEN"`), and those names resolve from the
 * playbook's Secrets vault. There is exactly one place a credential lives.
 *
 * There used to be a second store: an encrypted payload per MCP server
 * (`mcp_server_secrets`), with its own weaker crypto — a key that was just
 * SHA-256 of a passphrase, unsalted, with no AAD binding the ciphertext to the
 * server it belonged to. It also had no rotation, no expiry, no usage
 * accounting and no audit trail, all of which the vault has. Keeping it meant
 * the credentials most likely to be worth stealing sat in the weaker box.
 *
 * Vault decryption happens only for the names the config actually references,
 * never wholesale. Injecting a vault value into an outbound federated request is
 * proxy-style use — the value goes to the upstream service, not to the caller —
 * so it is allowed regardless of the secret's reveal flag, exactly like
 * `use_secret`. An `allowed_hosts` list set on the secret is honoured against
 * every destination the server config can reach, which is the concrete gain
 * from this move: an upstream credential can now be pinned to its own upstream
 * host. A blocked or undecryptable secret is simply left unresolved, and
 * federation reports MISSING_SECRET with the name, which is a far clearer
 * failure than a silently absent header.
 */


// Stands for a destination this config does not name: an OpenAPI base URL that
// comes from a fetched spec. It never matches an allow-list entry, so a pinned
// secret is not sent there.
const UNKNOWN_DESTINATION = "unknown-destination:";

/** Every host a request carrying this server's credentials can be sent to. */
export function serverDestinations(transportConfig: unknown): string[] {
  const config = transportConfig as Record<string, unknown> | null | undefined;
  const auth = config?.auth as Record<string, unknown> | undefined;
  const destinations: unknown[] = [config?.url, config?.spec_url, config?.base_url, auth?.token_url];
  const inlineSpec = config?.openapi as { servers?: Array<{ url?: unknown }> } | undefined;
  if (!config?.base_url) {
    if (Array.isArray(inlineSpec?.servers)) {
      destinations.push(...inlineSpec.servers.map((server) => server?.url));
    } else if (config?.spec_url) {
      destinations.push(UNKNOWN_DESTINATION);
    }
  }
  return destinations.filter((value): value is string => typeof value === "string" && value.length > 0);
}

/**
 * A server config that names vault secrets decides where those secrets are
 * sent. Writing one is therefore a use of the secrets, and needs the same
 * authority as `use_secret`: the playbook owner, or a key holding secrets:read.
 */
export function configReferencesSecrets(transportConfig: unknown): boolean {
  return referencedSecretNames(transportConfig).length > 0;
}

export const SECRET_ROUTING_DENIED =
  "This MCP server configuration references vault secrets. Only the playbook owner, or a key with secrets:read, may point a server at them.";

/**
 * Anonymous callers may use a server marked `access: "public"` only when it
 * carries no vault credentials: "public" means a keyless upstream, not the
 * owner's credentials offered to anyone.
 */
export function anonymousMayCall(server: Pick<MCPServer, "transport_config">): boolean {
  const access = (server.transport_config as { access?: string } | null)?.access;
  return access === "public" && !configReferencesSecrets(server.transport_config);
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
 * Decrypt the credentials a federated server needs, by name, from the
 * playbook's Secrets vault.
 */
export async function loadFederationSecrets(
  server: MCPServer,
  playbookId: string,
): Promise<Record<string, unknown>> {
  const service = getServiceSupabase();

  const referenced = referencedSecretNames(server.transport_config);
  if (referenced.length === 0) return {};

  // The vault key is derived per owner, so the owner id is required to decrypt.
  const { data: playbook } = await service
    .from("playbooks")
    .select("id, user_id")
    .eq("id", playbookId)
    .maybeSingle();
  if (!playbook) return {};

  const { data: vaultRows } = await service
    .from("secrets")
    .select("*")
    .eq("playbook_id", playbookId)
    .in("name", referenced);
  if (!vaultRows || vaultRows.length === 0) return {};

  const destinations = serverDestinations(server.transport_config);
  const resolved: Record<string, unknown> = {};
  const used: Secret[] = [];

  for (const secret of vaultRows as Secret[]) {
    // Deployment-wide requireAllowList policy applies here the same way it
    // applies to the use_secret proxy: checkSecretDestination reads it itself.
    const blocked = destinations.some((url) =>
      !checkSecretDestination(url, secret.allowed_hosts).allowed);
    if (blocked) continue;
    // Expired is treated like blocked: the secret stays unresolved and
    // federation names it as missing, rather than calling with a stale value.
    if (isSecretExpired(secret.expires_at)) continue;
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

/**
 * May this signed-in user, or user API key, point a server at vault secrets?
 * Only the owner can use the playbook's secrets, and a user key needs
 * secrets:read as well — playbooks:write alone must not route credentials.
 */
export async function userMayRouteSecrets(request: Request, userId: string, playbookId: string): Promise<boolean> {
  if ((await getPlaybookAccessRole(userId, playbookId)) !== "owner") return false;
  const session = await getAuthenticatedUser(request);
  if (session?.id === userId) return true;
  const userKey = await validateUserApiKey(request, "secrets:read");
  return userKey?.user_id === userId;
}
