import { describe, expect, it } from "vitest";

import { COLOR_ORDER, SAFE_SQUARES, START_OFFSET, boardLayoutOf, geometryColor } from "./board";
import {
  analyzeTrackCell,
  normalizeContests,
  resolveContestDeparture,
  resolveContestLanding,
} from "./contests";
import { createGame, DEFAULT_HOUSE_RULES, getLegalMoves } from "./engine";
import { gameReducer } from "./store";
import type { Color, GameState, HouseRules, Mode, Token } from "./types";

function game(mode: Mode = "4P", rules: Partial<HouseRules> = {}) {
  return createGame(mode, { ...DEFAULT_HOUSE_RULES, ...rules }, {});
}

function place(state: GameState, color: Color, slot: number, square: number): Token {
  const token = state.tokens.find((candidate) => candidate.id === `${color}-${slot}`)!;
  Object.assign(token, {
    state: "common",
    steps: (square - START_OFFSET[color] + 52) % 52,
    lap: 0,
    secondLapUsed: false,
  });
  return token;
}

function finish(state: GameState) {
  let next = state;
  while (next.pending && next.pending.remaining > 0) next = gameReducer(next, { type: "HOP" });
  if (next.pending?.finishStage === "enter")
    next = gameReducer(next, { type: "ADVANCE_FINISH", tokenId: next.pending.tokenId });
  return gameReducer(next, { type: "FINISH_MOVE" });
}

