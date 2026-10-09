import { runWithCloudflareRequestContext } from "./.open-next/cloudflare/init.js";
import { dispatchApi } from "./src/worker/api-dispatch";
import { apiRoutes } from "./src/worker/api-routes";
import { publicBuildEnv } from "./src/worker/build-env.generated";
import { applyPublicBuildEnv } from "./src/worker/environment";
import { rejectProbeRequest } from "./src/worker/probe-paths";
import { servePublicPage, type PublicPageCache } from "./src/worker/public-page-cache";
import { servePublicSnapshot, type PublicAssetBinding } from "./src/worker/public-html-snapshot";
import { routePageRequest } from "./src/worker/page-routing";

// Export the adapter bindings without eagerly evaluating its Next middleware.
export { DOQueueHandler } from "./.open-next/.build/durable-objects/queue.js";
export { DOShardedTagCache } from "./.open-next/.build/durable-objects/sharded-tag-cache.js";
export { BucketCachePurge } from "./.open-next/.build/durable-objects/bucket-cache-purge.js";

const worker = {
  async fetch(request: Request, env: Record<string, unknown>, ctx: unknown): Promise<Response> {
    const probe = rejectProbeRequest(request);
    if (probe) return probe;
    return runWithCloudflareRequestContext(request, env, ctx, async () => {
      applyPublicBuildEnv(process.env, publicBuildEnv);
      const response = await dispatchApi(request, apiRoutes);
      if (response) return response;
      const routed = await routePageRequest(request, apiRoutes, env.ASSETS as PublicAssetBinding | undefined);
      if (routed) return routed;
      const version = (env.CF_VERSION_METADATA as { id?: string } | undefined)?.id;
      const snapshot = await servePublicSnapshot(request, version, env.ASSETS as PublicAssetBinding | undefined);
      if (snapshot) return snapshot;
      const cache = (globalThis.caches as unknown as { default?: PublicPageCache } | undefined)?.default;
      return servePublicPage(request, version, cache, async () => {
        const { default: next } = await import("./.open-next/worker.js");
        return next.fetch(request, env, ctx);
      });
    });
  },
};

export default worker;
