import { describe, expect, it } from "vitest";

import { START_OFFSET, junctionOf } from "./board";
import {
  DEFAULT_HOUSE_RULES,
  canContinueSecondLap,
  createGame,
  getLegalMoves,
  rollDie,
} from "./engine";
import { gameReducer, type Action } from "./store";
import type { Color, GameState, HouseRules, Mode, Token } from "./types";

function game(mode: Mode = "4P", rules: Partial<HouseRules> = {}, colors?: Color[]): GameState {
  return createGame(mode, { ...DEFAULT_HOUSE_RULES, ...rules }, {}, colors);
}

function token(state: GameState, color: Color, index: number): Token {
  return state.tokens.find((candidate) => candidate.id === `${color}-${index}`)!;
}

function placeAt(state: GameState, color: Color, index: number, absolute: number): Token {
  const piece = token(state, color, index);
  piece.state = "common";
  piece.lap = 0;
  piece.steps = (absolute - START_OFFSET[color] + 52) % 52;
  return piece;
}

function placeAtSteps(state: GameState, color: Color, index: number, steps: number): Token {
  const piece = token(state, color, index);
  piece.state = steps >= junctionOf(piece) ? "home_stretch" : "common";
  piece.steps = steps;
  return piece;
}

function finish(state: GameState, color: Color, indexes: number[]) {
  for (const index of indexes) {
    const piece = token(state, color, index);
    piece.state = "finished";
    piece.steps = junctionOf(piece) + 5;
  }
}

function reduce(state: GameState, action: Action): GameState {
  return gameReducer(state, action);
}

function roll(state: GameState, value: number): GameState {
  return reduce(state, { type: "ROLL", value });
}

function completePendingMove(state: GameState): GameState {
  let next = state;
  let guard = 20;
  while (next.pending && next.pending.remaining > 0 && guard-- > 0) {
    next = reduce(next, { type: "HOP" });
  }
  if (next.pending?.finishStage === "enter")
    next = reduce(next, { type: "ADVANCE_FINISH", tokenId: next.pending.tokenId });
  if (next.pending) next = reduce(next, { type: "FINISH_MOVE" });
  return next;
}

function legalIds(state: GameState, dice: number, movesOnly = false): string[] {
  return getLegalMoves(state, dice, movesOnly)
    .map((move) => move.tokenId)
    .sort();
}

describe("gameplay matrix: modes and configuration", () => {
  it("creates the correct player and token counts for 2, 3, and 4 players", () => {
    for (const [mode, players] of [
      ["2P", 2],
      ["3P", 3],
      ["4P", 4],
    ] as const) {
      const state = game(mode);
      expect(state.players).toHaveLength(players);
      expect(state.tokens).toHaveLength(players * 4);
    }
  });

  it("preserves claim order so the first selected player starts", () => {
    const twoPlayer = game("2P", {}, ["blue", "green"]);
    expect(twoPlayer.players.map((player) => player.color)).toEqual(["blue", "green"]);
    expect(twoPlayer.turn.currentPlayerId).toBe("p-blue");

    const threePlayer = game("3P", {}, ["yellow", "red", "blue"]);
    expect(threePlayer.players.map((player) => player.color)).toEqual(["yellow", "red", "blue"]);
    expect(threePlayer.turn.currentPlayerId).toBe("p-yellow");
  });

  it("allows any unique colour pair for a two-player game", () => {
    const state = game("2P", {}, ["red", "green"]);
    expect(state.players.map((player) => player.color)).toEqual(["red", "green"]);
    expect(state.turn.currentPlayerId).toBe("p-red");
  });

  it("stores every custom rule exactly as configured", () => {
    const configured: HouseRules = {
      exitOnOne: true,
      secondLap: true,
      cutReward: true,
      threeSixesVariant: true,
    };
    expect(createGame("4P", configured, {}).gameConfig.houseRules).toEqual(configured);
  });

  it("advances through the configured player order in every non-team mode", () => {
    const twoPlayer = roll(game("2P", {}, ["blue", "green"]), 2);
    expect(twoPlayer.turn.currentPlayerId).toBe("p-green");

    const threePlayer = roll(game("3P", {}, ["yellow", "red", "blue"]), 2);
    expect(threePlayer.turn.currentPlayerId).toBe("p-red");

    const fourPlayer = roll(game("4P"), 2);
    expect(fourPlayer.turn.currentPlayerId).toBe("p-green");
  });
});

