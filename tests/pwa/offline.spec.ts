import { chromium, expect, test, type Page } from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { createGame, DEFAULT_HOUSE_RULES } from "../../src/lib/ludo/engine";
import { COLOR_ORDER, START_OFFSET } from "../../src/lib/ludo/board";

test("closing the entire browser preserves cold offline new-game and resume support", async () => {
  await mkdir(".artifacts", { recursive: true });
  const profile = await mkdtemp(".artifacts/offline-profile-");
  const options = {
    headless: true,
    baseURL: "http://127.0.0.1:4319",
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
  };
  let installed = await chromium.launchPersistentContext(profile, options);
  try {
    const online = await installed.newPage();
    await prepared(online);
    await newGame(online);
    const save = await online.evaluate(() => localStorage.getItem("ludo:save:v1"));
    await installed.close();
    installed = await chromium.launchPersistentContext(profile, { ...options, offline: true });
    const cold = await installed.newPage();
    await cold.goto("/");
    await cold.getByRole("link", { name: "Continue your game" }).click();
    await expect(cold.locator(".royal-board")).toBeVisible();
    expect(
      JSON.parse((await cold.evaluate(() => localStorage.getItem("ludo:save:v1")))!).tokens,
    ).toEqual(JSON.parse(save!).tokens);
    await newGame(cold, "3 Players");
    await cold.reload();
    await expect(cold.locator(".royal-player-panel")).toHaveCount(3);
  } finally {
    await installed.close();
  }
});

test("capture feedback for every victim colour and victory animation work offline", async ({
  page,
  context,
}) => {
  await prepared(page);
  await context.setOffline(true);
  const sampleRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/audio\//.test(request.url())) sampleRequests.push(request.url());
  });
  for (const [index, victim] of COLOR_ORDER.entries()) {
    const cutter = COLOR_ORDER[(index + 1) % 4]!;
    const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
    state.turn.currentPlayerId = state.players.find((player) => player.color === cutter)!.id;
    Object.assign(
      state.tokens.find((token) => token.color === cutter)!,
      { state: "common", steps: 0 },
    );
    Object.assign(
      state.tokens.find((token) => token.color === victim)!,
      { state: "common", steps: (START_OFFSET[cutter] + 1 - START_OFFSET[victim] + 52) % 52 },
    );
    await page.evaluate(
      (state) => localStorage.setItem("ludo:save:v1", JSON.stringify(state)),
      state,
    );
    await page.goto("/game");
    await expect(
      page.getByRole("button", { name: `${cutter} piece 1, protected`, exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      Math.random = () => 0.01;
      Object.defineProperty(crypto, "getRandomValues", {
        configurable: true,
        value: (buffer: Uint8Array) => {
          buffer.fill(0);
          return buffer;
        },
      });
    });
    await page.getByRole("button", { name: /Tap to roll/ }).click();
    // Check the temporary overlay atomically: separate visibility/read calls can
    // straddle its expiry on a busy host and wait for an already removed image.
    await expect
      .poll(() =>
        page
          .locator(".royal-crying-teddy img")
          .evaluateAll((images) =>
            images.some(
              (img) =>
                (img as HTMLImageElement).complete &&
                (img as HTMLImageElement).naturalWidth > 0 &&
                img.getBoundingClientRect().width > 0,
            ),
          ),
      )
      .toBe(true);
    await page.waitForFunction(
      (color) =>
        JSON.parse(localStorage.getItem("ludo:save:v1")!).tokens.find(
          (token: { color: string }) => token.color === color,
        ).state === "base",
      victim,
    );
  }
  const won = createGame("2P", DEFAULT_HOUSE_RULES, {}, ["red", "green"]);
  for (const token of won.tokens.filter((token) => token.color === "red"))
    Object.assign(token, { state: "finished", steps: 56 });
  Object.assign(won.players[0]!, { finished: true, finishRank: 1 });
  won.phase = "over";
  won.activeModal = "GAME_OVER";
  await page.evaluate((won) => localStorage.setItem("ludo:save:v1", JSON.stringify(won)), won);
  await page.goto("/game");
  await expect(page.locator(".royal-happy-teddy img")).toBeVisible();
  await page.locator(".royal-happy-teddy img").evaluate((img: HTMLImageElement) => img.decode());
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".royal-happy-teddy img")
      .evaluate((img: HTMLImageElement) => img.currentSrc),
  ).toContain("happy_teddy-still.png");
  expect(sampleRequests).toEqual([]);
});

