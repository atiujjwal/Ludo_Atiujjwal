import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LudoBoard } from "@/components/ludo/LudoBoard";
import { BoardArtwork } from "@/components/ludo/BoardArtwork";
import {
  BASE_ORIGIN,
  BASE_SLOTS,
  COLOR_ORDER,
  DEFAULT_BOARD_LAYOUT,
  FINISH_CELL,
  HOME_COLUMN,
  TRACK,
  absoluteIndex,
  boardLayoutOf,
  cellForToken,
  geometryColor,
  junctionOf,
  maxStepsOf,
} from "./board";
import {
  blockades,
  canContinueSecondLap,
  createGame,
  DEFAULT_HOUSE_RULES,
  getLegalMoves,
  pathSquares,
  playerAtCorner,
} from "./engine";
import { destinations, positionTokens } from "./presentation";
import { saveGame, loadGame } from "./persistence";
import { gameReducer } from "./store";
import type { Color, GameState } from "./types";

const pairs = COLOR_ORDER.flatMap((first) =>
  COLOR_ORDER.filter((second) => first !== second).map((second) => ({ first, second })),
);
const game = (first: Color, second: Color) =>
  createGame("2P", { ...DEFAULT_HOUSE_RULES, secondLap: true }, {}, [first, second]);
function place(state: GameState, color: Color, index: number, square: number) {
  const token = state.tokens.find((t) => t.id === `${color}-${index}`)!;
  token.steps = (square - absoluteIndex(color, 0, boardLayoutOf(state.gameConfig)) + 52) % 52;
  token.state = "common";
  return token;
}
function complete(state: GameState) {
  while (state.pending && state.pending.remaining > 0) state = gameReducer(state, { type: "HOP" });
  if (state.pending?.finishStage === "enter")
    state = gameReducer(state, { type: "ADVANCE_FINISH", tokenId: state.pending.tokenId });
  return gameReducer(state, { type: "FINISH_MOVE" });
}
afterEach(() => vi.unstubAllGlobals());

