export type ProxyStreamOutcome = "success" | "stream_failed" | "client_cancelled" | "timeout";

/** Forward bytes on demand without parsing SSE or accumulating the response. */
export function secretProxyStream(
  source: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  abort: () => void,
  onFinish: (outcome: ProxyStreamOutcome) => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let ended = false;
  let cancelled = false;
  let completion: Promise<void> | undefined;
  let onAbort: () => void;

  function finish(outcome: ProxyStreamOutcome): Promise<void> {
    if (completion) return completion;
    ended = true;
    signal.removeEventListener("abort", onAbort);
    completion = onFinish(outcome).catch(() => {
      // Bookkeeping must not turn a completed provider response into an error.
      console.error("Failed to record proxy stream outcome");
    });
    return completion;
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      onAbort = () => {
        const outcome = signal.reason?.name === "TimeoutError" ? "timeout" : "client_cancelled";
        const recorded = finish(outcome);
        controller.error(new Error("Proxy stream interrupted"));
        void reader.cancel().catch(() => {}).then(() => recorded);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (ended) return;
        if (done) {
          await finish("success");
          reader.releaseLock();
          if (!cancelled) controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch {
        if (ended) return;
        const recorded = finish("stream_failed");
        abort();
        // Do not expose upstream exception messages, which may include headers.
        controller.error(new Error("Upstream response stream failed"));
        await recorded;
      }
    },
    async cancel() {
      cancelled = true;
      const recorded = finish("client_cancelled");
      abort();
      await reader.cancel().catch(() => {});
      await recorded;
    },
  }, { highWaterMark: 0 });
}