describe("gameplay matrix: complete legal move generation", () => {
  it("enables every base and track token together after rolling a six", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 8);

    expect(getLegalMoves(state, 6)).toEqual([
      { tokenId: "red-0", kind: "move" },
      { tokenId: "red-1", kind: "release" },
      { tokenId: "red-2", kind: "release" },
      { tokenId: "red-3", kind: "release" },
    ]);

    const rolled = roll(state, 6);
    expect(rolled.phase).toBe("select");
    expect(rolled.legalMoves).toEqual(getLegalMoves(rolled, 6));
  });

  it.each([1, 2, 3, 4, 5, 6])("evaluates every token independently for dice value %i", (dice) => {
    const state = game();
    placeAtSteps(state, "red", 0, 3);
    placeAtSteps(state, "red", 1, 11);

    const ids = legalIds(state, dice);
    expect(ids).toContain("red-0");
    expect(ids).toContain("red-1");
    expect(ids).toHaveLength(dice === 6 ? 4 : 2);
  });

  it.each([0, 1, 2, 3, 4])("handles %i tokens outside the yard", (outside) => {
    const state = game();
    for (let index = 0; index < outside; index += 1) {
      placeAtSteps(state, "red", index, 3 + index * 7);
    }
    expect(legalIds(state, 3)).toHaveLength(outside);
    expect(legalIds(state, 6)).toHaveLength(4);
  });

  it("Exit on 1 affects releases without suppressing track moves", () => {
    const standard = game();
    const custom = game("4P", { exitOnOne: true });
    placeAtSteps(standard, "red", 0, 5);
    placeAtSteps(custom, "red", 0, 5);

    expect(legalIds(standard, 1)).toEqual(["red-0"]);
    expect(legalIds(custom, 1)).toEqual(["red-0", "red-1", "red-2", "red-3"]);
    expect(legalIds(custom, 6)).toHaveLength(4);
  });

  it("requires an exact roll at the final home square", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 55);
    expect(legalIds(state, 1)).toContain("red-0");
    expect(legalIds(state, 2)).not.toContain("red-0");
  });

  it("keeps other valid tokens playable when one token would overshoot home", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 55);
    placeAtSteps(state, "red", 1, 14);
    expect(legalIds(state, 2)).toEqual(["red-1"]);
  });

  it("rejects invalid dice inputs deterministically", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 5);
    for (const value of [-1, 0, 7, 2.5, Number.NaN]) {
      expect(getLegalMoves(state, value)).toEqual([]);
    }
  });
});

describe("gameplay matrix: path, safe cells, captures, and stacks", () => {
  it("moves into the home lane and preserves the expected board state", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 50);
    const moved = completePendingMove(roll(state, 2));
    expect(token(moved, "red", 0)).toMatchObject({ steps: 52, state: "home_stretch" });
    expect(moved.turn.currentPlayerId).toBe("p-green");
  });

  it("captures a lone opponent on an unsafe square", () => {
    const state = game();
    placeAt(state, "red", 0, 0);
    placeAt(state, "green", 0, 1);
    const moved = completePendingMove(roll(state, 1));
    expect(token(moved, "green", 0)).toMatchObject({ state: "base", steps: 0 });
    expect(moved.turn.currentPlayerId).toBe("p-red");
  });

  it("does not capture or award Cut Reward on a safe square", () => {
    const state = game("4P", { cutReward: true });
    placeAt(state, "red", 0, 7);
    placeAt(state, "green", 0, 8);
    const moved = completePendingMove(roll(state, 1));
    expect(token(moved, "green", 0).state).toBe("common");
    expect(moved.activeModal).toBe("NONE");
    expect(moved.turn.currentPlayerId).toBe("p-green");
  });

  it("allows landing on a stacked opponent at a safe square without capturing", () => {
    const state = game();
    placeAt(state, "red", 0, 7);
    placeAt(state, "green", 0, 8);
    placeAt(state, "green", 1, 8);

    const moved = completePendingMove(roll(state, 1));

    expect(token(moved, "red", 0).steps).toBe(8);
    expect(token(moved, "green", 0).state).toBe("common");
    expect(token(moved, "green", 1).state).toBe("common");
    expect(moved.lastCapture).toBeUndefined();
  });

  it("allows passing through a stacked opponent at a safe square", () => {
    const state = game();
    placeAt(state, "red", 0, 7);
    placeAt(state, "green", 0, 8);
    placeAt(state, "green", 1, 8);

    expect(legalIds(state, 2)).toContain("red-0");
    const moved = completePendingMove(roll(state, 2));
    expect(token(moved, "red", 0).steps).toBe(9);
  });

  it("matches the reported blue move onto the stacked green star square", () => {
    const state = game("2P", {}, ["blue", "green"]);
    placeAt(state, "blue", 0, 46);
    placeAt(state, "green", 0, 47);
    placeAt(state, "green", 1, 47);

    const rolled = roll(state, 1);
    expect(rolled.pending).toMatchObject({ tokenId: "blue-0", remaining: 1 });

    const moved = completePendingMove(rolled);
    expect(token(moved, "blue", 0).steps).toBe(8);
    expect(token(moved, "green", 0).state).toBe("common");
    expect(token(moved, "green", 1).state).toBe("common");
  });

  it("never captures a teammate in 2v2", () => {
    const state = game("2V2");
    placeAt(state, "red", 0, 0);
    placeAt(state, "yellow", 0, 1);
    const moved = completePendingMove(roll(state, 1));
    expect(token(moved, "yellow", 0).state).toBe("common");
  });

  it("allows both landing on and passing through an enemy stack", () => {
    const state = game();
    placeAt(state, "red", 0, 0);
    placeAt(state, "green", 0, 3);
    placeAt(state, "green", 1, 3);
    expect(legalIds(state, 3)).toContain("red-0");
    expect(legalIds(state, 5)).toContain("red-0");
    expect(legalIds(state, 2)).toContain("red-0");
  });
});

