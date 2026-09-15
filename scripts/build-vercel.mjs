import { spawn } from "node:child_process";
import { cp, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

async function run(script, args = [], preset = "node_server") {
  const child = spawn(process.execPath, [resolve(script), ...args], {
    env: { ...process.env, LUDO_BUILD_PRESET: preset },
    stdio: "inherit",
    windowsHide: true,
  });
  await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0 ? done() : reject(new Error(`${script} failed (${signal ?? code}).`)),
    );
  });
}

// Snapshot and verify offline routes using the existing standalone Node server.
// It cannot be started from Vercel's serverless entry, so retain this first stage.
await run("node_modules/vite/bin/vite.js", ["build"]);
await run("scripts/optimize-assets.mjs");
await run("scripts/build-offline.mjs");

// Let the official Nitro preset generate Functions, SSR routing and CDN metadata.
await run("node_modules/vite/bin/vite.js", ["build"], "vercel");
const source = resolve(".output/public");
const target = resolve(".vercel/output/static");
const config = JSON.parse(await readFile(".vercel/output/config.json", "utf8"));
if (config.version !== 3 || !config.routes?.some((route) => route.handle === "filesystem"))
  throw new Error("Nitro did not produce a valid Vercel Build Output API configuration.");

// Never ship offline HTML from one build with browser bundles from another.
const digest = (content) => createHash("sha256").update(content).digest("hex");
for (const file of await readdir(resolve(source, "assets"))) {
  if (!/\.(js|css|svg)$/.test(file)) continue;
  const [original, packaged] = await Promise.all([
    readFile(resolve(source, "assets", file)),
    readFile(resolve(target, "assets", file)),
  ]);
  if (digest(original) !== digest(packaged))
    throw new Error(`Node/Vercel browser asset mismatch: ${file}`);
}

// Optimization and precaching happen after Nitro snapshots static metadata.
// Copy the verified deployment bytes (including cats/static frames and sw.js).
await cp(source, target, { recursive: true });
const worker = await readFile(resolve(target, "sw.js"), "utf8");
const integrity = JSON.parse(worker.match(/^const INTEGRITY = (.+);$/m)?.[1] ?? "null");
if (!integrity || Object.keys(integrity).length === 0)
  throw new Error("Vercel worker has no verified offline inventory.");
for (const [file, expected] of Object.entries(integrity))
  if (digest(await readFile(resolve(target, file.slice(1)))) !== expected)
    throw new Error(`Vercel precache mismatch: ${file}`);

const { default: handler } = await import(
  pathToFileURL(resolve(".vercel/output/functions/__server.func/index.mjs")).href
);
for (const route of ["/", "/setup", "/game", "/rules", "/settings", "/not-a-ludo-route"]) {
  const response = await handler.fetch(new Request(`http://localhost${route}`), {
    waitUntil: (promise) => promise.catch(console.error),
  });
  const expected = route === "/not-a-ludo-route" ? 404 : 200;
  if (response.status !== expected || !(await response.text()).includes('data-appearance="royal"'))
    throw new Error(`Vercel SSR smoke check failed: ${route} (${response.status}).`);
}
console.log("Vercel output ready: .vercel/output (SSR Functions + verified offline assets).");
