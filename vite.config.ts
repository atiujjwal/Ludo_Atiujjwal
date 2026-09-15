import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { existsSync, readdirSync } from "node:fs";

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
    nitro({ preset: "node_server", plugins: ["./server/plugins/offline-assets.ts"] }),
    react(),
  ],
});
