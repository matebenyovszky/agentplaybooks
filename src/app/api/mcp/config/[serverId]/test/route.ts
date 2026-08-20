/**
 * `POST /api/mcp/config/:serverId/test`
 *
 * The handler lives in the parent route's Hono app, which registers `/test`
 * under the same base path. Next.js routes by file, though, so a sub-path needs
 * a file of its own or the request never reaches Hono — it 404s with an HTML
 * error page, which is what the dashboard was trying to parse as JSON.
 */
export { POST } from "../route";