describe("all ordered two-player colours share diagonal geometry", () => {
  it.each(pairs)(
    "$first then $second has unique opposite houses, starts and panels",
    ({ first, second }) => {
      const state = game(first, second);
      const layout = boardLayoutOf(state.gameConfig);
      expect(layout.colorToCorner[first]).toBe("tl");
      expect(layout.colorToCorner[second]).toBe("br");
      expect(new Set(Object.values(layout.colorToCorner)).size).toBe(4);
      expect(Object.isFrozen(layout)).toBe(true);
      expect(Object.isFrozen(layout.colorToCorner)).toBe(true);
      expect(Object.isFrozen(layout.cornerToColor)).toBe(true);
      expect(boardLayoutOf(state.gameConfig)).toBe(layout);
      expect(playerAtCorner(state, "tl")?.color).toBe(first);
      expect(playerAtCorner(state, "br")?.color).toBe(second);
      expect(playerAtCorner(state, "tr")).toBeNull();
      expect(playerAtCorner(state, "bl")).toBeNull();
      expect(absoluteIndex(first, 0, layout)).toBe(0);
      expect(absoluteIndex(second, 0, layout)).toBe(26);
      const positioned = positionTokens(state.tokens, null, layout);
      expect(positioned.find((p) => p.token.id === `${first}-0`)?.cell).toEqual(BASE_SLOTS[0]);
      expect(positioned.find((p) => p.token.id === `${second}-0`)?.cell).toEqual({
        col: 9 + BASE_SLOTS[0]!.col,
        row: 9 + BASE_SLOTS[0]!.row,
      });
      const html = renderToStaticMarkup(createElement(BoardArtwork, { layout }));
      expect(html).toMatch(
        new RegExp(`class="royal-zone" data-color="${first}" style="left:0%;top:0%`),
      );
      expect(html).toMatch(
        new RegExp(`class="royal-zone" data-color="${second}" style="left:60%;top:60%`),
      );
      const before = JSON.stringify(state);
      const rendered = renderToStaticMarkup(
        createElement(LudoBoard, {
          state,
          activeColor: first,
          selectableTokenIds: [],
          onSelect: () => {},
        }),
      );
      for (const item of positioned) {
        const style = rendered.match(
          new RegExp(`data-token-id="${item.token.id}"[^>]*style="([^"]+)"`),
        )?.[1];
        expect(style?.replace(/\s/g, "")).toBe(
          `transform:translate(${item.cell.col * 100}%,${item.cell.row * 100}%)`,
        );
      }
      expect(JSON.stringify(state)).toBe(before);
    },
  );

  it.each(
    pairs.flatMap((pair) =>
      [pair.first, pair.second].flatMap((color) => [0, 1].map((lap) => ({ ...pair, color, lap }))),
    ),
  )(
    "$first/$second: $color release, full lap $lap, five cells and settled home",
    ({ first, second, color, lap }) => {
      let state = game(first, second);
      const layout = boardLayoutOf(state.gameConfig);
      state.turn.currentPlayerId = `p-${color}`;
      const id = `${color}-0`;
      state = gameReducer(state, { type: "ROLL", value: 6 });
      state = gameReducer(state, { type: "SELECT_TOKEN", tokenId: id });
      state = complete(state);
      let previous = cellForToken(
        state.tokens.find((t) => t.id === id)!,
        0,
        layout,
      );
      expect(previous).toEqual(TRACK[absoluteIndex(color, 0, layout)]);
      const finish = maxStepsOf({ lap });
      for (let step = 1; step <= finish; step++) {
        if (state.turn.currentPlayerId !== `p-${color}`)
          state = gameReducer(state, { type: "ROLL", value: 2 });
        state = gameReducer(state, { type: "ROLL", value: 1 });
        if (state.activeModal === "SECOND_LAP_CHOICE")
          state = gameReducer(state, { type: lap ? "CHOOSE_CONTINUE_LAP" : "CHOOSE_ENTER_HOME" });
        state = gameReducer(state, { type: "HOP" });
        const token = state.tokens.find((t) => t.id === id)!;
        const cell = cellForToken(token, 0, layout);
        expect(token.steps).toBe(step);
        expect(
          Math.max(Math.abs(cell.col - previous.col), Math.abs(cell.row - previous.row)),
        ).toBeLessThanOrEqual(1);
        const junction = junctionOf(token);
        if (step >= junction && step < finish)
          expect(cell).toEqual(HOME_COLUMN[geometryColor(color, layout)][step - junction]);
        if (step === finish) {
          expect(token.state).toBe("home_stretch");
          expect(state.pending?.finishStage).toBe("enter");
          expect(cell).toEqual(FINISH_CELL[geometryColor(color, layout)]);
          expect(gameReducer(state, { type: "FINISH_MOVE" })).toEqual(state);
        }
        state = complete(state);
        previous = cell;
      }
      expect(state.tokens.find((t) => t.id === id)?.state).toBe("finished");
    },
  );

  it.each(pairs)(
    "$first/$second previews exact rolls and rejects overshoots on both laps",
    ({ first, second }) => {
      for (const color of [first, second])
        for (const lap of [0, 1])
          for (let dice = 1; dice <= 6; dice++) {
            const state = game(first, second);
            state.turn.currentPlayerId = `p-${color}`;
            state.turn.diceValue = dice;
            state.phase = "select";
            const token = state.tokens.find((t) => t.id === `${color}-0`)!;
            Object.assign(token, {
              lap,
              secondLapUsed: true,
              steps: maxStepsOf({ lap }) - dice,
              state: "home_stretch",
            });
            expect(getLegalMoves(state, dice).some((m) => m.tokenId === token.id)).toBe(true);
            expect(
              destinations(state).find((d) => d.tokenId === token.id && !d.alternative)?.cell,
            ).toEqual(FINISH_CELL[geometryColor(color, boardLayoutOf(state.gameConfig))]);
            token.steps++;
            expect(getLegalMoves(state, dice).some((m) => m.tokenId === token.id)).toBe(false);
          }
    },
  );

  it.each(pairs)(
    "$first/$second captures, safe stacks and contests use physical shared squares",
    ({ first, second }) => {
      let state = game(first, second);
      const firstToken = place(state, first, 0, 5);
      place(state, second, 0, 6);
      expect(pathSquares(firstToken, 1, boardLayoutOf(state.gameConfig))).toEqual([6]);
      state = gameReducer(state, { type: "ROLL", value: 1 });
      state = complete(state);
      expect(state.tokens.find((t) => t.id === `${second}-0`)?.state).toBe("base");
      expect(state.lastCapture?.square).toBe(6);
      expect(state.lastCapture?.tokens[0]?.color).toBe(second);
      expect(state.turn.currentPlayerId).toBe(`p-${first}`);
      const safe = game(first, second);
      place(safe, first, 0, 7);
      place(safe, second, 0, 8);
      place(safe, second, 1, 8);
      expect(blockades(safe).has(8)).toBe(false);
      const joined = complete(gameReducer(safe, { type: "ROLL", value: 1 }));
      expect(joined.lastCapture).toBeFalsy();
      expect(
        positionTokens(joined.tokens, null, boardLayoutOf(joined.gameConfig)).filter(
          (p) => p.key === `${TRACK[8]!.row},${TRACK[8]!.col}`,
        ),
      ).toHaveLength(3);
      const stacked = game(first, second);
      place(stacked, first, 0, 5);
      place(stacked, second, 0, 6);
      place(stacked, second, 1, 6);
      expect(blockades(stacked).has(6)).toBe(false);
      expect(getLegalMoves(stacked, 1).map((move) => move.tokenId)).toContain(`${first}-0`);
    },
  );

  it.each(pairs)(
    "$first/$second save, hydrate and rematch retain identities and progress",
    ({ first, second }) => {
      const state = game(first, second);
      Object.assign(state.tokens[0]!, { state: "home_stretch", steps: 54 });
      Object.assign(state.tokens[1]!, { state: "finished", steps: 56 });
      place(state, second, 0, 8);
      place(state, second, 1, 8);
      state.activeModal = "CUT_REWARD";
      state.phase = "modal";
      state.turn.owedExtraRoll = true;
      const values = new Map<string, string>();
      vi.stubGlobal("window", {
        localStorage: {
          getItem: (key: string) => values.get(key),
          setItem: (key: string, value: string) => values.set(key, value),
        },
      });
      saveGame(state);
      const loaded = gameReducer(state, { type: "HYDRATE", state: loadGame()! });
      expect(loaded.tokens).toEqual(state.tokens);
      expect(loaded.players).toEqual(state.players);
      expect(loaded.activeModal).toBe("CUT_REWARD");
      expect(loaded.turn.owedExtraRoll).toBe(true);
      expect(boardLayoutOf(loaded.gameConfig).colorToCorner[first]).toBe("tl");
      expect([...values.keys()]).toEqual(["ludo:save:v1"]);
      const rematch = gameReducer(loaded, { type: "REMATCH" });
      expect(rematch.gameConfig.activeColors).toEqual([first, second]);
      expect(playerAtCorner(rematch, "br")?.color).toBe(second);
    },
  );
});

