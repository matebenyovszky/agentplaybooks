// This is an MCP Registry domain-authentication proof, derived from the
// public half of the local Ed25519 key. It is intentionally public.
// @worker-native
const MCP_REGISTRY_AUTH_PROOF =
  "v=MCPv1; k=ed25519; p=VOnxyYKlEMg9AMyyVk2OY/SQrNhPoY5Z5xsW5LW1WbU=";

export function GET() {
  return new Response(MCP_REGISTRY_AUTH_PROOF, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
