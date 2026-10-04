// @worker-native
// No traffic-advice policy is published. Answer the existing 404 directly so
// Chrome's prefetch proxy does not initialize Next just to render an error page.
export function GET() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
}