it("preserves other modes and omitted-layout coordinate callers", () => {
  for (const mode of ["3P", "4P", "2V2"] as const) {
    const state = createGame(mode, DEFAULT_HOUSE_RULES, {});
    expect(boardLayoutOf(state.gameConfig)).toBe(DEFAULT_BOARD_LAYOUT);
    for (const color of COLOR_ORDER) {
      expect(geometryColor(color)).toBe(color);
      expect(
        cellForToken(
          { id: color, color, state: "base", steps: 0, lap: 0, secondLapUsed: false },
          0,
        ),
      ).toEqual({ col: BASE_ORIGIN[color].col + 1.4, row: BASE_ORIGIN[color].row + 1.4 });
    }
  }
});

it("recovers invalid saved choices without losing reward rolls or incrementing six streaks", () => {
  const state = game("green", "blue");
  state.tokens
    .filter((t) => t.color === "green")
    .forEach((t) => Object.assign(t, { state: "home_stretch", steps: 55 }));
  state.phase = "select";
  state.rewardMove = true;
  state.turn.consecutiveSixes = 1;
  state.turn.diceValue = 2;
  const reward = gameReducer(state, { type: "HYDRATE", state });
  expect(reward.phase).toBe("idle");
  expect(reward.turn.currentPlayerId).toBe("p-green");
  expect(reward.turn.owedExtraRoll).toBe(false);
  expect(reward.turn.consecutiveSixes).toBe(1);
  state.rewardMove = false;
  state.activeModal = "SECOND_LAP_CHOICE";
  state.phase = "modal";
  state.modalContext = { tokenId: "green-0", dice: 2, isReward: false };
  const normal = gameReducer(state, { type: "HYDRATE", state });
  expect(normal.activeModal).toBe("NONE");
  expect(normal.turn.currentPlayerId).toBe("p-blue");
});

it("keeps a saved lap choice valid when a stack occupies its route", () => {
  const state = game("green", "blue");
  const token = place(state, "green", 0, 50);
  place(state, "blue", 0, 51);
  place(state, "blue", 1, 51);
  state.phase = "modal";
  state.activeModal = "SECOND_LAP_CHOICE";
  state.turn.diceValue = 1;
  state.modalContext = { tokenId: token.id, dice: 1, isReward: false };
  expect(canContinueSecondLap(state, token, 1)).toBe(true);
  const restored = gameReducer(state, { type: "HYDRATE", state });
  expect(restored.activeModal).toBe("SECOND_LAP_CHOICE");
  expect(getLegalMoves(restored, 1).map((m) => m.tokenId)).toContain(token.id);
});
