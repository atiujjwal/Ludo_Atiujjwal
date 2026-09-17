import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const label = process.argv[2] ?? "current";
const trace = process.argv.includes("--trace");
const port = 4318;
const origin = `http://127.0.0.1:${port}`;
const percentile = (values, ratio) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * ratio) - 1)];
};
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
  if (trace) await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
  const page = await context.newPage();
  await page.bringToFront();
  await page.addInitScript(() => {
    window.__ludoLongTasks = [];
    try {
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) window.__ludoLongTasks.push(entry.duration);
      }).observe({ type: "longtask", buffered: true });
    } catch {
      /* unsupported browser */
    }
  });
  const session = await context.newCDPSession(page);
  await session.send("Performance.enable");
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
  const offlineHydrationMs = [];
  const offlineReadinessMs = [];
  for (let i = 0; i < 10; i++) {
    const cold = await context.newPage();
    await cold.bringToFront();
    const cdp = await context.newCDPSession(cold);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    const start = Date.now();
    await cold.goto(origin);
    await cold.getByRole("heading", { name: "Ludo", exact: true }).waitFor();
    await cold.getByRole("link", { name: "Play", exact: true }).waitFor();
    const hydrated = Date.now();
    // React hydration has attached interactive controls by this point.
    await cold.waitForFunction(() =>
      document.querySelector(".royal-offline-status")?.textContent?.includes("Ready"),
    );
    const readyAt = Date.now();
    offlineHydrationMs.push(hydrated - start);
    offlineReadinessMs.push(readyAt - hydrated);
    offlineStartupMs.push(readyAt - start);
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
  const runtimeMetrics = Object.fromEntries(
    (await session.send("Performance.getMetrics")).metrics
      .filter((metric) =>
        ["Nodes", "JSEventListeners", "JSHeapUsedSize", "TaskDuration", "LayoutCount"].includes(
          metric.name,
        ),
      )
      .map((metric) => [metric.name, metric.value]),
  );
  let captureProfile;
  if (label === "cats") {
    // Use an actual saved 2P game as the fixture, then trigger a real UI capture.
    await page.evaluate(() => {
      const fixture = JSON.parse(localStorage.getItem("ludo:save:v1"));
      for (const token of fixture.tokens)
        Object.assign(token, { state: "base", steps: 0, lap: 0, secondLapUsed: false });
      Object.assign(
        fixture.tokens.find((token) => token.color === "red"),
        { state: "common", steps: 0 },
      );
      Object.assign(
        fixture.tokens.find((token) => token.color === "green"),
        { state: "common", steps: 27 },
      );
      Object.assign(fixture.turn, {
        currentPlayerId: fixture.players.find((player) => player.color === "red").id,
        diceValue: null,
        consecutiveSixes: 0,
        owedExtraRoll: false,
      });
      Object.assign(fixture, {
        phase: "idle",
        pending: null,
        legalMoves: [],
        activeModal: "NONE",
        rewardMove: false,
        lastCapture: null,
        createdAt: Date.now(),
      });
      localStorage.setItem("ludo:save:v1", JSON.stringify(fixture));
    });
    await page.goto(origin + "/game");
    await page.evaluate(() =>
      Object.defineProperty(crypto, "getRandomValues", {
        configurable: true,
        value: (buffer) => {
          buffer.fill(0);
          return buffer;
        },
      }),
    );
    const uncachedResponses = [];
    const track = (response) => {
      if (/\/(assets|animation|audio)\//.test(response.url()) && !response.fromServiceWorker())
        uncachedResponses.push(response.url());
    };
    page.on("response", track);
    await page.getByRole("button", { name: /Tap to roll/ }).click();
    await page.waitForSelector('.royal-cat-yard[data-role="cutter"] img');
    const captureFrames = page.evaluate(
      () =>
        new Promise((resolve) => {
          const intervals = [];
          let previous;
          const start = performance.now();
          function frame(now) {
            if (previous !== undefined) intervals.push(now - previous);
            previous = now;
            if (now - start > 6300) resolve(intervals);
            else requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }),
    );
    // The earned roll and next move must remain interactive during the effects.
    await page.getByRole("button", { name: /Tap to roll/ }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("ludo:save:v1")).tokens.find(
          (token) => token.color === "red",
        ).steps === 2,
    );
    const intervals = await captureFrames;
    const ordered = [...intervals].sort((a, b) => a - b);
    captureProfile = {
      medianFrameIntervalMs: ordered[Math.floor(ordered.length / 2)],
      p95FrameIntervalMs: ordered[Math.floor(ordered.length * 0.95)],
      framesOver34Ms: intervals.filter((duration) => duration > 34).length,
      measuredFrames: intervals.length,
      moveCompletedWhileCatsVisible: true,
      uncachedGameplayAssetResponses: uncachedResponses,
    };
    page.off("response", track);
  }
  await mkdir(".artifacts", { recursive: true });
  const report = {
    label,
    profile: "Chromium, 360x800, DPR 2, 6x CPU; offline fresh pages in a persistent origin context",
    critical,
    criticalGzipBytes,
    offlineStartupMs,
    offlineHydrationMs,
    offlineReadinessMs,
    medianOfflineStartupMs: percentile(offlineStartupMs, 0.5),
    p95OfflineStartupMs: percentile(offlineStartupMs, 0.95),
    diceFeedbackMs,
    diceClickFeedbackMs,
    selectionFeedbackMs,
    medianFrameIntervalMs: orderedFrames[Math.floor(orderedFrames.length / 2)],
    p95FrameIntervalMs: orderedFrames[Math.floor(orderedFrames.length * 0.95)],
    framesOver34Ms: frameIntervalsMs.filter((duration) => duration > 34).length,
    measuredFrames: frameIntervalsMs.length,
    longTasksMs: await page.evaluate(() => window.__ludoLongTasks ?? []),
    domNodes: await page.evaluate(() => document.getElementsByTagName("*").length),
    usedHeapBytes: await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null),
    runtimeMetrics,
    ...(captureProfile ? { captureProfile } : {}),
  };
  await writeFile(`.artifacts/performance-${label}.json`, JSON.stringify(report, null, 2));
  if (trace) await context.tracing.stop({ path: `.artifacts/trace-${label}.zip` });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
