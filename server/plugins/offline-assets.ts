import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { definePlugin } from "nitro";

const isGeneratedAsset = (pathname: string) =>
  pathname === "/sw.js" ||
  /^\/assets\/[^/]+\.(?:js|css|svg)$/.test(pathname) ||
  pathname === "/manifest.webmanifest" ||
  /^\/offline\/(index|setup|game|rules|settings)-[a-f0-9]{16}\.html$/.test(pathname) ||
  /^\/(logo\.jpeg|favicon\.png|animation\/(?:bleh-cat|cat-orange-cat|banana-cat-crying|crying-crying-cat|babsb-cat|dancing-cat-ai|happy-cat)(?:-still\.png|\.gif)|icons\/(?:icon-192|icon-512|icon-maskable|apple-touch-icon)\.png)$/.test(
    pathname,
  );

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
      const content = await readFile(resolve(publicDir, pathname.slice(1)));
      const mime = pathname.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : pathname.endsWith(".html")
          ? "text/html; charset=utf-8"
          : pathname.endsWith(".css")
            ? "text/css; charset=utf-8"
            : pathname.endsWith(".svg")
              ? "image/svg+xml"
              : pathname.endsWith(".webmanifest")
                ? "application/manifest+json"
                : pathname.endsWith(".jpeg")
                  ? "image/jpeg"
                  : pathname.endsWith(".gif")
                    ? "image/gif"
                    : "image/png";
      const accepted = (request.headers.get("accept-encoding") ?? "")
        .split(",")
        .map((part) => {
          const [name, quality] = part.trim().split(";q=");
          return { name, quality: quality === undefined ? 1 : Number(quality) };
        })
        .filter((part) => ["br", "gzip"].includes(part.name ?? "") && part.quality > 0)
        .sort((a, b) => b.quality - a.quality);
      let body = content;
      let encoding: string | undefined;
      for (const part of accepted) {
        const compressed = await readFile(
          resolve(publicDir, pathname.slice(1) + (part.name === "br" ? ".br" : ".gz")),
        ).catch(() => undefined);
        if (compressed) {
          body = compressed;
          encoding = part.name;
          break;
        }
      }
      return new Response(request.method === "HEAD" ? null : body, {
        headers: {
          "Content-Type": mime,
          "Content-Length": String(body.byteLength),
          "Cache-Control": pathname.startsWith("/assets/")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
          Vary: "Accept-Encoding",
          ...(encoding ? { "Content-Encoding": encoding } : {}),
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Offline preparation is not built yet.", { status: 404 });
    }
  };
});