describe("authoritative contested stacks", () => {
  it("captures a lone unsafe defender immediately", () => {
    const state = game();
    place(state, "red", 0, 5);
    const attacker = place(state, "green", 0, 5);
    const result = resolveContestLanding(state, attacker, "p-green");
    expect(result?.captured).toEqual(["red-0"]);
    expect(result?.survivorId).toBe("green-0");
    expect(state.tokens.find((token) => token.id === "red-0")?.state).toBe("base");
    expect(state.lastCapture?.tokens).toEqual([{ id: "red-0", color: "red" }]);
  });

  it("requires equal strength and leaves only the final attacker", () => {
    const state = game();
    place(state, "red", 0, 5);
    place(state, "red", 1, 5);
    const first = place(state, "green", 0, 5);
    expect(resolveContestLanding(state, first, "p-green")).toBeNull();
    expect(analyzeTrackCell(state, 5).attackers.map((token) => token.id)).toEqual(["green-0"]);

    const final = place(state, "green", 1, 5);
    const result = resolveContestLanding(state, final, "p-green");
    expect(result?.captured.sort()).toEqual(["green-0", "red-0", "red-1"]);
    expect(result?.survivorId).toBe("green-1");
    expect(state.tokens.find((token) => token.id === "green-0")?.state).toBe("base");
    expect(state.tokens.find((token) => token.id === "green-1")?.state).toBe("common");
    expect(state.trackContests?.["5"]).toBeUndefined();
  });

  it("combines different FFA attackers and credits the final arrival", () => {
    const state = game();
    place(state, "red", 0, 5);
    place(state, "red", 1, 5);
    expect(resolveContestLanding(state, place(state, "green", 0, 5), "p-green")).toBeNull();
    const result = resolveContestLanding(state, place(state, "yellow", 0, 5), "p-yellow");
    expect(result?.creditedPlayerId).toBe("p-yellow");
    expect(result?.survivorId).toBe("yellow-0");
    expect(result?.captured.sort()).toEqual(["green-0", "red-0", "red-1"]);
  });

  it("derives a strengthened defender threshold from live occupancy", () => {
    const state = game();
    place(state, "red", 0, 5);
    place(state, "red", 1, 5);
    resolveContestLanding(state, place(state, "green", 0, 5), "p-green");
    expect(resolveContestLanding(state, place(state, "red", 2, 5), "p-red")).toBeNull();
    expect(resolveContestLanding(state, place(state, "green", 1, 5), "p-green")).toBeNull();
    const result = resolveContestLanding(state, place(state, "green", 2, 5), "p-green");
    expect(result?.captured).toHaveLength(5);
    expect(result?.survivorId).toBe("green-2");
  });

  it("recomputes after departures and uses newest remaining attacker", () => {
    const state = game();
    place(state, "red", 0, 5);
    place(state, "red", 1, 5);
    resolveContestLanding(state, place(state, "green", 0, 5), "p-green");
    place(state, "red", 0, 6);
    const result = resolveContestDeparture(state, 5);
    expect(result?.trigger).toBe("departure");
    expect(result?.creditedPlayerId).toBe("p-green");
    expect(result?.survivorId).toBe("green-0");
    expect(result?.captured).toEqual(["red-1"]);
  });

  it("promotes the oldest attacker if every original defender leaves", () => {
    const state = game();
    place(state, "red", 0, 5);
    place(state, "red", 1, 5);
    place(state, "red", 2, 5);
    resolveContestLanding(state, place(state, "green", 0, 5), "p-green");
    resolveContestLanding(state, place(state, "yellow", 0, 5), "p-yellow");
    for (let slot = 0; slot < 3; slot++) place(state, "red", slot, 6 + slot);
    const result = resolveContestDeparture(state, 5);
    expect(result?.survivorId).toBe("yellow-0");
    expect(result?.creditedPlayerId).toBe("p-yellow");
    expect(result?.captured).toEqual(["green-0"]);
  });

  it("combines teammates into one side and never cuts allied tokens", () => {
    const state = game("2V2");
    place(state, "red", 0, 5);
    place(state, "yellow", 0, 5);
    expect(
      resolveContestLanding(
        state,
        state.tokens.find((token) => token.id === "yellow-0")!,
        "p-yellow",
      ),
    ).toBeNull();
    expect(resolveContestLanding(state, place(state, "green", 0, 5), "p-green")).toBeNull();
    const result = resolveContestLanding(state, place(state, "blue", 0, 5), "p-blue");
    expect(result?.creditedPlayerId).toBe("p-blue");
    expect(result?.survivorId).toBe("blue-0");
    expect(result?.captured.sort()).toEqual(["green-0", "red-0", "yellow-0"]);
  });

  it.each([...SAFE_SQUARES])("never contests or captures on safe square %s", (square) => {
    const state = game();
    place(state, "red", 0, square);
    place(state, "red", 1, square);
    const attacker = place(state, "green", 0, square);
    expect(resolveContestLanding(state, attacker, "p-green")).toBeNull();
    expect(state.trackContests?.[String(square)]).toBeUndefined();
    expect(state.tokens.filter((token) => token.state === "common")).toHaveLength(3);
  });

  it("keeps moves legal before, onto, and beyond an occupied stack", () => {
    const state = game();
    state.turn.currentPlayerId = "p-red";
    place(state, "red", 0, 0);
    place(state, "green", 0, 3);
    place(state, "green", 1, 3);
    for (const dice of [1, 2, 3, 4, 5, 6])
      expect(getLegalMoves(state, dice).map((move) => move.tokenId)).toContain("red-0");
  });

  it("round-trips active contest roles and arrival order", () => {
    const state = game();
    place(state, "red", 0, 5);
    place(state, "red", 1, 5);
    resolveContestLanding(state, place(state, "green", 0, 5), "p-green");
    const restored = normalizeContests(JSON.parse(JSON.stringify(state)) as GameState);
    expect(restored.trackContests?.["5"]).toEqual(state.trackContests?.["5"]);
    expect(analyzeTrackCell(restored, 5).defenders).toHaveLength(2);
    expect(analyzeTrackCell(restored, 5).attackers).toHaveLength(1);
  });

  it("handles a four-token defence and cuts every earlier contributor", () => {
    const state = game();
    for (let slot = 0; slot < 4; slot++) place(state, "red", slot, 5);
    const arrivals: [Color, number][] = [
      ["green", 0],
      ["yellow", 0],
      ["blue", 0],
      ["green", 1],
    ];
    for (const [index, [color, slot]] of arrivals.entries()) {
      const result = resolveContestLanding(state, place(state, color, slot, 5), `p-${color}`);
      if (index < 3) expect(result).toBeNull();
      else {
        expect(result?.survivorId).toBe("green-1");
        expect(result?.captured).toHaveLength(7);
      }
    }
  });

  it("removes a departing challenger from strength and arrival order", () => {
    const state = game();
    for (let slot = 0; slot < 3; slot++) place(state, "red", slot, 5);
    resolveContestLanding(state, place(state, "green", 0, 5), "p-green");
    resolveContestLanding(state, place(state, "yellow", 0, 5), "p-yellow");
    place(state, "green", 0, 6);
    expect(resolveContestDeparture(state, 5)).toBeNull();
    expect(state.trackContests?.["5"]?.attackerArrivals.map((entry) => entry.tokenId)).toEqual([
      "yellow-0",
    ]);
    expect(resolveContestLanding(state, place(state, "blue", 0, 5), "p-blue")).toBeNull();
    expect(analyzeTrackCell(state, 5).attackers).toHaveLength(2);
  });

  it.each(
    COLOR_ORDER.flatMap((first) =>
      COLOR_ORDER.filter((second) => second !== first).map((second) => ({ first, second })),
    ),
  )("uses remapped physical squares for ordered 2P seats $first/$second", ({ first, second }) => {
    const state = createGame("2P", DEFAULT_HOUSE_RULES, {}, [first, second]);
    const layout = boardLayoutOf(state.gameConfig);
    const physical = 5;
    const put = (color: Color, slot: number) => {
      const token = state.tokens.find((candidate) => candidate.id === `${color}-${slot}`)!;
      Object.assign(token, {
        state: "common",
        steps: (physical - START_OFFSET[geometryColor(color, layout)] + 52) % 52,
      });
      return token;
    };
    put(second, 0);
    put(second, 1);
    expect(resolveContestLanding(state, put(first, 0), `p-${first}`)).toBeNull();
    expect(analyzeTrackCell(state, physical).defenders.map((token) => token.color)).toEqual([
      second,
      second,
    ]);
    expect(analyzeTrackCell(state, physical).attackers[0]?.color).toBe(first);
  });
});

