import { describe, expect, it } from "vitest";
import {
  COLOR_ORDER,
  FINISH_CELL,
  HOME_COLUMN,
  cellForToken,
  junctionOf,
  maxStepsOf,
} from "./board";
import { createGame, DEFAULT_HOUSE_RULES, getLegalMoves } from "./engine";
import { normalizeHomePath } from "./home-path-migration";
import { positionTokens } from "./presentation";
import { gameReducer } from "./store";

describe("five-cell home journey and guarded settling", () => {
  it.each(COLOR_ORDER)("releases %s and follows the full shared track into its lane", (color) => {
    let state = createGame("4P", DEFAULT_HOUSE_RULES, {});
    state.turn.currentPlayerId = `p-${color}`;
    const id = `${color}-0`;
    const yard = cellForToken(
      state.tokens.find((t) => t.id === id)!,
      0,
    );
    state = gameReducer(state, { type: "ROLL", value: 6 });
    state = gameReducer(state, { type: "SELECT_TOKEN", tokenId: id });
    expect(state.tokens.find((t) => t.id === id)?.steps).toBe(0);
    expect(
      cellForToken(
        state.tokens.find((t) => t.id === id)!,
        0,
      ),
    ).not.toEqual(yard);
    state = gameReducer(state, { type: "FINISH_MOVE" });
    for (let step = 1; step <= 55; step++) {
      // Opponents have no released pieces; their roll of two advances back.
      while (state.turn.currentPlayerId !== `p-${color}`)
        state = gameReducer(state, { type: "ROLL", value: 2 });
      state = gameReducer(state, { type: "ROLL", value: 1 });
      state = gameReducer(state, { type: "HOP" });
      expect(state.tokens.find((t) => t.id === id)?.steps).toBe(step);
      expect(state.tokens.find((t) => t.id === id)?.state).toBe(
        step < 51 ? "common" : "home_stretch",
      );
      state = gameReducer(state, { type: "FINISH_MOVE" });
    }
  });
  it.each(COLOR_ORDER.flatMap((color) => [0, 1].map((lap) => ({ color, lap }))))(
    "$color lap $lap traverses every cell and resolves only after settling",
    ({ color, lap }) => {
      let state = createGame("4P", { ...DEFAULT_HOUSE_RULES, secondLap: true }, {});
      state.turn.currentPlayerId = `p-${color}`;
      const token = state.tokens.find((t) => t.id === `${color}-0`)!;
      Object.assign(token, {
        lap,
        steps: junctionOf({ lap }) - 1,
        state: "common",
        secondLapUsed: lap > 0,
      });
      // Six from the entry junction's predecessor: five lane cells, then home.
      state = gameReducer(state, { type: "ROLL", value: 6 });
      if (state.phase === "select")
        state = gameReducer(state, { type: "SELECT_TOKEN", tokenId: token.id });
      if (state.activeModal === "SECOND_LAP_CHOICE")
        state = gameReducer(state, { type: "CHOOSE_ENTER_HOME" });
      for (const cell of HOME_COLUMN[color]) {
        state = gameReducer(state, { type: "HOP" });
        expect(
          cellForToken(
            state.tokens.find((t) => t.id === token.id)!,
            0,
          ),
        ).toEqual(cell);
      }
      state = gameReducer(state, { type: "HOP" });
      expect(state.pending?.finishStage).toBe("enter");
      expect(state.tokens.find((t) => t.id === token.id)?.state).toBe("home_stretch");
      expect(
        cellForToken(
          state.tokens.find((t) => t.id === token.id)!,
          0,
        ),
      ).toEqual(FINISH_CELL[color]);
      expect(gameReducer(state, { type: "FINISH_MOVE" })).toEqual(state);
      expect(gameReducer(state, { type: "ADVANCE_FINISH", tokenId: "wrong" })).toEqual(state);
      state = gameReducer(state, { type: "ADVANCE_FINISH", tokenId: token.id });
      const settled = positionTokens(state.tokens, state.pending).find(
        (t) => t.token.id === token.id,
      )!;
      expect(state.pending?.finishStage).toBe("settle");
      state = gameReducer(state, { type: "FINISH_MOVE" });
      expect(state.tokens.find((t) => t.id === token.id)?.state).toBe("finished");
      expect(positionTokens(state.tokens).find((t) => t.token.id === token.id)?.offset).toEqual(
        settled.offset,
      );
      expect(state.turn.currentPlayerId).toBe(`p-${color}`);
      expect(gameReducer(state, { type: "FINISH_MOVE" })).toEqual(state);
    },
  );
  it.each(COLOR_ORDER)("validates exact rolls 1–6 and both laps for %s", (color) => {
    for (const lap of [0, 1])
      for (let dice = 1; dice <= 6; dice++) {
        const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
        state.turn.currentPlayerId = `p-${color}`;
        const token = state.tokens.find((t) => t.id === `${color}-0`)!;
        Object.assign(token, { lap, state: "home_stretch" });
        token.steps = maxStepsOf(token) - dice;
        expect(getLegalMoves(state, dice).some((m) => m.tokenId === token.id)).toBe(true);
        token.steps++;
        expect(getLegalMoves(state, dice).some((m) => m.tokenId === token.id)).toBe(false);
      }
  });
  it("keeps earlier finishers fixed when another finishes", () => {
    const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
    const reds = state.tokens.filter((t) => t.color === "red");
    Object.assign(reds[2]!, { state: "finished", steps: 56 });
    const before = positionTokens(state.tokens).find((t) => t.token.id === reds[2]!.id);
    Object.assign(reds[0]!, { state: "finished", steps: 56 });
    expect(positionTokens(state.tokens).find((t) => t.token.id === reds[2]!.id)?.offset).toEqual(
      before?.offset,
    );
  });
  it("delays victory and ranking until the final token settles", () => {
    let state = createGame("2P", DEFAULT_HOUSE_RULES, {});
    state.tokens
      .filter((t) => t.color === "red")
      .forEach((t) => Object.assign(t, { steps: 56, state: "finished" }));
    Object.assign(state.tokens[0]!, { steps: 55, state: "home_stretch" });
    state = gameReducer(state, { type: "ROLL", value: 1 });
    state = gameReducer(state, { type: "HOP" });
    expect(state.phase).toBe("moving");
    expect(state.players[0]!.finishRank).toBeNull();
    expect(state.activeModal).toBe("NONE");
    state = gameReducer(state, { type: "ADVANCE_FINISH", tokenId: "red-0" });
    expect(state.players[0]!.finished).toBe(false);
    state = gameReducer(state, { type: "FINISH_MOVE" });
    expect(state.phase).toBe("over");
    expect(state.activeModal).toBe("GAME_OVER");
    expect(state.players[0]!.finishRank).toBe(1);
  });
  it("settles a reward-six finish before consuming its one earned roll", () => {
    let state = createGame("4P", { ...DEFAULT_HOUSE_RULES, cutReward: true }, {});
    Object.assign(state.tokens[0]!, { steps: 50, state: "common" });
    state.phase = "modal";
    state.activeModal = "CUT_REWARD";
    state.turn.owedExtraRoll = true;
    state = gameReducer(state, { type: "CUT_MOVE6" });
    for (let i = 0; i < 6; i++) state = gameReducer(state, { type: "HOP" });
    expect(state.pending?.finishStage).toBe("enter");
    expect(state.tokens[0]!.state).toBe("home_stretch");
    state = gameReducer(state, { type: "ADVANCE_FINISH", tokenId: "red-0" });
    state = gameReducer(state, { type: "FINISH_MOVE" });
    expect(state.tokens[0]!.state).toBe("finished");
    expect(state.turn.currentPlayerId).toBe("p-red");
    expect(state.turn.owedExtraRoll).toBe(false);
    expect(state.phase).toBe("idle");
  });
});

