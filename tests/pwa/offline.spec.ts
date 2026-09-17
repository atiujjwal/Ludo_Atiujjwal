import { chromium, expect, test, type Page } from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { createGame, DEFAULT_HOUSE_RULES, updateStandings } from "../../src/lib/ludo/engine";
import type { Color, Mode } from "../../src/lib/ludo/types";
import { COLOR_ORDER, START_OFFSET } from "../../src/lib/ludo/board";
import { CAT_IDS, catUrl } from "../../src/lib/ludo/cat-effects";

const publicOutput =
  process.env["LUDO_TEST_TARGET"] === "vercel" ? ".vercel/output/static" : ".output/public";

test.use({ launchOptions: { args: ["--autoplay-policy=user-gesture-required"] } });

async function expectFullHomeFeedback(page: Page, color: Color) {
  const picture = page.locator(`.royal-cat-yard[data-color="${color}"] picture`);
  const bounds = await picture.evaluate((picture) => {
    const color = picture.closest<HTMLElement>("[data-color]")!.dataset.color;
    const courtyard = document.querySelector(
      `.royal-zone[data-color="${color}"] .royal-courtyard`,
    )!;
    const media = picture.getBoundingClientRect();
    const frame = courtyard.getBoundingClientRect();
    const frameStyle = getComputedStyle(courtyard);
    const left = parseFloat(frameStyle.borderLeftWidth);
    const top = parseFloat(frameStyle.borderTopWidth);
    const right = parseFloat(frameStyle.borderRightWidth);
    const bottom = parseFloat(frameStyle.borderBottomWidth);
    const style = getComputedStyle(picture);
    const image = picture.querySelector("img")!;
    const imageBounds = image.getBoundingClientRect();
    return {
      difference: Math.max(
        Math.abs(media.x - (frame.x + left)),
        Math.abs(media.y - (frame.y + top)),
        Math.abs(media.width - (frame.width - left - right)),
        Math.abs(media.height - (frame.height - top - bottom)),
        Math.abs(imageBounds.width - media.width),
        Math.abs(imageBounds.height - media.height),
      ),
      fit: getComputedStyle(image).objectFit,
      position: getComputedStyle(image).objectPosition,
      pointerEvents: style.pointerEvents,
      border: style.borderTopWidth,
      padding: style.paddingTop,
      shadow: style.boxShadow,
      transform: style.transform,
      media: media.toJSON(),
      frame: frame.toJSON(),
      image: imageBounds.toJSON(),
      inset: style.inset,
      frameBorder: [left, top, right, bottom],
    };
  });
  expect(bounds.difference, JSON.stringify(bounds)).toBeLessThan(1);
  expect(bounds.media.width).toBeGreaterThan(0);
  expect(bounds.media.height).toBeGreaterThan(0);
  expect(bounds.fit).toBe("cover");
  expect(bounds.position).toBe("50% 50%");
  expect(bounds.pointerEvents).toBe("none");
  expect(bounds.border).toBe("0px");
  expect(bounds.padding).toBe("0px");
  expect(bounds.shadow).toBe("none");
  expect(bounds.transform).toBe("none");
}

