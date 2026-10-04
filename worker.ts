import { runWithCloudflareRequestContext } from "./.open-next/cloudflare/init.js";
import { dispatchApi } from "./src/worker/api-dispatch";
import { apiRoutes } from "./src/worker/api-routes";
import { publicBuildEnv } from "./src/worker/build-env.generated";
import { applyPublicBuildEnv } from "./src/worker/environment";
import { rejectProbeRequest } from "./src/worker/probe-paths";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const worker = {
  async fetch(request: Request, env: Record<string, unknown>, ctx: unknown): Promise<Response> {
    const probe = rejectProbeRequest(request);
    if (probe) return probe;
    return runWithCloudflareRequestContext(request, env, ctx, async () => {
      applyPublicBuildEnv(process.env, publicBuildEnv);
      const response = await dispatchApi(request, apiRoutes);
      if (response) return response;
      const { default: next } = await import("./.open-next/worker.js");
      return next.fetch(request, env, ctx);
    });
  },
};

export default worker;
