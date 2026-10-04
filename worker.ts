import { runWithCloudflareRequestContext } from "./.open-next/cloudflare/init.js";
import { dispatchApi } from "./src/worker/api-dispatch";
import { apiRoutes } from "./src/worker/api-routes";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const worker = {
  async fetch(request: Request, env: Record<string, unknown>, ctx: unknown): Promise<Response> {
    return runWithCloudflareRequestContext(request, env, ctx, async () => {
      const response = await dispatchApi(request, apiRoutes);
      if (response) return response;
      const { default: next } = await import("./.open-next/worker.js");
      return next.fetch(request, env, ctx);
    });
  },
};

export default worker;
