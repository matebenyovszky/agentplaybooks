import { spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { locales } from "../src/i18n/config";
import { publicPagePaths } from "../src/worker/public-page-paths";
import { publicSnapshotPath } from "../src/worker/public-html-snapshot";

// npm runs this build step from the project root.
const root = resolve(process.cwd());
const standalone = join(root, ".next", "standalone");
const assets = join(root, ".open-next", "assets");

async function allocatePort(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((done, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", done);
  });
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("Cannot reserve the snapshot server port.");
  await new Promise<void>((done, reject) => reservation.close(error => error ? reject(error) : done()));
  return address.port;
}

async function isListening(port: number): Promise<boolean> {
  return new Promise(done => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      done(ready);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function generateSnapshots() {
  // A future middleware/proxy may add auth, interception or rewrites before a
  // public page. Require a policy review instead of silently bypassing it.
  for (const source of ["middleware.ts", "middleware.js", "proxy.ts", "proxy.js", "src/middleware.ts", "src/middleware.js", "src/proxy.ts", "src/proxy.js"]) {
    let present = false;
    try { await readFile(join(root, source)); present = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (present) throw new Error("Review middleware/proxy behavior before generating public snapshots.");
  }
  // Trace output is not guaranteed to include every dynamic Markdown read.
  // Copy only public content, including localized README variants, for rendering.
  for (const section of ["docs", "blog"]) {
    await cp(join(root, "public", section), join(standalone, "public", section), { recursive: true });
  }
  for (const locale of locales) {
    const filename = locale === "en" ? "README.md" : `README.${locale}.md`;
    try { await cp(join(root, filename), join(standalone, filename)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const buildId = (await readFile(join(root, ".next", "BUILD_ID"), "utf8")).trim();
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  const privateEnvironment = ([name]: [string, string | undefined]) => !name.startsWith("NEXT_PUBLIC_")
    && /(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE)/i.test(name);
  const privateValues = Object.entries(process.env).filter(privateEnvironment)
    .map(([, value]) => value).filter((value): value is string => Boolean(value && value.length >= 12));
  const renderEnvironment = Object.fromEntries(Object.entries(process.env).filter(entry => !privateEnvironment(entry)));
  const child = spawn(process.execPath, [join(standalone, "server.js")], {
    cwd: standalone,
    env: { ...renderEnvironment, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port) },
    windowsHide: true,
    // Never echo server output from a production build that has private env vars.
    stdio: "ignore",
  });
  let spawnFailed = false;
  child.once("error", () => { spawnFailed = true; });

  const records: { path: string; locale: string; variant: string; bytes: number }[] = [];
  try {
    let ready = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      if (spawnFailed || child.exitCode !== null) throw new Error("The public snapshot server exited before becoming ready.");
      if (await isListening(port)) { ready = true; break; }
      await new Promise(done => setTimeout(done, 100));
    }
    if (!ready) throw new Error("The public snapshot server did not become ready within 30 seconds.");

    const jobs = [...publicPagePaths].flatMap(path => locales.map(locale => ({ path, locale })));
    let cursor = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cursor < jobs.length) {
        const { path, locale } = jobs[cursor++];
        const response = await fetch(origin + path, {
          headers: { "Accept-Language": locale, "User-Agent": "AgentPlaybooks-Build-Snapshot", Accept: "text/html" },
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
        });
        const html = await response.text();
        const bytes = Buffer.byteLength(html);
        if (response.status !== 200 || response.headers.has("Set-Cookie")
          || !response.headers.get("Content-Type")?.startsWith("text/html")
          || !html.includes(`<html lang="${locale}"`)
          || !html.includes("self.__next_f.push") || html.includes(origin)
          || privateValues.some(value => html.includes(value))
          || bytes > 2 * 1024 * 1024) {
          throw new Error(`Unsafe or invalid public HTML snapshot: ${path} (${locale}).`);
        }
        // Every referenced client bundle must belong to the deployed build.
        const staticFiles = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)(?:\?[^"\s]*)?"/g)];
        for (const match of staticFiles) await readFile(join(assets, match[1]));
        const target = join(assets, publicSnapshotPath(locale, path));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, html);
        records.push({ path, locale, variant: "html", bytes });
        // Full Flight payloads are build-owned too. Keep prefetch and normal
        // navigation distinct; never capture a client's partial router tree.
        for (const variant of ["rsc", "prefetch", "tree"] as const) {
          const flightResponse = await fetch(origin + path, {
            headers: { "Accept-Language": locale, "User-Agent": "AgentPlaybooks-Build-Snapshot", RSC: "1",
              ...(variant !== "rsc" ? { "Next-Router-Prefetch": "1" } : {}),
              ...(variant === "tree" ? { "Next-Router-Segment-Prefetch": "/_tree" } : {}) },
            redirect: "follow", signal: AbortSignal.timeout(30_000),
          });
          const flight = await flightResponse.text();
          const flightBytes = Buffer.byteLength(flight);
          if (flightResponse.status !== 200 || flightResponse.headers.has("Set-Cookie")
            || flightResponse.headers.has("x-nextjs-postponed")
            || new URL(flightResponse.url).origin !== origin
            || !flightResponse.headers.get("Content-Type")?.startsWith("text/x-component")
            || !flight.includes(buildId) || (variant === "rsc" && !flight.includes(`"lang":"${locale}"`))
            || flight.includes(origin) || privateValues.some(value => flight.includes(value))
            || flightBytes > 2 * 1024 * 1024) {
            throw new Error(`Unsafe or invalid public Flight snapshot: ${path} (${locale}, ${variant}).`);
          }
          await writeFile(join(assets, publicSnapshotPath(locale, path, variant)), flight);
          records.push({ path, locale, variant, bytes: flightBytes });
        }
      }
    }));
    records.sort((left, right) => left.path.localeCompare(right.path) || left.locale.localeCompare(right.locale));
    await writeFile(join(root, ".open-next", "public-html-manifest.json"), JSON.stringify({ buildId, pages: records }, null, 2));
    console.log(`Generated ${records.length} public HTML/Flight snapshots for ${publicPagePaths.size} paths and ${locales.length} locales.`);
  } finally {
    child.kill();
  }
}

void generateSnapshots().catch(error => {
  console.error(error instanceof Error ? error.message : "Public HTML snapshot generation failed.");
  process.exitCode = 1;
});
