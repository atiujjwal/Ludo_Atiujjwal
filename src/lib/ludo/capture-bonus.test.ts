import { describe, expect, it } from "vitest";
import { START_OFFSET } from "./board";
import { createGame, DEFAULT_HOUSE_RULES, earnsExtraRoll } from "./engine";
import { gameReducer } from "./store";
import type { Color, GameState, HouseRules, Mode } from "./types";

const game = (mode: Mode = "4P", rules: Partial<HouseRules> = {}) =>
  createGame(mode, { ...DEFAULT_HOUSE_RULES, ...rules }, {});
function place(state: GameState, color: Color, index: number, absolute: number) {
  const token = state.tokens.find((t) => t.id === color + "-" + index)!;
  token.steps = (absolute - START_OFFSET[color] + 52) % 52;
  token.state = "common";
  return token;
}
function move(state: GameState, dice: number, tokenId = "red-0") {
  let next = gameReducer(state, { type: "ROLL", value: dice });
  if (next.phase === "select") next = gameReducer(next, { type: "SELECT_TOKEN", tokenId });
  return next;
}
function finish(state: GameState) {
  let next = state;
  for (let i = 0; next.pending && next.pending.remaining > 0 && i < 12; i++) {
    next = gameReducer(next, { type: "HOP" });
  }
  return gameReducer(next, { type: "FINISH_MOVE" });
}

const captureCases = (["2P", "3P", "4P", "2V2"] as Mode[]).flatMap((mode) =>
  [1, 2, 3, 4, 5, 6].flatMap((dice) =>
    [false, true].map((cutReward) => ({ mode, dice, cutReward })),
  ),
);

describe("opponent captures always earn exactly one next roll", () => {
  it.each(captureCases)("$mode roll $dice, Cut Reward $cutReward", ({ mode, dice, cutReward }) => {
    const state = game(mode, { cutReward });
    const opponent = mode === "2P" ? "yellow" : "green";
    place(state, "red", 0, 6 - dice);
    place(state, opponent, 0, 6);
    const moving = move(state, dice);
    expect(moving.phase).toBe("moving");
    expect(moving.turn.owedExtraRoll).toBe(false);
    expect(moving.tokens.find((t) => t.id === opponent + "-0")?.state).toBe("common");
    let next = finish(moving);
    expect(next.tokens.find((t) => t.id === opponent + "-0")?.state).toBe("base");
    expect(next.turn.currentPlayerId).toBe("p-red");
    expect(next.activeModal).toBe(cutReward ? "CUT_REWARD" : "NONE");
    expect(gameReducer(next, { type: "FINISH_MOVE" })).toEqual(next);
    if (cutReward) next = gameReducer(next, { type: "CUT_EXTRA_ROLL" });
    expect(next.phase).toBe("idle");
    expect(next.turn.diceValue).toBeNull();
    expect(next.turn.owedExtraRoll).toBe(false);
    // A subsequent ordinary move ends the turn: six + capture did not bank two rolls.
    next = finish(move(next, 2));
    expect(next.turn.currentPlayerId).toBe(state.players[1]!.id);
  });

  it("does not resolve captures from a prematurely dispatched completion", () => {
    const state = game();
    place(state, "red", 0, 0);
    place(state, "green", 0, 2);
    const moving = move(state, 2);
    expect(gameReducer(moving, { type: "FINISH_MOVE" })).toEqual(moving);
    expect(finish(moving).lastCapture?.tokens).toHaveLength(1);
  });

  it.each(["own", "teammate", "safe"] as const)(
    "does not award a capture bonus for a %s stack",
    (kind) => {
      const state = game("2V2", { cutReward: true });
      const target = kind === "safe" ? 8 : 6;
      place(state, "red", 0, target - 1);
      const color = kind === "own" ? "red" : kind === "teammate" ? "yellow" : "green";
      const other = place(state, color, 1, target);
      const next = finish(move(state, 1));
      expect(next.tokens.find((t) => t.id === other.id)?.state).toBe("common");
      expect(next.lastCapture).toBeUndefined();
      expect(next.activeModal).toBe("NONE");
      expect(next.turn.currentPlayerId).toBe("p-green");
    },
  );
});