describe("gameplay matrix: turn and bonus resolution", () => {
  it("does not advance the turn until the selected movement finishes", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 4);
    const rolled = roll(state, 3);
    expect(rolled.phase).toBe("moving");
    expect(rolled.turn.currentPlayerId).toBe("p-red");

    const hopped = reduce(rolled, { type: "HOP" });
    expect(hopped.pending?.remaining).toBe(2);
    expect(hopped.turn.currentPlayerId).toBe("p-red");

    const moved = completePendingMove(hopped);
    expect(moved.turn.currentPlayerId).toBe("p-green");
  });

  it("grants one extra turn after a normal six-space move", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 4);
    finish(state, "red", [1, 2, 3]);
    const moved = completePendingMove(roll(state, 6));
    expect(token(moved, "red", 0).steps).toBe(10);
    expect(moved.turn.currentPlayerId).toBe("p-red");
    expect(moved.turn.diceValue).toBeNull();
    expect(moved.turn.owedExtraRoll).toBe(false);
  });

  it("advances after a non-six with no legal move", () => {
    const moved = roll(game(), 2);
    expect(moved.turn.currentPlayerId).toBe("p-green");
    expect(moved.phase).toBe("idle");
  });

  it("keeps the turn after a six when every token would overshoot home", () => {
    const state = game();
    for (let index = 0; index < 4; index += 1) placeAtSteps(state, "red", index, 55);
    const moved = roll(state, 6);
    expect(moved.turn.currentPlayerId).toBe("p-red");
    expect(moved.turn.diceValue).toBeNull();
    expect(moved.turn.consecutiveSixes).toBe(1);
    expect(moved.phase).toBe("idle");
  });

  it("skips the third consecutive six under standard rules", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 4);
    state.turn.consecutiveSixes = 2;
    const moved = roll(state, 6);
    expect(token(moved, "red", 0).steps).toBe(4);
    expect(moved.turn.currentPlayerId).toBe("p-green");
    expect(moved.turn.consecutiveSixes).toBe(0);
  });

  it("plays the third six but does not grant a fourth roll without a special event", () => {
    const state = game("4P", { threeSixesVariant: true });
    placeAtSteps(state, "red", 0, 4);
    finish(state, "red", [1, 2, 3]);
    state.turn.consecutiveSixes = 2;
    const moved = completePendingMove(roll(state, 6));
    expect(token(moved, "red", 0).steps).toBe(10);
    expect(moved.turn.currentPlayerId).toBe("p-green");
  });

  it("grants the documented extra roll when the third-six move captures", () => {
    const state = game("4P", { threeSixesVariant: true });
    placeAt(state, "red", 0, 0);
    finish(state, "red", [1, 2, 3]);
    placeAt(state, "green", 0, 6);
    state.turn.consecutiveSixes = 2;
    const moved = completePendingMove(roll(state, 6));
    expect(token(moved, "green", 0).state).toBe("base");
    expect(moved.turn.currentPlayerId).toBe("p-red");
    expect(moved.phase).toBe("idle");
  });

  it("grants an extra roll after completing a token", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 55);
    const moved = completePendingMove(roll(state, 1));
    expect(token(moved, "red", 0).state).toBe("finished");
    expect(moved.turn.currentPlayerId).toBe("p-red");
    expect(moved.phase).toBe("idle");
  });

  it("does not waste a bonus roll after a non-team player finishes every token", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 55);
    finish(state, "red", [1, 2, 3]);
    const moved = completePendingMove(roll(state, 1));
    expect(moved.players.find((player) => player.color === "red")?.finished).toBe(true);
    expect(moved.turn.currentPlayerId).toBe("p-green");
  });

  it("lets a finished 2v2 player use the bonus roll for their teammate", () => {
    const state = game("2V2");
    placeAtSteps(state, "red", 0, 55);
    finish(state, "red", [1, 2, 3]);
    const moved = completePendingMove(roll(state, 1));
    expect(moved.turn.currentPlayerId).toBe("p-red");
    expect(moved.turn.actingForTeammate).toBe(true);
  });

  it("ends a two-player game when the winning player's fourth token arrives", () => {
    const state = game("2P");
    placeAtSteps(state, "red", 0, 55);
    finish(state, "red", [1, 2, 3]);
    const moved = completePendingMove(roll(state, 1));
    expect(moved.phase).toBe("over");
    expect(moved.activeModal).toBe("GAME_OVER");
    expect(moved.players.find((player) => player.color === "red")?.finishRank).toBe(1);
  });

  it("ends a 2v2 game when all eight team tokens are home", () => {
    const state = game("2V2");
    placeAtSteps(state, "red", 0, 55);
    finish(state, "red", [1, 2, 3]);
    finish(state, "yellow", [0, 1, 2, 3]);
    const moved = completePendingMove(roll(state, 1));
    expect(moved.phase).toBe("over");
    expect(moved.activeModal).toBe("GAME_OVER");
    expect(moved.winnerTeam).toBe("A");
  });
});

