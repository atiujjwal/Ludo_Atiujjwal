import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/pwa",
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4319",
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node .output/server/index.mjs",
    url: "http://127.0.0.1:4319",
    env: { PORT: "4319", HOST: "127.0.0.1", NITRO_PORT: "4319", NITRO_HOST: "127.0.0.1" },
    reuseExistingServer: false,
  },
});
