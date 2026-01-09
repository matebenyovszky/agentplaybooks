
import { createApiApp } from "@/app/api/_shared/hono";

// Re-export the app for testing
export const testApp = createApiApp("/api");
export const testMcpApp = createApiApp("/api/mcp/:guid");
export const testMcpManageApp = createApiApp("/api/mcp/manage");