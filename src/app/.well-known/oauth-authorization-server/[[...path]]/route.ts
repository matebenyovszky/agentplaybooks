import { NextResponse } from "next/server";
import { oauthAuthorizationServer } from "@/lib/mcp-oauth";

/**
 * OAuth clients sometimes discover authorization-server metadata from the
 * protected resource URL itself (RFC 8414 path-based discovery). The actual
 * authorization server for AgentPlaybooks MCP is Supabase Auth, so forward
 * that discovery request to Supabase's canonical metadata endpoint.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const issuer = new URL(oauthAuthorizationServer());
  const metadataUrl = new URL(
    `/.well-known/oauth-authorization-server${issuer.pathname.replace(/\/$/, "")}`,
    issuer.origin,
  );

  return NextResponse.redirect(metadataUrl, 307);
}
