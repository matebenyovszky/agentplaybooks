import { AsyncLocalStorage } from "node:async_hooks";

type Projection = { operation: string; captured: boolean; value?: unknown };
const projections = new AsyncLocalStorage<Projection>();

/** Internal only: no request header can enable this transport optimization. */
export async function withOperationResult<T>(operation: string, run: () => Promise<T>) {
  const projection: Projection = { operation, captured: false };
  const response = await projections.run(projection, run);
  return { response, ...projection };
}

/** Called only after the ordinary operation's authorization and audit writes. */
export function captureOperationResult(operation: string, value: unknown): boolean {
  const projection = projections.getStore();
  // Management discovery merges a scoped JSON-RPC response; leave that path intact.
  if (!projection || projection.operation !== operation || operation === "find_tools") return false;
  projection.value = value;
  projection.captured = true;
  return true;
}
