const OAUTH_SCOPES = ["openid", "email", "profile"];

function canonicalResource(request: Request): string {
  return new URL("/api/mcp/manage", request.url).toString();
}

export function managementResourceMetadata(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for OAuth discovery");
  }

  return {
    resource: canonicalResource(request),
    resource_name: "AgentPlaybooks Management",
    authorization_servers: [`${supabaseUrl}/auth/v1`],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: new URL("/docs", request.url).toString(),
  };
}

export function managementResourceMetadataResponse(request: Request): Response {
  try {
    return Response.json(managementResourceMetadata(request), {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth discovery is not configured";
    return Response.json({ error: message }, { status: 503 });
  }
}

export function oauthMetadataOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
