import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame, DEFAULT_HOUSE_RULES } from "./engine";
import { hasSave, loadGame, saveGame } from "./persistence";
import { destinations } from "./presentation";
import { gameReducer } from "./store";

afterEach(() => vi.unstubAllGlobals());

describe("royal presentation preserves v1 saves", () => {
  it("converts an unmarked save on load while retaining its reward dialog", () => {
    const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
    delete state.homePathVersion;
    Object.assign(state.tokens[0]!, { steps: 108, lap: 1, state: "home_stretch" });
    Object.assign(state.tokens[1]!, { steps: 109, lap: 1, state: "finished" });
    state.activeModal = "CUT_REWARD";
    state.phase = "modal";
    state.turn.owedExtraRoll = true;
    vi.stubGlobal("window", { localStorage: { getItem: () => JSON.stringify(state) } });
    const loaded = loadGame()!;
    expect(loaded.homePathVersion).toBe(2);
    expect(loaded.tokens[0]!.steps).toBe(107);
    expect(loaded.tokens[1]!.steps).toBe(108);
    expect(loaded.activeModal).toBe("CUT_REWARD");
    expect(loaded.turn.owedExtraRoll).toBe(true);
  });
  it.each(["enter", "settle"] as const)(
    "recovers an interrupted %s without stranding a token",
    (finishStage) => {
      const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
      Object.assign(state.tokens[0]!, { steps: 56, state: "home_stretch" });
      state.phase = "moving";
      state.pending = { tokenId: "red-0", remaining: 0, isReward: false, finishStage };
      vi.stubGlobal("window", { localStorage: { getItem: () => JSON.stringify(state) } });
      const loaded = loadGame()!;
      expect(loaded.tokens[0]!.steps).toBe(55);
      expect(loaded.pending).toBeNull();
      expect(loaded.phase).toBe("idle");
      const next = gameReducer(loaded, { type: "ROLL", value: 1 });
      expect(next.pending?.tokenId).toBe("red-0");
    },
  );
  it("loads an existing stable game unchanged, without skin fields or migration", () => {
    const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
    state.tokens[0]!.steps = 14;
    state.tokens[0]!.state = "common";
    state.turn.diceValue = 2;
    state.phase = "select";
    const payload = JSON.stringify(state);
    const getItem = vi.fn(() => payload);
    vi.stubGlobal("window", { localStorage: { getItem } });
    const loaded = loadGame();
    expect(loaded).toEqual(state);
    expect(getItem).toHaveBeenCalledWith("ludo:save:v1");
    const before = JSON.stringify(loaded);
    destinations(loaded!);
    expect(JSON.stringify(loaded)).toBe(before);
    expect(hasSave()).toBe(true);
  });
  it("continues writing the original key and schema without presentation config", () => {
    const state = createGame("2P", DEFAULT_HOUSE_RULES, {});
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem } });
    saveGame(state);
    expect(setItem).toHaveBeenCalledOnce();
    const [key, payload] = setItem.mock.calls[0]!;
    expect(key).toBe("ludo:save:v1");
    const saved = JSON.parse(payload);
    expect(saved.schemaVersion).toBe(1);
    expect(saved.tokens).toEqual(state.tokens);
    expect(saved).not.toHaveProperty("appearance");
    expect(saved).not.toHaveProperty("theme");
  });
  it("keeps playing when browser storage is unavailable", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("Storage blocked");
      },
    });
    expect(() => saveGame(createGame("2P", DEFAULT_HOUSE_RULES, {}))).not.toThrow();
    expect(loadGame()).toBeNull();
  });
  it.each([false, true])(
    "preserves suggestions=%s through save, hydrate and rematch",
    (showMoveSuggestions) => {
      const original = createGame("3P", DEFAULT_HOUSE_RULES, {});
      const state = gameReducer(original, {
        type: "START",
        mode: "3P",
        houseRules: DEFAULT_HOUSE_RULES,
        nicknames: {},
        showMoveSuggestions,
      });
      expect(state.settings.showMoveSuggestions).toBe(showMoveSuggestions);
      const values = new Map<string, string>();
      vi.stubGlobal("window", {
        localStorage: {
          setItem: (key: string, value: string) => values.set(key, value),
          getItem: (key: string) => values.get(key) ?? null,
        },
      });
      saveGame(state);
      expect([...values.keys()]).toEqual(["ludo:save:v1"]);
      const loaded = loadGame()!;
      expect(loaded.schemaVersion).toBe(1);
      const hydrated = gameReducer(original, { type: "HYDRATE", state: loaded });
      expect(hydrated.settings.showMoveSuggestions).toBe(showMoveSuggestions);
      expect(gameReducer(hydrated, { type: "REMATCH" }).settings.showMoveSuggestions).toBe(
        showMoveSuggestions,
      );
      // New setup defaults off rather than inheriting the previous game's preference.
      const fresh = gameReducer(hydrated, {
        type: "START",
        mode: "2P",
        houseRules: DEFAULT_HOUSE_RULES,
        nicknames: {},
      });
      expect(fresh.settings.showMoveSuggestions).toBe(false);
    },
  );
  it("continues loading a legacy save with no suggestion preference", () => {
    const state = createGame("2P", DEFAULT_HOUSE_RULES, {});
    delete state.settings.showMoveSuggestions;
    vi.stubGlobal("window", { localStorage: { getItem: () => JSON.stringify(state) } });
    const loaded = loadGame()!;
    expect(loaded).toEqual({
      ...state,
      settings: { ...state.settings, showMoveSuggestions: false },
    });
    const hydrated = gameReducer(state, { type: "HYDRATE", state: loaded });
    expect(Boolean(hydrated.settings.showMoveSuggestions)).toBe(false);
  });
});
