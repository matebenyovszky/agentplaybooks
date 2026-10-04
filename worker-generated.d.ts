// OpenNext creates these modules during build:worker, after Next's type check.
declare module "*/.open-next/cloudflare/init.js" {
  export function runWithCloudflareRequestContext<T>(request: Request, env: Record<string, unknown>, ctx: unknown, handler: () => Promise<T>): Promise<T>;
}
declare module "*/.open-next/worker.js" {
  const worker: { fetch(request: Request, env: Record<string, unknown>, ctx: unknown): Promise<Response> };
  export default worker;
  export const DOQueueHandler: unknown;
  export const DOShardedTagCache: unknown;
  export const BucketCachePurge: unknown;
}
