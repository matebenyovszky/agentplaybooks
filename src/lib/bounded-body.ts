export class BodySizeLimitError extends Error {
  constructor() { super("Body exceeds the buffering limit"); }
}

/** Bound bytes before decoding; optionally stop after a text preview. */
export async function readBoundedText(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  maxCharacters = Infinity,
): Promise<{ text: string; truncated: boolean }> {
  if (!body) return { text: "", truncated: false };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  let characters = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      bytes += value?.byteLength ?? 0;
      if (bytes > maxBytes) throw new BodySizeLimitError();
      const part = done ? decoder.decode() : value ? decoder.decode(value, { stream: true }) : "";
      complete = done;
      if (characters + part.length > maxCharacters) {
        parts.push(part.slice(0, maxCharacters - characters));
        return { text: parts.join(""), truncated: true };
      }
      parts.push(part);
      characters += part.length;
      if (done) return { text: parts.join(""), truncated: false };
    }
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
