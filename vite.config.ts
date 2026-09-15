import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { existsSync, readdirSync } from "node:fs";
import sharp from "sharp";
import { catAssets } from "./scripts/cat-assets.mjs";

// The portable Node build remains the default; Vercel packaging is explicit.
const vercelBuild = process.env["LUDO_BUILD_PRESET"] === "vercel";

export default defineConfig({
  define: {
    __LUDO_AUDIO_FILES__: JSON.stringify(
      existsSync("public/audio")
        ? readdirSync("public/audio").filter(
            (file) => /\.mp3$/i.test(file) && file !== "crying_audio.mp3",
          )
        : [],
    ),
  },
  css: {
    transformer: "lightningcss",
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  optimizeDeps: {
    ignoreOutdatedRequests: true,
  },
  plugins: [
    {
      name: "cat-static-frames",
      configureServer(server) {
        const frames = new Map<string, Promise<Buffer>>();
        server.middlewares.use(async (req, res, next) => {
          const name = new URL(req.url ?? "/", "http://localhost").pathname.match(
            /^\/animation\/([^/]+)-still\.png$/,
          )?.[1];
          if (!name || !catAssets.includes(name)) return next();
          try {
            let frame = frames.get(name);
            if (!frame) {
              frame = sharp(`public/animation/${name}.gif`)
                .resize({ width: 160, withoutEnlargement: true })
                .png()
                .toBuffer();
              frames.set(name, frame);
            }
            res.setHeader("Content-Type", "image/png");
            res.end(await frame);
          } catch (error) {
            next(error);
          }
        });
      },
    },
    tailwindcss(),
    tanstackStart({
      // Keep the existing SSR error wrapper as the server entry point.
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    nitro({
      preset: vercelBuild ? "vercel" : "node_server",
      // Vercel serves generated assets from its CDN, not the Node-only file wrapper.
      plugins: vercelBuild ? [] : ["./server/plugins/offline-assets.ts"],
      ...(vercelBuild
        ? {
            vercel: { functions: { runtime: "nodejs22.x" }, entryFormat: "web" as const },
            routeRules: {
              "/sw.js": {
                headers: {
                  "cache-control": "no-cache",
                  "service-worker-allowed": "/",
                },
              },
              "/manifest.webmanifest": { headers: { "cache-control": "no-cache" } },
              "/offline/**": { headers: { "cache-control": "no-cache" } },
              "/animation/**": { headers: { "cache-control": "no-cache" } },
              "/icons/**": { headers: { "cache-control": "no-cache" } },
              "/logo.jpeg": { headers: { "cache-control": "no-cache" } },
              "/favicon.png": { headers: { "cache-control": "no-cache" } },
            },
          }
        : {}),
    }),
    react(),
  ],
});