describe("legacy home-path saves", () => {
  it.each([0, 1])("converts lap %s once without losing ranks or pending rewards", (lap) => {
    const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
    delete state.homePathVersion;
    state.activeModal = "CUT_REWARD";
    state.turn.owedExtraRoll = true;
    state.tokens.forEach((token, i) => {
      token.lap = lap;
      token.steps = junctionOf(token) + (i % 4 === 0 ? 5 : i % 4);
      token.state = "home_stretch";
    });
    const finished = state.tokens[1]!;
    finished.state = "finished";
    finished.steps = junctionOf(finished) + 6;
    state.players[0]!.finishRank = 1;
    normalizeHomePath(state);
    expect(state.tokens[0]!.steps).toBe(maxStepsOf(state.tokens[0]!) - 1);
    expect(finished.steps).toBe(maxStepsOf(finished));
    expect(state.players[0]!.finishRank).toBe(1);
    expect(state.tokens[2]!.steps).toBe(junctionOf(state.tokens[2]!) + 2);
    expect(state.activeModal).toBe("CUT_REWARD");
    expect(state.turn.owedExtraRoll).toBe(true);
    const snapshot = structuredClone(state);
    expect(normalizeHomePath(state)).toEqual(snapshot);
    expect(gameReducer(state, { type: "HYDRATE", state }).tokens).toEqual(snapshot.tokens);
  });
});
