import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const publicDir = resolve(".output/public");
const routes = ["/", "/setup", "/game", "/rules", "/settings"];
const probe = createServer();
await new Promise((done) => probe.listen(0, "127.0.0.1", done));
const port = probe.address().port;
await new Promise((done) => probe.close(done));
const server = spawn(process.execPath, [resolve(".output/server/index.mjs")], {
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    NITRO_PORT: String(port),
    NITRO_HOST: "127.0.0.1",
  },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog = (serverLog + chunk).slice(-8000);
});
server.stderr.on("data", (chunk) => {
  serverLog = (serverLog + chunk).slice(-8000);
});
let spawnError;
server.on("error", (error) => {
  spawnError = error;
});
try {
  const base = "http://127.0.0.1:" + port;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (spawnError || server.exitCode !== null) throw spawnError ?? new Error(serverLog);
    try {
      ready = (await fetch(base, { signal: AbortSignal.timeout(1500) })).ok;
    } catch {
      /* startup */
    }
    if (ready) break;
    await delay(150);
  }
  if (!ready) throw new Error("Offline snapshot server did not start. " + serverLog);
  await mkdir(resolve(publicDir, "offline"), { recursive: true });
  const navigation = {};
  for (const route of routes) {
    const response = await fetch(base + route);
    if (!response.ok) throw new Error("Cannot precache route " + route + ": " + response.status);
    const html = await response.text();
    if (!html.includes('data-appearance="royal"') || !html.includes("/assets/")) {
      throw new Error("Invalid SSR snapshot for " + route);
    }
    const pageRevision = createHash("sha256").update(html).digest("hex").slice(0, 16);
    const target =
      "/offline/" + (route === "/" ? "index" : route.slice(1)) + "-" + pageRevision + ".html";
    navigation[route] = target;
    await writeFile(resolve(publicDir, target.slice(1)), html);
  }
  async function files(dir, prefix = "") {
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix + "/" + entry.name;
      if (entry.isDirectory()) result.push(...(await files(resolve(dir, entry.name), relative)));
      else if (
        /\.(?:js|css|html|png|ico|svg|webp|gif|mp3|woff2?|webmanifest)$/.test(entry.name) &&
        relative !== "/sw.js" &&
        ![
          "/audio/crying_audio.mp3",
          "/animation/crying_teddy.gif",
          "/animation/crying_teddy-still.png",
          "/animation/happy_teddy.gif",
        ].includes(relative)
      )
        result.push(relative);
    }
    return result.sort();
  }
  const precache = await files(publicDir);
  const hash = createHash("sha256");
  const template = await readFile("public/sw.js", "utf8");
  hash.update(template);
  let bytes = 0;
  for (const file of precache) {
    const content = await readFile(resolve(publicDir, file.slice(1)));
    bytes += content.length;
    hash.update(file).update(content);
  }
  const missing = await fetch(base + "/not-a-ludo-route");
  if (missing.status !== 404) throw new Error("Unknown routes must retain their 404 status.");
  const head = await fetch(base + "/sw.js", { method: "HEAD" });
  if (!head.ok || (await head.text()) !== "") throw new Error("Worker HEAD response is invalid.");
  const revision = hash.digest("hex").slice(0, 16);
  const worker = template
    .replace("__BUILD_REVISION__", revision)
    .replace(
      "const PRECACHE = []; // __PRECACHE__",
      "const PRECACHE = " + JSON.stringify(precache) + ";",
    )
    .replace(
      "const NAVIGATION = {}; // __NAVIGATION__",
      "const NAVIGATION = " + JSON.stringify(navigation) + ";",
    );
  await writeFile(resolve(publicDir, "sw.js"), worker);
  // Read over HTTP too: post-build files must bypass Nitro's pre-build metadata.
  const servedWorker = await fetch(base + "/sw.js");
  if (!servedWorker.ok || (await servedWorker.text()) !== worker) {
    throw new Error("The generated worker was not served completely.");
  }
  for (const file of precache) {
    const response = await fetch(base + file);
    if (!response.ok) throw new Error("Precache asset is not served: " + file);
    if (
      file.startsWith("/offline/") &&
      !(await response.text()).includes('data-appearance="royal"')
    ) {
      throw new Error("Invalid served offline page: " + file);
    }
  }
  console.log(
    "Offline shell " +
      revision +
      ": " +
      routes.length +
      " routes, " +
      precache.length +
      " files, " +
      (bytes / 1024).toFixed(1) +
      " KB uncompressed.",
  );
} finally {
  server.kill();
}