test("install action waits for verification and uses a fresh tap once ready", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "userAgent", { value: "Android Chrome" }),
  );
  await context.route("**/happy_teddy.gif", (route) => route.abort("failed"));
  await page.goto("/");
  await page.evaluate(() => {
    const prompt = Object.assign(new Event("beforeinstallprompt"), {
      prompt: () => {
        document.documentElement.dataset.prompted = "true";
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(prompt);
  });
  await page.getByRole("button", { name: "Install Ludo on this phone" }).click();
  await expect(page.getByRole("heading", { name: "Preparing your offline game" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.prompted)).toBeUndefined();
  await expect(page.getByRole("button", { name: "Retry" }).last()).toBeVisible();
  await context.unroute("**/happy_teddy.gif");
  await page.getByRole("button", { name: "Retry" }).last().click();
  await expect(page.getByRole("heading", { name: "Add Ludo to your Home Screen" })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Install now", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.prompted)).toBe("true");
});

async function prepared(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Ready to play offline", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}
async function newGame(page: Page, mode = "2 Players", houseRules = false) {
  await page.goto("/setup");
  await page.getByRole("button", { name: new RegExp(`^${mode}`) }).click();
  if (mode === "2 Players" || mode === "3 Players") {
    for (const color of mode === "3 Players" ? ["Red", "Green", "Blue"] : ["Red", "Green"])
      await page.getByRole("button", { name: color, exact: true }).click();
  }
  if (houseRules)
    for (const name of ["Exit on 1", "Second Lap", "Cut Reward", "Three 6s Variant"])
      await page.getByRole("switch", { name, exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(page.locator(".royal-board")).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem("ludo:save:v1") !== null);
}

test("verified shell supports unseen routes, new games and saved resume offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await prepared(page);
  expect(await page.evaluate(() => localStorage.getItem("ludo:save:v1"))).toBeNull();
  await context.setOffline(true);
  for (const [route, heading] of [
    ["/rules", "How to play"],
    ["/settings", "Settings"],
    ["/setup", "New game"],
  ]) {
    await page.goto(route!);
    await expect(page.getByRole("heading", { name: heading!, exact: true })).toBeVisible();
  }
  await newGame(page);
  const saved = await page.evaluate(() => localStorage.getItem("ludo:save:v1"));
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await reopened.getByRole("link", { name: "Continue your game" }).click();
  await expect(reopened.locator(".royal-board")).toBeVisible();
  expect(
    JSON.parse((await reopened.evaluate(() => localStorage.getItem("ludo:save:v1")))!).tokens,
  ).toEqual(JSON.parse(saved!).tokens);
  const roll = reopened.getByRole("button", { name: /Tap to roll/ });
  await roll.click();
  await expect(reopened.locator('.royal-dice[data-rolling="true"]')).toHaveCount(0, {
    timeout: 5000,
  });
  await expect(reopened.locator('.royal-dice[data-lit="true"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("all shipped images, animations, icons and chunks are cached including JPEG queries", async ({
  page,
  context,
}) => {
  await prepared(page);
  await context.setOffline(true);
  const result = await page.evaluate(async () => {
    const urls = [
      "/logo.jpeg?v=2",
      "/favicon.png",
      "/manifest.webmanifest",
      "/crying_teddy.gif",
      "/crying_teddy-still.png",
      "/happy_teddy.gif",
      "/happy_teddy-still.png",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable.png",
      "/icons/apple-touch-icon.png",
    ];
    return await Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url);
        return { url, ok: response.ok, bytes: (await response.arrayBuffer()).byteLength };
      }),
    );
  });
  expect(result.every((file) => file.ok && file.bytes > 0)).toBe(true);
});

test("settings, theme, house rules and royal IDs survive new games and reset", async ({
  page,
  context,
}) => {
  await prepared(page);
  await context.setOffline(true);
  await page.goto("/settings");
  await page.getByRole("switch", { name: "Sound effects" }).click();
  await page.getByRole("switch", { name: "Vibration" }).click();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await newGame(page, "2 Players", true);
  await page.reload();
  const settings = await page.evaluate(() => ({
    game: JSON.parse(localStorage.getItem("ludo:save:v1")!),
    prefs: JSON.parse(localStorage.getItem("ludo:preferences:v1")!),
    theme: document.documentElement.dataset.theme,
  }));
  expect(settings.theme).toBe("light");
  expect(Object.values(settings.game.gameConfig.houseRules).every((value) => value === true)).toBe(
    true,
  );
  expect(settings.game.settings).toMatchObject({
    soundOn: false,
    hapticsOn: false,
    showMoveSuggestions: false,
  });
  expect(settings.prefs).toMatchObject({
    boardTheme: "royal",
    tokenSkin: "royal",
    diceSkin: "royal",
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Reset saved game" }).click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => localStorage.getItem("ludo:save:v1"))).toBeNull();
  await page.reload();
  await expect(page.getByRole("link", { name: "Continue your game" })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("ludo:preferences:v1"))).not.toBeNull();
});

test("missing required cached files revoke readiness without corrupting saves", async ({
  page,
}) => {
  await prepared(page);
  await newGame(page);
  const saved = await page.evaluate(() => localStorage.getItem("ludo:save:v1"));
  const reply = await page.evaluate(async () => {
    const key = (await caches.keys()).find((key) => key.startsWith("ludo-shell-"))!;
    await (await caches.open(key)).delete("/logo.jpeg");
    return await new Promise<{ ready: boolean }>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        channel.port1.close();
        resolve(event.data);
      };
      navigator.serviceWorker.controller!.postMessage({ type: "CHECK_OFFLINE" }, [channel.port2]);
    });
  });
  expect(reply.ready).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("ludo:save:v1"))).toBe(saved);
});

