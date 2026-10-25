import { Hono } from "hono";
import { cors } from "hono/cors";

/**
 * Origins allowed to make credentialed cross-origin API calls.
 *
 * Self-hosted deployments set `ALLOWED_ORIGINS` (comma-separated) to replace
 * the list entirely. If that is unset but `NEXT_PUBLIC_APP_URL` is a origin
 * that is not one of this project's hosted sites, only that origin is trusted
 * — otherwise a private instance would keep the public product domains on its
 * CORS allow-list. Unset APP_URL keeps the hosted list, so the public service
 * is unaffected.
 */

const HOSTED_ORIGINS: readonly string[] = [
  "https://agentplaybooks.ai",
  "https://www.agentplaybooks.ai",
  "https://apbks.com",
  "https://www.apbks.com",
  "https://apbks.online",
  "https://www.apbks.online",
];

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    const trimmed = value.replace(/\/$/, "");
    return trimmed || null;
  }
}

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

  const hosted = [...HOSTED_ORIGINS];
  const appOrigin = originOf(appUrl);
  if (appOrigin && !hosted.includes(appOrigin)) {
    return [appOrigin];
  }
  if (appOrigin) {
    return [appOrigin, ...hosted.filter((origin) => origin !== appOrigin)];
  }
  return hosted;
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
