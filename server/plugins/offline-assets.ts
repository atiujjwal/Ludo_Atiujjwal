import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { definePlugin } from "nitro";

const isGeneratedAsset = (pathname: string) =>
  pathname === "/sw.js" ||
  /^\/offline\/(index|setup|game|rules|settings)-[a-f0-9]{16}\.html$/.test(pathname);

/**
 * These files are generated AFTER Nitro snapshots static metadata. Serve this
 * small allowlist before that metadata so lengths/ETags cannot be stale.
 * The supported Node entry point is .output/server/index.mjs, independent of cwd.
 */
export default definePlugin((app) => {
  const originalFetch = app.fetch;
  const publicDir = resolve(dirname(process.argv[1] ?? ""), "../public");
  app.fetch = async (request) => {
    const pathname = new URL(request.url).pathname;
    if (!isGeneratedAsset(pathname)) return originalFetch(request);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    try {
      const content = await readFile(resolve(publicDir, pathname.slice(1)), "utf8");
      return new Response(request.method === "HEAD" ? null : content, {
        headers: {
          "Content-Type":
            pathname === "/sw.js" ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Offline preparation is not built yet.", { status: 404 });
    }
  };
});