describe("gameplay matrix: custom-rule combinations", () => {
  it("Second Lap off enters home; Second Lap on offers a deterministic choice", () => {
    const standard = game();
    placeAtSteps(standard, "red", 0, 50);
    expect(roll(standard, 2).activeModal).toBe("NONE");

    const custom = game("4P", { secondLap: true });
    placeAtSteps(custom, "red", 0, 50);
    const rolled = roll(custom, 2);
    expect(rolled.activeModal).toBe("SECOND_LAP_CHOICE");
    expect(canContinueSecondLap(rolled, token(rolled, "red", 0), 2)).toBe(true);

    const continued = completePendingMove(reduce(rolled, { type: "CHOOSE_CONTINUE_LAP" }));
    expect(token(continued, "red", 0)).toMatchObject({
      steps: 52,
      state: "common",
      lap: 1,
      secondLapUsed: true,
    });
  });

  it("allows a Second Lap route that crosses an enemy stack", () => {
    const state = game("4P", { secondLap: true });
    placeAtSteps(state, "red", 0, 50);
    placeAt(state, "green", 0, 1);
    placeAt(state, "green", 1, 1);
    const rolled = roll(state, 3);
    expect(canContinueSecondLap(rolled, token(rolled, "red", 0), 3)).toBe(true);
    expect(reduce(rolled, { type: "CHOOSE_CONTINUE_LAP" })).not.toBe(rolled);

    const entered = completePendingMove(reduce(rolled, { type: "CHOOSE_ENTER_HOME" }));
    expect(token(entered, "red", 0)).toMatchObject({ steps: 53, state: "home_stretch" });
  });

  it("Cut Reward offers every legal board token for its six-space option", () => {
    const state = game("4P", { cutReward: true });
    placeAt(state, "red", 0, 0);
    placeAt(state, "red", 1, 10);
    placeAt(state, "green", 0, 1);

    let moved = roll(state, 1);
    moved = reduce(moved, { type: "SELECT_TOKEN", tokenId: "red-0" });
    moved = completePendingMove(moved);
    expect(moved.activeModal).toBe("CUT_REWARD");

    moved = reduce(moved, { type: "CUT_MOVE6" });
    expect(moved.phase).toBe("select");
    expect(moved.legalMoves.map((move) => move.tokenId).sort()).toEqual(["red-0", "red-1"]);

    moved = reduce(moved, { type: "SELECT_TOKEN", tokenId: "red-1" });
    moved = completePendingMove(moved);
    expect(token(moved, "red", 1).steps).toBe(16);
    expect(moved.turn.currentPlayerId).toBe("p-red");
  });

  it("Cut Reward can release a legal base token", () => {
    const state = game("4P", { cutReward: true });
    placeAt(state, "red", 0, 0);
    placeAt(state, "green", 0, 1);
    let moved = completePendingMove(roll(state, 1));
    expect(moved.activeModal).toBe("CUT_REWARD");

    moved = reduce(moved, { type: "CUT_RELEASE" });
    expect(token(moved, "red", 1)).toMatchObject({ state: "common", steps: 0 });
    expect(moved.turn.currentPlayerId).toBe("p-red");
  });

  it("Cut Reward can convert a capture into exactly one extra roll", () => {
    const state = game("4P", { cutReward: true });
    placeAt(state, "red", 0, 0);
    placeAt(state, "green", 0, 1);
    let moved = completePendingMove(roll(state, 1));
    moved = reduce(moved, { type: "CUT_EXTRA_ROLL" });
    expect(moved.turn.currentPlayerId).toBe("p-red");
    expect(moved.phase).toBe("idle");
    expect(moved.turn.owedExtraRoll).toBe(false);
  });

  it("combines a third-six capture, Cut Reward, and the original bonus exactly once", () => {
    const state = game("4P", { cutReward: true, threeSixesVariant: true });
    placeAt(state, "red", 0, 0);
    finish(state, "red", [1, 2, 3]);
    placeAt(state, "green", 0, 6);
    state.turn.consecutiveSixes = 2;

    let moved = completePendingMove(roll(state, 6));
    expect(moved.activeModal).toBe("CUT_REWARD");
    moved = reduce(moved, { type: "CUT_MOVE6" });
    moved = completePendingMove(moved);
    expect(moved.turn.currentPlayerId).toBe("p-red");
    expect(moved.turn.owedExtraRoll).toBe(false);
    expect(moved.phase).toBe("idle");
  });
});

