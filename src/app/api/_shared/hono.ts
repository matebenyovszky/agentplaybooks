import { Hono } from "hono";
import { cors } from "hono/cors";

export function createApiApp(basePath?: string) {
  const ALLOWED_ORIGINS = [
    process.env.NEXT_PUBLIC_APP_URL || "https://agentplaybooks.ai",
    "https://agentplaybooks.ai",
    "https://www.agentplaybooks.ai",
    "https://apbks.com",
    "https://www.apbks.com",
    "https://apbks.online",
    "https://www.apbks.online",
  ].filter(Boolean);

  const app = new Hono();
  app.use("*", cors({
    origin: (origin) => {
      if (!origin) return ALLOWED_ORIGINS[0];
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      if (process.env.NODE_ENV === "development" && origin.startsWith("http://localhost")) return origin;
      return null as unknown as string;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  }));
  return basePath ? app.basePath(basePath) : app;
}
