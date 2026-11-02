import { BodySizeLimitError, readBoundedText } from "./bounded-body";

export const MAX_PROXY_RESPONSE_BYTES = 8 * 1024 * 1024;

export class ProxyResponseTooLargeError extends Error {
  constructor() {
    super("Upstream response exceeds 8 MiB; paginate the request or use the streaming proxy.");
    this.name = "ProxyResponseTooLargeError";
  }
}

/** JSON is parsed once; plain text needs only its first 10,000 characters. */
export async function readSecretProxyResponse(response: Response): Promise<unknown> {
  const json = response.headers.get("content-type")?.includes("application/json");
  try {
    const { text, truncated } = await readBoundedText(response.body, MAX_PROXY_RESPONSE_BYTES, json ? Infinity : 10_000);
    return json ? JSON.parse(text) : text + (truncated ? "\n... (truncated)" : "");
  } catch (error) {
    if (error instanceof BodySizeLimitError) throw new ProxyResponseTooLargeError();
    throw error;
  }
}
