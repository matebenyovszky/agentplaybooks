// CI-only origin: exercise the real Request verifier behind each TLS terminator.
import { createServer } from "node:http";
import { verifiedClientFingerprint } from "../../src/lib/mtls";

if (!process.env.TEST_CLIENT_FINGERPRINT) throw new Error("CI fixture fingerprint is required");
createServer((incoming, outgoing) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(",") : value);
  }
  const request = new Request("http://app:3000/", { headers });
  const verified = verifiedClientFingerprint(request);
  outgoing.writeHead(verified === process.env.TEST_CLIENT_FINGERPRINT ? 200 : 401);
  outgoing.end(verified ? "verified" : "denied");
}).listen(3000, "0.0.0.0");
