import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame, DEFAULT_HOUSE_RULES } from "./engine";
import { gameReducer } from "./store";
import { loadPreferences, savePreferences, PREFERENCES_KEY } from "./local-preferences";

afterEach(() => vi.unstubAllGlobals());
describe("independent local preferences", () => {
  it("seeds missing preferences from a legacy game", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null } });
    expect(loadPreferences({ soundOn: false, hapticsOn: false, musicOn: true })).toEqual({
      soundOn: false,
      hapticsOn: false,
      musicOn: true,
      boardTheme: "royal",
      tokenSkin: "royal",
      diceSkin: "royal",
    });
  });
  it("keeps explicit local settings ahead of older saved settings and rejects invalid IDs", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () =>
          JSON.stringify({
            soundOn: false,
            hapticsOn: "invalid",
            musicOn: true,
            tokenSkin: "invalid",
          }),
      },
    });
    expect(loadPreferences({ soundOn: true, hapticsOn: true })).toMatchObject({
      soundOn: false,
      hapticsOn: true,
      musicOn: true,
      tokenSkin: "royal",
    });
  });
  it("stores settings and three independent royal skin IDs without changing save keys", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem } });
    savePreferences({ soundOn: false, hapticsOn: true });
    expect(setItem).toHaveBeenCalledWith(
      PREFERENCES_KEY,
      JSON.stringify({
        soundOn: false,
        hapticsOn: true,
        musicOn: false,
        boardTheme: "royal",
        tokenSkin: "royal",
        diceSkin: "royal",
      }),
    );
  });
  it("retains audio preferences on START while suggestions still default off", () => {
    const game = createGame("4P", DEFAULT_HOUSE_RULES, {});
    game.settings = { soundOn: false, hapticsOn: false, musicOn: true, showMoveSuggestions: true };
    const started = gameReducer(game, {
      type: "START",
      mode: "2P",
      houseRules: DEFAULT_HOUSE_RULES,
      nicknames: {},
    });
    expect(started.settings).toMatchObject({
      soundOn: false,
      hapticsOn: false,
      musicOn: true,
      showMoveSuggestions: false,
    });
  });
  it("survives blocked storage", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("blocked");
      },
    });
    expect(() => savePreferences({ soundOn: true, hapticsOn: true })).not.toThrow();
    expect(loadPreferences({ soundOn: false, hapticsOn: true }).soundOn).toBe(false);
  });
});
