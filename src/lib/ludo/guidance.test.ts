import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerPanel } from "@/components/ludo/PlayerPanel";
import { createGame, DEFAULT_HOUSE_RULES } from "./engine";
import { createGuidanceNotices, guidanceEnabled, normalizeGuidance } from "./guidance";
import { loadGame, saveGame } from "./persistence";
import { gameReducer } from "./store";

afterEach(() => vi.unstubAllGlobals());

describe("one backward-compatible guidance preference", () => {
  const values = [undefined, false, true];
  it.each(values.flatMap((explicit) => values.map((legacy) => ({ explicit, legacy }))))(
    "normalizes explicit=$explicit and legacy=$legacy on load, hydrate, toggle, save and rematch",
    ({ explicit, legacy }) => {
      const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
      if (explicit === undefined) delete state.settings.showMoveSuggestions;
      else state.settings.showMoveSuggestions = explicit;
      if (legacy === undefined) delete state.settings.notificationsOn;
      else state.settings.notificationsOn = legacy;
      const before = structuredClone(state);
      const expected = explicit ?? legacy ?? false;
      const normalized = {
        ...state.settings,
        showMoveSuggestions: expected,
        notificationsOn: expected,
      };
      expect(guidanceEnabled(state.settings)).toBe(expected);
      expect(normalizeGuidance(state.settings)).toEqual(normalized);
      expect(gameReducer(state, { type: "HYDRATE", state }).settings).toEqual(normalized);
      expect(gameReducer(state, { type: "REMATCH" }).settings).toEqual(normalized);
      let saved = JSON.stringify(state);
      vi.stubGlobal("window", {
        localStorage: {
          getItem: () => saved,
          setItem: (key: string, value: string) => {
            expect(key).toBe("ludo:save:v1");
            saved = value;
          },
        },
      });
      expect(loadGame()!.settings).toEqual(normalized);
      for (const key of ["notificationsOn", "showMoveSuggestions"] as const) {
        const toggled = gameReducer(state, { type: "TOGGLE_SETTING", key });
        expect(toggled.settings).toEqual({
          ...normalized,
          showMoveSuggestions: !expected,
          notificationsOn: !expected,
        });
        saveGame(toggled);
        expect(loadGame()!.settings).toEqual(toggled.settings);
        expect(gameReducer(toggled, { type: "TOGGLE_SETTING", key }).settings).toEqual(normalized);
      }
      saveGame(state);
      expect(loadGame()!.settings).toEqual(normalized);
      expect(JSON.parse(saved).schemaVersion).toBe(1);
      expect(state).toEqual(before);
    },
  );

  it("starts off, synchronizes explicit setup choices and keeps sound independent", () => {
    const original = createGame("2P", DEFAULT_HOUSE_RULES, {});
    for (const value of [undefined, false, true]) {
      const state = gameReducer(original, {
        type: "START",
        mode: "2P",
        houseRules: DEFAULT_HOUSE_RULES,
        nicknames: {},
        ...(value === undefined ? {} : { showMoveSuggestions: value }),
      });
      expect(state.settings.showMoveSuggestions).toBe(value ?? false);
      expect(state.settings.notificationsOn).toBe(value ?? false);
      const toggled = gameReducer(state, { type: "TOGGLE_SETTING", key: "soundOn" });
      expect(toggled.settings.showMoveSuggestions).toBe(value ?? false);
      expect(toggled.settings.soundOn).toBe(!state.settings.soundOn);
    }
  });
});

describe("guidance notice lifecycle", () => {
  it("dismisses immediately, consumes muted events and never replays stale notices", () => {
    const sink = { show: vi.fn(), dismiss: vi.fn(), sound: vi.fn() };
    const notices = createGuidanceNotices(8, sink);
    notices.update(8, "Saved old capture", true);
    expect(sink.show).not.toHaveBeenCalled();
    notices.update(9, "New capture", true);
    expect(sink.show).toHaveBeenCalledExactlyOnceWith("New capture");
    expect(sink.sound).toHaveBeenCalledOnce();
    notices.update(9, "New capture", false);
    expect(sink.dismiss).toHaveBeenCalledOnce();
    notices.update(10, "Muted skip", false);
    notices.update(11, null, false);
    notices.update(11, null, true);
    expect(sink.show).toHaveBeenCalledTimes(1);
    expect(sink.sound).toHaveBeenCalledTimes(1);
    notices.update(12, "Current capture", true);
    notices.update(12, "Current capture", true); // repeated render/Strict Mode effect
    expect(sink.show).toHaveBeenCalledTimes(2);
    expect(sink.sound).toHaveBeenCalledTimes(2);
    notices.dispose();
    expect(sink.dismiss).toHaveBeenCalledTimes(4);
  });

  it.each([false, true])(
    "guidance=%s does not gate the current-player dice invitation, roll access or turn labels",
    (enabled) => {
      const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
      state.settings.showMoveSuggestions = enabled;
      const html = renderToStaticMarkup(
        createElement(PlayerPanel, {
          state,
          player: state.players[0]!,
          isTurn: true,
          actingColor: "red",
          rolling: false,
          canRoll: true,
          onRoll: () => {},
        }),
      );
      expect(html).toContain('data-waiting="true"');
      expect(html).toContain("Your turn");
      expect(html).not.toContain('disabled=""');
    },
  );

  it("wires the bell/status to shared guidance and scopes toast dismissal to game guidance", () => {
    // Wiring contract; real browser effects and tap geometry still need device verification.
    const game = readFileSync(new URL("../../routes/game.tsx", import.meta.url), "utf8");
    const settings = readFileSync(new URL("../../routes/settings.tsx", import.meta.url), "utf8");
    expect(game).toContain("{guidance &&");
    expect(game).toContain("aria-pressed={guidance}");
    expect(game).toContain('key: "showMoveSuggestions"');
    expect(settings).toContain('key: "showMoveSuggestions"');
    expect(game).toContain("toast(message, { id: GAME_GUIDANCE_TOAST_ID })");
    expect(game).toContain("toast.dismiss(GAME_GUIDANCE_TOAST_ID)");
    expect(game).not.toContain("toast.dismiss()");
  });
});
