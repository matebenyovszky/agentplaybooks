import { Hono } from "hono";
import { cors } from "hono/cors";

/**
 * Origins allowed to make credentialed cross-origin API calls.
 *
 * Self-hosted deployments set `ALLOWED_ORIGINS` (comma-separated) to replace
 * the list entirely — otherwise the project's own hosted domains would stay
 * trusted on an unrelated instance. Leaving it unset keeps the previous
 * behaviour, so hosted deployments are unaffected.
 */
export function resolveAllowedOrigins(
  configured = process.env.ALLOWED_ORIGINS,
  appUrl = process.env.NEXT_PUBLIC_APP_URL,
): string[] {
  const explicit = configured
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (explicit && explicit.length > 0) {
    return explicit;
  }

  return [
    appUrl || "https://agentplaybooks.ai",
    "https://agentplaybooks.ai",
    "https://www.agentplaybooks.ai",
    "https://apbks.com",
    "https://www.apbks.com",
    "https://apbks.online",
    "https://www.apbks.online",
  ].filter(Boolean);
}

export function createApiApp(basePath?: string) {
  const app = new Hono();
  app.use("*", cors({
    origin: (origin) => {
      const allowedOrigins = resolveAllowedOrigins();
      if (!origin) return allowedOrigins[0];
      if (allowedOrigins.includes(origin)) return origin;
      if (process.env.NODE_ENV === "development" && origin.startsWith("http://localhost")) return origin;
      return null as unknown as string;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    // X-API-Key is the alternative credential carrier for clients that reserve
    // Authorization for themselves; a browser client cannot send it unless the
    // preflight says so. Mcp-Method and Mcp-Name are the modern era's mirrored
    // request headers.
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Key",
      "MCP-Protocol-Version",
      "Mcp-Session-Id",
      "Mcp-Method",
      "Mcp-Name",
      "Last-Event-ID",
    ],
    credentials: true,
    maxAge: 86400,
  }));
  return basePath ? app.basePath(basePath) : app;
}