test.describe("mobile audio recovery", () => {
  test("first tap, unmute, background recovery and offline reopen produce real Web Audio output", async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(crypto, "getRandomValues", {
        configurable: true,
        value: (buffer: Uint8Array) => {
          buffer.fill(0);
          return buffer;
        },
      });
      const probe = { contexts: [] as AudioContext[], peak: 0 };
      Object.defineProperty(window, "__ludoAudioProbe", { value: probe });
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        constructor(options?: AudioContextOptions) {
          super(options);
          probe.contexts.push(this);
          const analyser = this.createAnalyser();
          // Retain a longer waveform window so a brief UI cue is not missed by
          // main-thread polling on a busy/throttled test host.
          analyser.fftSize = 2048;
          // Pull the analyser branch continuously without adding speaker output.
          const silentOutput = this.createGain();
          silentOutput.gain.value = 0;
          analyser.connect(silentOutput).connect(this.destination);
          const createCompressor = this.createDynamicsCompressor.bind(this);
          this.createDynamicsCompressor = () => {
            const compressor = createCompressor();
            compressor.connect(analyser);
            return compressor;
          };
          const data = new Float32Array(analyser.fftSize);
          window.setInterval(() => {
            analyser.getFloatTimeDomainData(data);
            probe.peak = Math.max(probe.peak, ...data.map(Math.abs));
          }, 10);
        }
      };
    });
    const output = () =>
      page.evaluate(() => {
        const probe = (
          window as unknown as { __ludoAudioProbe: { contexts: AudioContext[]; peak: number } }
        ).__ludoAudioProbe;
        return { peak: probe.peak, states: probe.contexts.map((context) => context.state) };
      });
    const resetPeak = () =>
      page.evaluate(() => {
        (window as unknown as { __ludoAudioProbe: { peak: number } }).__ludoAudioProbe.peak = 0;
      });
    await page.goto("/");
    const state = createGame("2P", DEFAULT_HOUSE_RULES, {});
    Object.assign(
      state.tokens.find((token) => token.color === state.players[0]!.color)!,
      { state: "common", steps: 0 },
    );
    await page.evaluate(
      (state) => localStorage.setItem("ludo:save:v1", JSON.stringify(state)),
      state,
    );
    await page.goto("/game");
    expect((await output()).states).toHaveLength(0);
    await page.getByRole("button", { name: /Tap to roll/ }).click();
    await expect.poll(async () => (await output()).peak).toBeGreaterThan(0.15);
    expect((await output()).peak).toBeLessThan(1);
    console.log("Mobile audio output peak (post-compressor):", (await output()).peak);
    expect((await output()).states).toEqual(["running"]);
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "Mute sound", exact: true }).click();
    await page.waitForTimeout(100);
    await resetPeak();
    await page.getByRole("button", { name: /Tap to roll/ }).click();
    await page.waitForTimeout(1000);
    expect((await output()).peak).toBeLessThan(0.001);
    await page.evaluate(async () => {
      const probe = (window as unknown as { __ludoAudioProbe: { contexts: AudioContext[] } })
        .__ludoAudioProbe;
      await probe.contexts[0]!.suspend();
    });
    await page.getByRole("button", { name: "Unmute sound", exact: true }).click();
    await expect.poll(async () => (await output()).peak).toBeGreaterThan(0.001);
    expect((await output()).states).toEqual(["running"]);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(async () => (await output()).states).toEqual(["suspended"]);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect((await output()).states).toEqual(["suspended"]);
    await resetPeak();
    await page.getByRole("button", { name: /Tap to roll/ }).click();
    await expect.poll(async () => (await output()).peak).toBeGreaterThan(0.001);
    expect((await output()).states).toEqual(["running"]);
    await prepared(page);
    await context.setOffline(true);
    await page.goto("/game");
    const samples: string[] = [];
    page.on("request", (request) => {
      if (/\/audio\//.test(request.url())) samples.push(request.url());
    });
    await page.getByRole("button", { name: /Tap to roll/ }).click();
    await expect.poll(async () => (await output()).peak).toBeGreaterThan(0.001);
    expect(samples).toEqual([]);
  });
});

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