describe("gameplay matrix: reducer and UI source-of-truth safeguards", () => {
  it("revalidates a selected token instead of trusting stale UI move data", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 4);
    const rolled = roll(state, 6);
    rolled.legalMoves = [{ tokenId: "green-0", kind: "move" }];
    expect(reduce(rolled, { type: "SELECT_TOKEN", tokenId: "green-0" })).toBe(rolled);
  });

  it("recomputes legal moves when hydrating a saved selection", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 4);
    state.phase = "select";
    state.turn.diceValue = 6;
    state.legalMoves = [{ tokenId: "red-1", kind: "release" }];
    const hydrated = reduce(game(), { type: "HYDRATE", state });
    expect(hydrated.legalMoves).toEqual(getLegalMoves(hydrated, 6));
    expect(hydrated.legalMoves).toHaveLength(4);
  });

  it("ignores modal actions outside their matching modal", () => {
    const state = game();
    expect(reduce(state, { type: "CHOOSE_ENTER_HOME" })).toBe(state);
    expect(reduce(state, { type: "CHOOSE_CONTINUE_LAP" })).toBe(state);
    expect(reduce(state, { type: "CUT_RELEASE" })).toBe(state);
    expect(reduce(state, { type: "CUT_MOVE6" })).toBe(state);
    expect(reduce(state, { type: "CUT_EXTRA_ROLL" })).toBe(state);
  });

  it("keeps the Cut Reward modal open when an unavailable reward is dispatched", () => {
    const state = game("4P", { cutReward: true });
    for (let index = 0; index < 4; index += 1) placeAtSteps(state, "red", index, 55);
    state.phase = "modal";
    state.activeModal = "CUT_REWARD";
    expect(reduce(state, { type: "CUT_RELEASE" })).toBe(state);
    expect(reduce(state, { type: "CUT_MOVE6" })).toBe(state);
  });

  it("ignores additional rolls while selecting or moving", () => {
    const state = game();
    placeAtSteps(state, "red", 0, 4);
    const selecting = roll(state, 6);
    expect(reduce(selecting, { type: "ROLL", value: 5 })).toBe(selecting);

    const moving = reduce(selecting, { type: "SELECT_TOKEN", tokenId: "red-0" });
    expect(reduce(moving, { type: "ROLL", value: 5 })).toBe(moving);
  });

  it("always generates a die value in the inclusive 1–6 range", () => {
    for (let index = 0; index < 500; index += 1) {
      const value = rollDie();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  });
});