test("worker refuses activation while any game is open and allows it after leaving", async ({
  page,
  context,
}) => {
  await prepared(page);
  const game = await context.newPage();
  await game.goto("/game");
  // Give it an actual game so the route remains /game.
  await newGame(game);
  await expect(game).toHaveURL(/\/game$/);
  const deferred = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const listener = (event: MessageEvent) => {
          if (event.data?.type === "UPDATE_DEFERRED") {
            navigator.serviceWorker.removeEventListener("message", listener);
            resolve(event.data.type);
          }
        };
        navigator.serviceWorker.addEventListener("message", listener);
        navigator.serviceWorker.controller!.postMessage({ type: "ACTIVATE_UPDATE" });
      }),
  );
  expect(deferred).toBe("UPDATE_DEFERRED");
  await game.close();
  expect(await page.evaluate(() => localStorage.getItem("ludo:save:v1"))).not.toBeNull();
});

test("failed update keeps the old cache and existing game; a complete update waits for safe refresh", async ({
  page,
  context,
}) => {
  await prepared(page);
  await newGame(page);
  const saved = await page.evaluate(() => localStorage.getItem("ludo:save:v1"));
  const original = await readFile(".output/public/sw.js", "utf8");
  const writeWorker = async (body: string) =>
    Promise.all([
      writeFile(".output/public/sw.js", body),
      writeFile(".output/public/sw.js.br", brotliCompressSync(body)),
      writeFile(".output/public/sw.js.gz", gzipSync(body)),
    ]);
  try {
    const bad = original
      .replace(/const VERSION = "[^"]+";/, 'const VERSION = "failed-update";')
      .replace("await cache.put(url, response);", 'throw new Error("Simulated quota failure");');
    await writeWorker(bad);
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration("/"))!.update();
    });
    await page.waitForFunction(
      async () => !(await navigator.serviceWorker.getRegistration("/"))?.installing,
    );
    const failed = await page.evaluate(async () => ({
      keys: await caches.keys(),
      save: localStorage.getItem("ludo:save:v1"),
      waiting: !!(await navigator.serviceWorker.getRegistration("/"))?.waiting,
    }));
    expect(failed.keys).not.toContain("ludo-shell-failed-update");
    expect(failed.waiting).toBe(false);
    expect(failed.save).toBe(saved);
    const update = original.replace(
      /const VERSION = "[^"]+";/,
      'const VERSION = "successful-update";',
    );
    await writeWorker(update);
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration("/"))!.update();
    });
    await page.waitForFunction(
      async () => !!(await navigator.serviceWorker.getRegistration("/"))?.waiting,
    );
    // No reload or altered progress while the game is open.
    await expect(page).toHaveURL(/\/game$/);
    expect(await page.evaluate(() => localStorage.getItem("ludo:save:v1"))).toBe(saved);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Refresh to update" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh to update" }).click();
    await expect(page.getByText("Ready to play offline", { exact: true })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("link", { name: "Continue your game" }).click();
    await expect(page.locator(".royal-board")).toBeVisible();
    expect(
      JSON.parse((await page.evaluate(() => localStorage.getItem("ludo:save:v1")))!).tokens,
    ).toEqual(JSON.parse(saved!).tokens);
  } finally {
    await writeWorker(original);
  }
});

test("interrupted first preparation remains playable online and retry completes it", async ({
  page,
  context,
}) => {
  await context.route("**/happy_teddy.gif", (route) => route.abort("failed"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 30000 });
  await newGame(page);
  await context.unroute("**/happy_teddy.gif");
  await page.goto("/");
  const retry = page.getByRole("button", { name: "Retry" });
  if (await retry.count()) await retry.click();
  await expect(page.getByText("Ready to play offline", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await context.setOffline(true);
  await page.goto("/game");
  await expect(page.locator(".royal-board")).toBeVisible();
});

test("mobile layouts keep setup names reachable and board bounded in both themes", async ({
  page,
}, testInfo) => {
  await prepared(page);
  for (const width of [320, 360, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 800 });
    await newGame(page, "4 Players");
    for (const theme of ["dark", "light"]) {
      if (theme === "light")
        await page.getByRole("button", { name: "Switch to light theme" }).click();
      else if (await page.getByRole("button", { name: "Switch to dark theme" }).count())
        await page.getByRole("button", { name: "Switch to dark theme" }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: testInfo.outputPath(`${width}-${theme}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 360, height: 480 });
  await newGame(page, "3 Players");
  await page.goto("/setup");
  await page.getByRole("button", { name: /^3 Players/ }).click();
  for (const color of ["Red", "Green", "Blue"])
    await page.getByRole("button", { name: color, exact: true }).click();
  await page.getByRole("textbox", { name: "Player 3 (Blue) name", exact: true }).fill("Third");
  await expect(
    page.getByRole("textbox", { name: "Player 3 (Blue) name", exact: true }),
  ).toHaveValue("Third");
});