test("capture sequences for every colour and ranked results work offline", async ({
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
    await page.emulateMedia({ reducedMotion: index === 0 ? "reduce" : "no-preference" });
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
          .locator(`.royal-cat-yard[data-color="${victim}"][data-stage="0"] img`)
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
    await expect(
      page.locator(`.royal-cat-yard[data-color="${cutter}"] [data-cat="bleh-cat"]`),
    ).toBeVisible();
    for (const color of [cutter, victim]) await expectFullHomeFeedback(page, color);
    if (index === 0) {
      expect(
        await page
          .locator(`.royal-cat-yard[data-color="${victim}"] img`)
          .evaluate((img: HTMLImageElement) => img.currentSrc),
      ).toContain("banana-cat-crying-still.png");
      await page.screenshot({ path: "test-results/cat-capture-houses.png" });
      // Full-square artwork must not intercept a legal release from underneath.
      await page.evaluate(() =>
        Object.defineProperty(crypto, "getRandomValues", {
          configurable: true,
          value: (buffer: Uint8Array) => {
            buffer.fill(5);
            return buffer;
          },
        }),
      );
      await page.getByRole("button", { name: /Tap to roll/ }).click();
      await page.getByRole("button", { name: new RegExp(`^${cutter} piece 2.*can move$`) }).click();
      await expect
        .poll(() =>
          page.evaluate((color) => {
            const saved = JSON.parse(localStorage.getItem("ludo:save:v1")!);
            return saved.tokens.filter((token: { color: string }) => token.color === color)[1]
              .state;
          }, cutter),
        )
        .toBe("common");
    }
    await expect(
      page.locator(`.royal-cat-yard[data-color="${victim}"] [data-cat="crying-crying-cat"]`),
    ).toBeVisible();
    await expect(
      page.locator(`.royal-cat-yard[data-color="${cutter}"] [data-cat="cat-orange-cat"]`),
    ).toBeVisible();
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
  Object.assign(won.players[1]!, { finished: true, finishRank: 2 });
  won.phase = "over";
  won.activeModal = "GAME_OVER";
  await page.evaluate((won) => localStorage.setItem("ludo:save:v1", JSON.stringify(won)), won);
  await page.goto("/game");
  await expect(
    page.locator('.royal-cat-yard[data-color="red"] [data-cat="babsb-cat"]'),
  ).toBeVisible();
  await expect(
    page.locator('.royal-cat-yard[data-color="green"] [data-cat="crying-crying-cat"]'),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator('.royal-cat-yard[data-color="red"] .royal-cat-media img')
      .evaluate((img: HTMLImageElement) => img.currentSrc),
  ).toContain("babsb-cat-still.png");
  await expect(
    page.locator('.royal-player-panel [data-cat], [role="dialog"] [data-cat]'),
  ).toHaveCount(0);
  expect(sampleRequests).toEqual([]);
});

test("non-final home arrivals show weird-cute only in the correct house offline", async ({
  page,
  context,
}) => {
  await prepared(page);
  await context.setOffline(true);
  for (const [index, color] of COLOR_ORDER.entries()) {
    const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
    const count = index % 3;
    const own = state.tokens.filter((token) => token.color === color);
    for (const token of own.slice(0, count)) Object.assign(token, { state: "finished", steps: 56 });
    Object.assign(own[count]!, { state: "home_stretch", steps: 55 });
    if (color === "blue") {
      Object.assign(own[1]!, { state: "common", steps: 0 });
      Object.assign(
        state.tokens.find((token) => token.color === "red")!,
        {
          state: "common",
          steps: (START_OFFSET.blue + 1 - START_OFFSET.red + 52) % 52,
        },
      );
    }
    state.turn.currentPlayerId = state.players.find((player) => player.color === color)!.id;
    await page.evaluate(
      (state) => localStorage.setItem("ludo:save:v1", JSON.stringify(state)),
      state,
    );
    await page.goto("/game");
    await page.emulateMedia({ reducedMotion: index === 0 ? "reduce" : "no-preference" });
    await expect(page.locator('[data-cat="weird-cute"]')).toHaveCount(0);
    await page.evaluate(() =>
      Object.defineProperty(crypto, "getRandomValues", {
        configurable: true,
        value: (buffer: Uint8Array) => {
          buffer.fill(0);
          return buffer;
        },
      }),
    );
    await page.getByRole("button", { name: /Tap to roll/ }).click();
    if (color === "blue")
      await page.getByRole("button", { name: /^blue piece 1.*can move$/ }).click();
    const effect = page.locator(
      `.royal-cat-yard[data-color="${color}"][data-role="home"] [data-cat="weird-cute"]`,
    );
    await expect(effect).toBeVisible();
    // Measure before any sequential image/screenshot checks can exhaust its
    // three-second window. Persistent ranks cover the full size/theme matrix.
    await expectFullHomeFeedback(page, color);
    await expect
      .poll(() =>
        effect
          .locator("img")
          .evaluateAll((images) =>
            images.some(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    expect(
      await effect.locator("img").evaluate((image: HTMLImageElement) => image.currentSrc),
    ).toContain(index === 0 ? "weird-cute-still.png" : "weird-cute.webp");
    await expect(page.getByRole("button", { name: /Tap to roll/ })).toBeEnabled();
    await expect(
      page.locator('.royal-player-panel [data-cat], [role="dialog"] [data-cat]'),
    ).toHaveCount(0);
    if (index === 1) await page.screenshot({ path: "test-results/non-final-home.png" });
    if (color === "blue") {
      // An earned roll can cut immediately: the newer event replaces the home cat.
      await page.getByRole("button", { name: /Tap to roll/ }).click();
      await expect(
        page.locator('.royal-cat-yard[data-color="blue"] [data-cat="bleh-cat"]'),
      ).toBeVisible();
      await expect(
        page.locator('.royal-cat-yard[data-color="red"] [data-cat="banana-cat-crying"]'),
      ).toBeVisible();
    }
    await expect(effect).toHaveCount(0, { timeout: 8000 });
    await page.reload();
    await expect(page.locator('[data-cat="weird-cute"]')).toHaveCount(0);
  }
});

for (const mode of ["2P", "3P", "4P"] as Mode[]) {
  test(`${mode} loops rank cats and delays only final results for six seconds offline`, async ({
    page,
    context,
  }) => {
    await prepared(page);
    await context.setOffline(true);
    const state = createGame(mode, DEFAULT_HOUSE_RULES, {});
    const color = state.players[0]!.color;
    const own = state.tokens.filter((token) => token.color === color);
    for (const token of own) Object.assign(token, { state: "finished", steps: 56 });
    Object.assign(own.at(-1)!, { state: "home_stretch", steps: 55 });
    await page.evaluate(
      (state) => localStorage.setItem("ludo:save:v1", JSON.stringify(state)),
      state,
    );
    await page.goto("/game");
    await page.evaluate(() =>
      Object.defineProperty(crypto, "getRandomValues", {
        configurable: true,
        value: (buffer: Uint8Array) => {
          buffer.fill(0);
          return buffer;
        },
      }),
    );
    await page.getByRole("button", { name: /Tap to roll/ }).click();
    const card = page.locator(`.royal-player-panel[data-player-color="${color}"]`);
    const houseCat = page.locator(
      `.royal-cat-yard[data-color="${color}"][data-role="rank"] [data-cat="babsb-cat"]`,
    );
    await expect(houseCat).toBeVisible();
    await expect(page.locator('[data-cat="weird-cute"]')).toHaveCount(0);
    await expect(card.getByText("Finished #1", { exact: true })).toBeVisible();
    await expect(card.locator("[data-cat]")).toHaveCount(0);
    await expect
      .poll(() =>
        houseCat
          .locator("img")
          .evaluateAll((images) =>
            images.some(
              (img) =>
                (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    let finalImagesLoadedAt = 0;
    if (mode !== "2P") {
      await expect(page.getByRole("button", { name: /Tap to roll/ })).toBeEnabled();
      expect(
        await page.evaluate(() => JSON.parse(localStorage.getItem("ludo:save:v1")!).phase),
      ).toBe("idle");
      await page.screenshot({ path: `test-results/cat-${mode}-live.png` });
    } else {
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator('.royal-cat-yard[data-role="rank"]')).toHaveCount(2);
      await expect
        .poll(() =>
          page
            .locator('.royal-cat-yard[data-role="rank"] img')
            .evaluateAll(
              (images) =>
                images.length === 2 &&
                images.every((image) => image.complete && image.naturalWidth > 0),
            ),
        )
        .toBe(true);
      finalImagesLoadedAt = Date.now();
    }
    if (mode === "2P") {
      await page.waitForTimeout(Math.max(0, 4500 - (Date.now() - finalImagesLoadedAt)));
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 250 });
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 });
      await expect(houseCat).toHaveCount(1);
    } else {
      await page.waitForTimeout(6500);
      await expect(houseCat).toBeVisible();
      await expect(page.getByRole("button", { name: /Tap to roll/ })).toBeEnabled();
    }
    await expect(page.locator('[role="dialog"] [data-cat]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".royal-rank-cat-row")).toHaveCount(0);
    await expect(page.locator('.royal-cat-yard[data-role="rank"]')).toHaveCount(
      mode === "2P" ? 2 : 1,
    );
    if (mode === "2P") {
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: /Play again/ }).click();
      await expect(page.locator('.royal-cat-yard[data-role="rank"]')).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });
}

test("final four-player cats restart together and hidden time does not open results", async ({
  page,
  context,
}) => {
  await prepared(page);
  await context.setOffline(true);
  const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
  for (const player of state.players.slice(0, 2)) {
    for (const token of state.tokens.filter((token) => token.color === player.color))
      Object.assign(token, { state: "finished", steps: 56 });
    updateStandings(state);
  }
  const third = state.players[2]!;
  const own = state.tokens.filter((token) => token.color === third.color);
  for (const token of own) Object.assign(token, { state: "finished", steps: 56 });
  Object.assign(own[3]!, { state: "home_stretch", steps: 55 });
  state.turn.currentPlayerId = third.id;
  await page.evaluate(
    (state) => localStorage.setItem("ludo:save:v1", JSON.stringify(state)),
    state,
  );
  await page.goto("/game");
  const first = page.locator('.royal-cat-yard [data-cat="babsb-cat"] img');
  await expect(first).toBeVisible();
  const oldSource = await first.getAttribute("src");
  await page.evaluate(() =>
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: (buffer: Uint8Array) => {
        buffer.fill(0);
        return buffer;
      },
    }),
  );
  await page.getByRole("button", { name: /Tap to roll/ }).click();
  const houses = page.locator('.royal-cat-yard[data-role="rank"]');
  await expect(houses).toHaveCount(4);
  expect(await first.getAttribute("src")).not.toBe(oldSource);
  await expect
    .poll(() =>
      houses
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => first.evaluate((image: HTMLImageElement) => image.currentSrc))
    .toContain("babsb-cat-still.png");
  await page.waitForTimeout(6500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(2000);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(houses).toHaveCount(4);
  await expect
    .poll(() => first.evaluate((image: HTMLImageElement) => image.currentSrc))
    .toContain("babsb-cat.gif");
  await page.screenshot({ path: "test-results/cat-final-looping.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => first.evaluate((image: HTMLImageElement) => image.currentSrc))
    .toContain("babsb-cat-still.png");
});

for (const team of ["A", "B"] as const) {
  test(`team ${team} gets cats in both winning houses and both losing houses offline`, async ({
    page,
    context,
  }) => {
    await prepared(page);
    await context.setOffline(true);
    const state = createGame("2V2", DEFAULT_HOUSE_RULES, {});
    const winners = state.players.filter((player) => player.teamId === team);
    for (const player of winners)
      for (const token of state.tokens.filter((token) => token.color === player.color))
        Object.assign(token, { state: "finished", steps: 56 });
    const finisher = state.tokens.find((token) => token.color === winners[1]!.color)!;
    Object.assign(finisher, { state: "home_stretch", steps: 55 });
    updateStandings(state);
    state.turn.currentPlayerId = winners[1]!.id;
    await page.evaluate(
      (state) => localStorage.setItem("ludo:save:v1", JSON.stringify(state)),
      state,
    );
    await page.goto("/game");
    await expect(page.locator(".royal-rank-cat-row")).toHaveCount(0);
    await page.evaluate(() =>
      Object.defineProperty(crypto, "getRandomValues", {
        configurable: true,
        value: (buffer: Uint8Array) => {
          buffer.fill(0);
          return buffer;
        },
      }),
    );
    await page.getByRole("button", { name: /Tap to roll/ }).click();
    await expect(
      page.locator('.royal-cat-yard[data-role="rank"] [data-cat="babsb-cat"]'),
    ).toHaveCount(2);
    await expect(
      page.locator('.royal-cat-yard[data-role="rank"] [data-cat="crying-crying-cat"]'),
    ).toHaveCount(2);
    await expect(page.locator('.royal-cat-yard[data-role="rank"]')).toHaveCount(4);
    await page.screenshot({ path: `test-results/cat-team-${team}-results.png` });
    await page.waitForTimeout(5000);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator('.royal-cat-yard[data-role="rank"]')).toHaveCount(4);
    await expect(
      page.locator('.royal-player-panel [data-cat], [role="dialog"] [data-cat]'),
    ).toHaveCount(0);
  });
}

test("four-player resumed standings restore looping rank cats and immediate results only in houses", async ({
  page,
  context,
}) => {
  await prepared(page);
  await context.setOffline(true);
  const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
  for (const player of state.players.slice(0, -1)) {
    for (const token of state.tokens.filter((token) => token.color === player.color))
      Object.assign(token, { state: "finished", steps: 56 });
    updateStandings(state);
  }
  await page.evaluate(
    (state) => localStorage.setItem("ludo:save:v1", JSON.stringify(state)),
    state,
  );
  await page.goto("/game");
  await expect(page.locator('.royal-cat-yard[data-role="rank"]')).toHaveCount(4);
  for (const [index, cat] of [
    "babsb-cat",
    "dancing-cat-ai",
    "happy-cat",
    "crying-crying-cat",
  ].entries()) {
    const row = page.locator(`.royal-cat-yard[data-color="${state.players[index]!.color}"]`);
    await expect(row.locator(`[data-cat="${cat}"]`)).toBeVisible();
    expect(await row.locator("img").evaluate((img: HTMLImageElement) => img.currentSrc)).toContain(
      `${cat}.gif`,
    );
  }
  await expect(
    page.locator('.royal-player-panel [data-cat], [role="dialog"] [data-cat]'),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: "test-results/cat-four-ranks.png" });
});

test("install action waits for verification and uses a fresh tap once ready", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "userAgent", { value: "Android Chrome" }),
  );
  await context.route("**/animation/babsb-cat.gif", (route) => route.abort("failed"));
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
  await context.unroute("**/animation/babsb-cat.gif");
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
  const result = await page.evaluate(
    async (cats) => {
      const urls = [
        "/logo.jpeg?v=2",
        "/favicon.png",
        "/manifest.webmanifest",
        ...cats,
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
    },
    CAT_IDS.flatMap((cat) => [catUrl(cat) + "?effect=test", catUrl(cat, true)]),
  );
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
  const original = await readFile(`${publicOutput}/sw.js`, "utf8");
  const writeWorker = async (body: string) =>
    Promise.all([
      writeFile(`${publicOutput}/sw.js`, body),
      writeFile(`${publicOutput}/sw.js.br`, brotliCompressSync(body)),
      writeFile(`${publicOutput}/sw.js.gz`, gzipSync(body)),
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
  await context.route("**/animation/babsb-cat.gif", (route) => route.abort("failed"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 30000 });
  await newGame(page);
  await context.unroute("**/animation/babsb-cat.gif");
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

for (const width of [320, 360, 430, 1280]) {
  test(`compact cut bonus stays outside the board at ${width}px in both themes offline`, async ({
    page,
    context,
  }, testInfo) => {
    await prepared(page);
    await context.setOffline(true);
    await page.setViewportSize({ width, height: width === 1280 ? 960 : 800 });
    for (const theme of ["dark", "light"]) {
      for (const choice of ["Bring out a token", "Jump a token 6 spaces", "Roll again"]) {
        const state = createGame(
          width === 360 ? "2P" : "4P",
          { ...DEFAULT_HOUSE_RULES, cutReward: true },
          {},
        );
        Object.assign(state.tokens[0]!, { state: "common", steps: 1 });
        state.phase = "modal";
        state.activeModal = "CUT_REWARD";
        state.turn.owedExtraRoll = true;
        state.modalContext = { cutterColor: state.players[0]!.color };
        await page.evaluate(
          ({ state, theme }) => {
            localStorage.setItem("ludo:save:v1", JSON.stringify(state));
            localStorage.setItem("ludo:app-theme:v1", theme);
          },
          { state, theme },
        );
        await page.goto("/game");
        const panel = page.getByRole("region", { name: "Nice cut! Pick your bonus" });
        await expect(panel).toBeVisible();
        await expect(page.getByRole("button", { name: "Leave game", exact: true })).toBeDisabled();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        const geometry = await panel.evaluate((panel) => {
          const board = document.querySelector(".royal-board")!.getBoundingClientRect();
          const box = panel.getBoundingClientRect();
          return {
            boardBottom: board.bottom,
            panelTop: box.top,
            height: box.height,
            widths: Array.from(
              panel.querySelectorAll("button"),
              (button) => button.getBoundingClientRect().width,
            ),
            heights: Array.from(
              panel.querySelectorAll("button"),
              (button) => button.getBoundingClientRect().height,
            ),
            boardWidth: board.width,
            boardHeight: board.height,
          };
        });
        expect(geometry.panelTop).toBeGreaterThanOrEqual(geometry.boardBottom);
        expect(geometry.height).toBeLessThan(150);
        for (const size of geometry.widths) expect(size).toBeGreaterThanOrEqual(43.9);
        for (const size of geometry.heights) expect(size).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const info = panel.getByRole("button", { name: `Info: ${choice}`, exact: true });
        await info.click();
        await expect(info).toHaveAttribute("aria-expanded", "true");
        await expect(panel.locator(".royal-bonus-details")).toBeVisible();
        const unchanged = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("ludo:save:v1")!),
        );
        expect(unchanged.tokens).toEqual(state.tokens);
        expect(unchanged.turn).toEqual(state.turn);
        expect(unchanged.activeModal).toBe("CUT_REWARD");
        const boardSize = await page.locator(".royal-board").boundingBox();
        expect(boardSize!.width).toBe(geometry.boardWidth);
        expect(boardSize!.height).toBe(geometry.boardHeight);
        await info.click();
        await expect(info).toHaveAttribute("aria-expanded", "false");
        await panel.scrollIntoViewIfNeeded();
        const clearTargets = await panel.evaluate((panel) =>
          Array.from(panel.querySelectorAll("button"), (button) => {
            const box = button.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.bottom - 2);
            return hit !== null && button.contains(hit);
          }),
        );
        expect(clearTargets.every(Boolean)).toBe(true);
        if (choice === "Roll again")
          await page.screenshot({
            path: testInfo.outputPath(`${width}-${theme}-cut-bonus.png`),
            fullPage: true,
          });
        await panel.getByRole("button", { name: choice, exact: true }).click();
        await expect(panel).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Leave game", exact: true })).toBeEnabled();
        await expect(page.getByRole("button", { name: /Tap to roll/ })).toBeEnabled();
        const next = await page.evaluate(() => JSON.parse(localStorage.getItem("ludo:save:v1")!));
        expect(next.turn.currentPlayerId).toBe(state.turn.currentPlayerId);
        expect(next.turn.consecutiveSixes).toBe(state.turn.consecutiveSixes);
        if (choice === "Bring out a token") expect(next.tokens[1].state).toBe("common");
        if (choice === "Jump a token 6 spaces") expect(next.tokens[0].steps).toBe(7);
        if (choice === "Roll again") expect(next.tokens).toEqual(state.tokens);
      }
    }
  });
}

test("a live cut opens an outside-board panel and disabled bonuses still explain themselves", async ({
  page,
  context,
}) => {
  await prepared(page);
  await context.setOffline(true);
  const state = createGame("4P", { ...DEFAULT_HOUSE_RULES, cutReward: true }, {});
  Object.assign(state.tokens[0]!, { state: "common", steps: 0 });
  Object.assign(
    state.tokens.find((token) => token.color === "green")!,
    { state: "common", steps: (START_OFFSET.red + 1 - START_OFFSET.green + 52) % 52 },
  );
  await page.evaluate(
    (state) => localStorage.setItem("ludo:save:v1", JSON.stringify(state)),
    state,
  );
  await page.goto("/game");
  await page.evaluate(() =>
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: (buffer: Uint8Array) => {
        buffer.fill(0);
        return buffer;
      },
    }),
  );
  await page.getByRole("button", { name: /Tap to roll/ }).click();
  const panel = page.getByRole("region", { name: "Nice cut! Pick your bonus" });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('.royal-cat-yard[data-role="victim"]')).toBeVisible();
  await expect(panel.getByRole("button", { name: "Bring out a token", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  const firstInfo = panel.getByRole("button", { name: "Info: Bring out a token", exact: true });
  await expect(firstInfo).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(firstInfo).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(firstInfo).toHaveAttribute("aria-expanded", "false");
  await panel.getByRole("button", { name: "Roll again", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(panel).toHaveCount(0);
  for (const missing of ["release", "move"]) {
    const state = createGame("4P", { ...DEFAULT_HOUSE_RULES, cutReward: true }, {});
    if (missing === "release")
      for (const [index, token] of state.tokens.filter((token) => token.color === "red").entries())
        Object.assign(token, { state: "common", steps: index * 8 });
    state.phase = "modal";
    state.activeModal = "CUT_REWARD";
    state.turn.owedExtraRoll = true;
    await page.evaluate(
      (state) => localStorage.setItem("ludo:save:v1", JSON.stringify(state)),
      state,
    );
    await page.goto("/game");
    const name = missing === "release" ? "Bring out a token" : "Jump a token 6 spaces";
    await expect(panel.getByRole("button", { name, exact: true })).toBeDisabled();
    await panel.getByRole("button", { name: `Info: ${name}`, exact: true }).click();
    await expect(panel.locator(".royal-bonus-unavailable")).toContainText(
      missing === "release" ? "No yard token" : "No token can legally move",
    );
    await panel.getByRole("button", { name: "Roll again", exact: true }).click();
    await expect(panel).toHaveCount(0);
  }
});

for (const width of [320, 360, 430, 768, 1280]) {
  test(`full inner-home rank artwork at ${width}px in both themes offline`, async ({
    page,
    context,
  }, testInfo) => {
    await prepared(page);
    await context.setOffline(true);
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 800 });
    await page.emulateMedia({ reducedMotion: width === 320 ? "reduce" : "no-preference" });
    for (const theme of ["dark", "light"]) {
      for (const color of COLOR_ORDER) {
        const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
        for (const token of state.tokens.filter((token) => token.color === color))
          Object.assign(token, { state: "finished", steps: 56 });
        updateStandings(state);
        await page.evaluate(
          ({ state, theme }) => {
            localStorage.setItem("ludo:save:v1", JSON.stringify(state));
            localStorage.setItem("ludo:app-theme:v1", theme);
          },
          { state, theme },
        );
        await page.goto("/game");
        await expectFullHomeFeedback(page, color);
        await expect(page.locator("[role=dialog]")).toHaveCount(0);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        // Presentation must not move or resize any token when feedback is shown.
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ludo:save:v1")!));
        expect(saved.tokens).toEqual(state.tokens);
        if (color === "green") {
          await expect
            .poll(() =>
              page
                .locator('[data-cat="babsb-cat"] img')
                .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
            )
            .toBe(true);
          await page.screenshot({
            path: testInfo.outputPath(`${width}-${theme}-inner-home.png`),
            fullPage: true,
          });
        }
      }
    }
  });
}

test("full inner-home rank artwork follows all 12 ordered two-player seats", async ({
  page,
  context,
}) => {
  await prepared(page);
  await context.setOffline(true);
  for (const [index, first] of COLOR_ORDER.entries()) {
    for (const second of COLOR_ORDER.filter((color) => color !== first)) {
      const state = createGame("2P", DEFAULT_HOUSE_RULES, {}, [first, second]);
      for (const token of state.tokens.filter((token) => token.color === first))
        Object.assign(token, { state: "finished", steps: 56 });
      updateStandings(state);
      await page.evaluate(
        ({ state, theme }) => {
          localStorage.setItem("ludo:save:v1", JSON.stringify(state));
          localStorage.setItem("ludo:app-theme:v1", theme);
        },
        { state, theme: index % 2 === 0 ? "dark" : "light" },
      );
      await page.goto("/game");
      for (const color of [first, second]) await expectFullHomeFeedback(page, color);
      const positions = await page.locator(".royal-cat-yard").evaluateAll((yards) =>
        yards.map((yard) => ({
          color: (yard as HTMLElement).dataset.color,
          left: (yard as HTMLElement).style.left,
          top: (yard as HTMLElement).style.top,
        })),
      );
      expect(positions).toEqual(
        expect.arrayContaining([
          { color: first, left: "0%", top: "0%" },
          { color: second, left: "60%", top: "60%" },
        ]),
      );
    }
  }
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
