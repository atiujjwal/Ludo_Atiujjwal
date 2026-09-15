import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const label = process.argv[2] ?? "current";
const port = 4318;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [".output/server/index.mjs"], {
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    NITRO_PORT: String(port),
    NITRO_HOST: "127.0.0.1",
  },
  windowsHide: true,
  stdio: "ignore",
});
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* startup */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.bringToFront();
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await page.goto(origin);
  await page.getByRole("heading", { name: "Ludo", exact: true }).waitFor();
  await page.waitForTimeout(800);
  const critical = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => /\.(js|css)(\?|$)/.test(entry.name))
      .map((entry) => new URL(entry.name).pathname),
  );
  let criticalGzipBytes = 0;
  for (const path of new Set(critical))
    criticalGzipBytes += gzipSync(await readFile(".output/public" + path)).length;
  await page.waitForFunction(async () => {
    const keys = (await caches.keys()).filter((key) => key.startsWith("ludo-shell-"));
    for (const key of keys) if ((await (await caches.open(key)).keys()).length > 20) return true;
    return false;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.waitForFunction(() =>
    document.querySelector(".royal-offline-status")?.textContent?.includes("Ready"),
  );
  await page.waitForTimeout(1200);
  await context.setOffline(true);
  const offlineStartupMs = [];
  for (let i = 0; i < 5; i++) {
    const cold = await context.newPage();
    await cold.bringToFront();
    const cdp = await context.newCDPSession(cold);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    const start = Date.now();
    await cold.goto(origin);
    await cold.getByRole("heading", { name: "Ludo", exact: true }).waitFor();
    await cold.getByRole("link", { name: "Play", exact: true }).waitFor();
    // React hydration has attached interactive controls by this point.
    await cold.waitForFunction(() =>
      document.querySelector(".royal-offline-status")?.textContent?.includes("Ready"),
    );
    offlineStartupMs.push(Date.now() - start);
    await cold.close();
  }
  await page.bringToFront();
  await page.waitForFunction(() => !document.hidden);
  await page.goto(origin + "/setup");
  await page.getByRole("button", { name: /^2 Players/ }).click();
  for (const color of ["Red", "Green"])
    await page.getByRole("button", { name: color, exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.waitForSelector(".royal-board");
  await page.evaluate(() => {
    Math.random = () => 0.99;
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: (buffer) => {
        buffer.fill(5);
        return buffer;
      },
    });
  });
  const monitorRoll = async () =>
    page.evaluate(() => {
      const dice = document.querySelector(".royal-dice:not(:disabled)");
      window.__feedback = undefined;
      let start;
      let clickStart;
      dice.addEventListener(
        "pointerdown",
        () => {
          start = performance.now();
        },
        { once: true },
      );
      dice.addEventListener(
        "click",
        () => {
          clickStart = performance.now();
        },
        { once: true, capture: true },
      );
      const observer = new MutationObserver(() => {
        if (dice.dataset.rolling === "true" && start !== undefined) {
          window.__feedback = performance.now() - start;
          window.__clickFeedback = performance.now() - clickStart;
          observer.disconnect();
        }
      });
      observer.observe(dice, { attributes: true });
    });
  await monitorRoll();
  await page.getByRole("button", { name: /Tap to roll/ }).click();
  await page.waitForFunction(() => window.__feedback !== undefined);
  const diceFeedbackMs = await page.evaluate(() => window.__feedback);
  const diceClickFeedbackMs = await page.evaluate(() => window.__clickFeedback);
  await page.waitForSelector('.royal-piece-hit[data-legal="true"]');
  await page.locator('.royal-piece-hit[data-legal="true"]').first().click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("ludo:save:v1")).tokens[0].state === "common",
  );
  await page.getByRole("button", { name: /Tap to roll/ }).click();
  await page.waitForSelector('.royal-piece-hit[data-legal="true"]');
  const frames = page.evaluate(
    () =>
      new Promise((resolve) => {
        const intervals = [];
        let previous;
        const start = performance.now();
        function frame(now) {
          if (previous !== undefined) intervals.push(now - previous);
          previous = now;
          if (now - start > 1600) resolve(intervals);
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }),
  );
  await page.evaluate(() => {
    const piece = document.querySelector('[data-token-id="red-0"]');
    const button = piece.querySelector("button");
    let start;
    button.addEventListener(
      "pointerdown",
      () => {
        start = performance.now();
      },
      { once: true },
    );
    const observer = new MutationObserver(() => {
      if (piece.dataset.moving === "true" && start !== undefined) {
        window.__selectionFeedback = performance.now() - start;
        observer.disconnect();
      }
    });
    observer.observe(piece, { attributes: true });
  });
  await page.locator('[data-token-id="red-0"] button').click();
  const frameIntervalsMs = await frames;
  const selectionFeedbackMs = await page.evaluate(() => window.__selectionFeedback);
  const orderedFrames = [...frameIntervalsMs].sort((a, b) => a - b);
  await mkdir(".artifacts", { recursive: true });
  const report = {
    label,
    profile: "Chromium, 360x800, DPR 2, 6x CPU; offline fresh pages in a persistent origin context",
    critical,
    criticalGzipBytes,
    offlineStartupMs,
    medianOfflineStartupMs: [...offlineStartupMs].sort((a, b) => a - b)[2],
    diceFeedbackMs,
    diceClickFeedbackMs,
    selectionFeedbackMs,
    medianFrameIntervalMs: orderedFrames[Math.floor(orderedFrames.length / 2)],
    p95FrameIntervalMs: orderedFrames[Math.floor(orderedFrames.length * 0.95)],
    framesOver34Ms: frameIntervalsMs.filter((duration) => duration > 34).length,
    measuredFrames: frameIntervalsMs.length,
  };
  await writeFile(`.artifacts/performance-${label}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
