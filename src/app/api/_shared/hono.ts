import { Hono } from "hono";
import { cors } from "hono/cors";

export function createApiApp(basePath?: string) {
  const app = new Hono();
  app.use("*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }));
  return basePath ? app.basePath(basePath) : app;
}
