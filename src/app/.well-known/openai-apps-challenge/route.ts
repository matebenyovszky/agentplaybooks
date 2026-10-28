// Public ownership challenge supplied by the owning OpenAI plugin project.
// @worker-native
const OPENAI_APPS_CHALLENGE = "BUm3cWe61XgL16oyPPBlVrJlrbE2zC0VpcS2mNDSHzc";

export function GET() {
  return new Response(OPENAI_APPS_CHALLENGE, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