describe("capture reward chains and saved entitlements", () => {
  it.each(["CUT_RELEASE", "CUT_MOVE6", "CUT_EXTRA_ROLL"] as const)(
    "keeps the earned roll after %s and old-dialog resume",
    (choice) => {
      const state = game("4P", { cutReward: true });
      place(state, "red", 0, 0);
      place(state, "green", 0, 1);
      let next = finish(move(state, 1));
      // Simulate an older stable v1 save that lacked the baseline capture bonus.
      next.turn.owedExtraRoll = false;
      next = gameReducer(state, { type: "HYDRATE", state: JSON.parse(JSON.stringify(next)) });
      expect(next.turn.owedExtraRoll).toBe(true);
      next = gameReducer(next, { type: choice });
      if (next.pending) next = finish(next);
      expect(next.phase).toBe("idle");
      expect(next.turn.currentPlayerId).toBe("p-red");
      expect(next.turn.owedExtraRoll).toBe(false);
      expect(gameReducer(next, { type: choice })).toEqual(next);
      expect(finish(move(next, 2)).turn.currentPlayerId).toBe("p-green");
    },
  );

  it("preserves one entitlement through a second capture on a reward-six move", () => {
    const state = game("4P", { cutReward: true });
    place(state, "red", 0, 0);
    place(state, "green", 0, 6);
    place(state, "blue", 0, 12);
    let next = finish(move(state, 6));
    next = gameReducer(next, { type: "CUT_MOVE6" });
    next = finish(next);
    expect(next.lastCapture?.id).toBe(2);
    expect(next.activeModal).toBe("CUT_REWARD");
    expect(next.turn.owedExtraRoll).toBe(true);
    next = gameReducer(next, { type: "CUT_EXTRA_ROLL" });
    expect(finish(move(next, 2)).turn.currentPlayerId).toBe("p-green");
  });

  it("restores the earned roll while choosing a saved reward move", () => {
    const state = game("4P", { cutReward: true });
    place(state, "red", 0, 0);
    place(state, "red", 1, 15);
    place(state, "green", 0, 1);
    let next = gameReducer(finish(move(state, 1)), { type: "CUT_MOVE6" });
    expect(next.phase).toBe("select");
    next.turn.owedExtraRoll = false;
    next = gameReducer(state, { type: "HYDRATE", state: next });
    next = finish(gameReducer(next, { type: "SELECT_TOKEN", tokenId: "red-0" }));
    expect(next.turn.currentPlayerId).toBe("p-red");
    expect(next.turn.owedExtraRoll).toBe(false);
  });

  it("does not treat an artificial reward-six as a rolled six", () => {
    const opts = {
      dice: 6,
      reachedHome: false,
      captured: false,
      consecutiveSixes: 1,
      isReward: true,
      rewardOwed: false,
      threeSixesVariant: true,
    };
    expect(earnsExtraRoll(opts)).toBe(false);
    expect(earnsExtraRoll({ ...opts, captured: true })).toBe(true);
    expect(earnsExtraRoll({ ...opts, reachedHome: true })).toBe(true);
    expect(earnsExtraRoll({ ...opts, rewardOwed: true })).toBe(true);
  });
});

describe("third-six exceptions start a fresh streak", () => {
  it.each([false, true])("capture resets the streak, Cut Reward %s", (cutReward) => {
    const state = game("4P", { threeSixesVariant: true, cutReward });
    place(state, "red", 0, 0);
    place(state, "green", 0, 6);
    state.turn.consecutiveSixes = 2;
    let next = finish(move(state, 6));
    expect(next.turn.consecutiveSixes).toBe(0);
    if (cutReward) {
      expect(next.activeModal).toBe("CUT_REWARD");
      next = gameReducer(state, { type: "HYDRATE", state: next });
      next = gameReducer(next, { type: "CUT_RELEASE" });
    }
    next = finish(move(next, 6));
    expect(next.turn.currentPlayerId).toBe("p-red");
    expect(next.turn.consecutiveSixes).toBe(1);
    expect(next.phase).toBe("idle");
  });
  it("home completion on a third six resets the streak without ending a still-playable player's turn", () => {
    const state = game("4P", { threeSixesVariant: true });
    const token = place(state, "red", 0, 0);
    token.steps = 51;
    token.state = "home_stretch";
    state.turn.consecutiveSixes = 2;
    let next = finish(move(state, 6));
    expect(next.turn.consecutiveSixes).toBe(0);
    expect(next.turn.currentPlayerId).toBe("p-red");
    next = finish(move(next, 6, "red-1"));
    expect(next.turn.consecutiveSixes).toBe(1);
    expect(next.turn.currentPlayerId).toBe("p-red");
  });
  it("still skips the third six before any capture when the variant is off", () => {
    const state = game();
    place(state, "red", 0, 0);
    place(state, "green", 0, 6);
    state.turn.consecutiveSixes = 2;
    const next = move(state, 6);
    expect(next.turn.currentPlayerId).toBe("p-green");
    expect(next.lastCapture).toBeUndefined();
    expect(next.tokens[0]!.steps).toBe(0);
  });
  it("ends a played third six that only stacks with a teammate", () => {
    const state = game("2V2", { threeSixesVariant: true, cutReward: true });
    place(state, "red", 0, 0);
    place(state, "yellow", 0, 6);
    state.turn.consecutiveSixes = 2;
    const next = finish(move(state, 6));
    expect(next.turn.currentPlayerId).toBe("p-green");
    expect(next.activeModal).toBe("NONE");
    expect(next.lastCapture).toBeUndefined();
  });
  it("lets game-over resolution take priority over the home bonus", () => {
    const state = game("2P", { threeSixesVariant: true });
    state.tokens
      .filter((t) => t.color === "red")
      .forEach((t) => {
        t.steps = 57;
        t.state = "finished";
      });
    state.tokens[0]!.steps = 51;
    state.tokens[0]!.state = "home_stretch";
    state.turn.consecutiveSixes = 2;
    const next = finish(move(state, 6));
    expect(next.phase).toBe("over");
    expect(next.activeModal).toBe("GAME_OVER");
  });
});
