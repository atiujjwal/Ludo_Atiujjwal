// Local test bridge for Nitro's generated Vercel web Function and CDN files.
// Deployment uses Vercel itself, not this server; CDN/platform behavior still
// needs a deployed acceptance check.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";

const root = resolve(".vercel/output/static");
const config = JSON.parse(await readFile(".vercel/output/config.json", "utf8"));
const { default: handler } = await import(
  pathToFileURL(resolve(".vercel/output/functions/__server.func/index.mjs")).href
);
const mime = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
};
const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end();
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    for (const route of config.routes) {
      if (route.handle === "filesystem") break;
      if (route.headers && new RegExp(`^(?:${route.src})$`).test(url.pathname))
        for (const [key, value] of Object.entries(route.headers)) res.setHeader(key, value);
    }
    const file = resolve(root, "." + decodeURIComponent(url.pathname));
    if (file.startsWith(root + sep)) {
      const content = await readFile(file).catch((error) => {
        if (["ENOENT", "EISDIR"].includes(error.code)) return null;
        throw error;
      });
      if (content) {
        res.writeHead(200, {
          "Content-Type": mime[extname(file)] ?? "application/octet-stream",
          "Content-Length": String(content.length),
        });
        return res.end(req.method === "HEAD" ? undefined : content);
      }
    }
    const response = await handler.fetch(
      new Request(url, { method: req.method, headers: req.headers }),
      {
        waitUntil: (promise) => promise.catch(console.error),
      },
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body && req.method !== "HEAD") Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end("Local Vercel preview failed.");
  }
});
server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? "127.0.0.1");