describe("deferred departure rewards", () => {
  function departureGame(cutReward: boolean) {
    let state = game("4P", { cutReward });
    state.turn.currentPlayerId = "p-red";
    place(state, "red", 0, 5);
    place(state, "red", 1, 5);
    resolveContestLanding(state, place(state, "green", 0, 5), "p-green");
    state = gameReducer(state, { type: "ROLL", value: 2 });
    state = gameReducer(state, { type: "SELECT_TOKEN", tokenId: "red-0" });
    return finish(state);
  }

  it("gives the waiting attacker a bonus before its normal turn", () => {
    let state = departureGame(false);
    expect(state.turn.currentPlayerId).toBe("p-green");
    expect(state.turn.normalTurnPending).toBe(true);
    expect(state.deferredCaptureRewards).toEqual([]);
    expect(state.phase).toBe("idle");
    expect(state.tokens.find((token) => token.id === "green-0")?.state).toBe("common");
    state = gameReducer(state, { type: "ROLL", value: 1 });
    state = finish(state);
    expect(state.turn.currentPlayerId).toBe("p-green");
    expect(state.turn.normalTurnPending).toBe(false);
    expect(state.phase).toBe("idle");
  });

  it("opens the existing Cut Reward chooser for a deferred bonus", () => {
    const state = departureGame(true);
    expect(state.turn.currentPlayerId).toBe("p-green");
    expect(state.turn.normalTurnPending).toBe(true);
    expect(state.activeModal).toBe("CUT_REWARD");
    expect(state.modalContext["deferred"]).toBe(true);
  });
});
