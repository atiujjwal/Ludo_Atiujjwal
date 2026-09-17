import { describe, expect, it } from "vitest";
import { createGame, DEFAULT_HOUSE_RULES } from "./engine";
import { maxStepsOf } from "./board";
import { gameReducer } from "./store";
import type { GameState } from "./types";

function legacyComplete(state: GameState) {
  while (state.pending && state.pending.remaining > 0) state = gameReducer(state, { type: "HOP" });
  if (state.pending?.finishStage === "enter")
    state = gameReducer(state, { type: "ADVANCE_FINISH", tokenId: state.pending.tokenId });
  return gameReducer(state, { type: "FINISH_MOVE" });
}

function atomicComplete(state: GameState) {
  const pending = state.pending!;
  const token = state.tokens.find((candidate) => candidate.id === pending.tokenId)!;
  return gameReducer(state, {
    type: "COMPLETE_MOVE",
    tokenId: token.id,
    fromSteps: token.steps,
    remaining: pending.remaining,
    createdAt: state.createdAt,
  });
}

describe("single-commit movement", () => {
  it.each([
    ["ordinary", 8, 6],
    ["capture", 0, 1],
    ["finish", 55, 1],
  ] as const)("matches the established hop replay for %s", (_kind, steps, dice) => {
    let state = createGame("2P", { ...DEFAULT_HOUSE_RULES, cutReward: true }, {}, ["red", "green"]);
    const token = state.tokens.find((candidate) => candidate.id === "red-0")!;
    Object.assign(token, {
      state: steps >= 51 ? "home_stretch" : "common",
      steps,
      lap: 0,
    });
    if (_kind === "capture") {
      const victim = state.tokens.find((candidate) => candidate.id === "green-0")!;
      Object.assign(victim, { state: "common", steps: 27, lap: 0 });
    }
    state = gameReducer(state, { type: "ROLL", value: dice });
    if (state.phase === "select")
      state = gameReducer(state, { type: "SELECT_TOKEN", tokenId: token.id });
    expect(state.phase).toBe("moving");
    expect(atomicComplete(state)).toEqual(legacyComplete(state));
  });

  it("rejects stale or duplicate completion callbacks", () => {
    let state = createGame("2P", DEFAULT_HOUSE_RULES, {}, ["red", "green"]);
    state.tokens[0]!.state = "common";
    state = gameReducer(state, { type: "ROLL", value: 1 });
    const pending = state.pending!;
    const stale = gameReducer(state, {
      type: "COMPLETE_MOVE",
      tokenId: pending.tokenId,
      fromSteps: 99,
      remaining: pending.remaining,
      createdAt: state.createdAt,
    });
    expect(stale).toBe(state);
    const completed = atomicComplete(state);
    expect(atomicComplete(state)).toEqual(completed);
  });
});
