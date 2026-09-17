import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LudoBoard } from "@/components/ludo/LudoBoard";
import { BoardArtwork } from "@/components/ludo/BoardArtwork";
import { Dice } from "@/components/ludo/Dice";
import {
  COLOR_ORDER,
  FINISH_CELL,
  HOME_COLUMN,
  SAFE_SQUARES,
  START_OFFSET,
  TRACK,
  absoluteIndex,
  cellForToken,
  maxStepsOf,
} from "./board";
import { createGame, DEFAULT_HOUSE_RULES, getLegalMoves } from "./engine";
import { resolveContestLanding } from "./contests";
import { destinations, stackPlacement } from "./presentation";
import type { Color, GameState } from "./types";

function selecting(color: Color = "red", dice = 1) {
  const state = createGame("4P", { ...DEFAULT_HOUSE_RULES, secondLap: true }, {});
  state.turn.currentPlayerId = "p-" + color;
  state.turn.diceValue = dice;
  state.phase = "select";
  return state;
}
function place(state: GameState, color: Color, index: number, steps: number) {
  const token = state.tokens.find((t) => t.id === color + "-" + index)!;
  Object.assign(token, { steps, state: steps >= 51 ? "home_stretch" : "common" });
  return token;
}
const renderBoard = (state: GameState) =>
  renderToStaticMarkup(
    createElement(LudoBoard, {
      state,
      selectableTokenIds: ["stale-id"],
      activeColor: "red",
      onSelect: () => {},
    }),
  );

describe("authoritative destination previews", () => {
  it.each(COLOR_ORDER)(
    "maps %s release, shared track, home entry and exact finish without changing state",
    (color) => {
      const state = selecting(color, 6);
      const before = JSON.stringify(state);
      expect(destinations(state)).toHaveLength(4);
      expect(
        destinations(state).every(
          (p) => JSON.stringify(p.cell) === JSON.stringify(TRACK[START_OFFSET[color]]),
        ),
      ).toBe(true);
      expect(JSON.stringify(state)).toBe(before);
      const token = place(state, color, 0, 5);
      state.turn.diceValue = 2;
      expect(destinations(state)[0]?.cell).toEqual(TRACK[absoluteIndex(color, 7)]);
      token.steps = 50;
      expect(destinations(state).find((p) => !p.alternative)?.cell).toEqual(HOME_COLUMN[color][1]);
      token.steps = 54;
      expect(destinations(state)).toEqual([
        { tokenId: token.id, alternative: false, cell: FINISH_CELL[color] },
      ]);
      state.turn.diceValue = 3;
      expect(destinations(state)).toEqual([]);
    },
  );
  it("offers the optional lap even when its route passes through a stack", () => {
    const state = selecting();
    const red = place(state, "red", 0, 50);
    expect(destinations(state)).toHaveLength(2);
    const alternative = destinations(state).find((p) => p.alternative)!;
    expect(alternative.cell).toEqual(cellForToken({ ...red, steps: 51, lap: 1 }, 0));
    place(state, "green", 0, 38);
    place(state, "green", 1, 38); // absolute 51: only the optional route crosses this stack
    expect(destinations(state)).toHaveLength(2);
    expect(destinations(state).some((preview) => preview.alternative)).toBe(true);
    state.gameConfig.houseRules.secondLap = false;
    expect(destinations(state)).toHaveLength(1);
  });
  it("keeps previews legal for safe and unsafe stacks", () => {
    const state = selecting();
    place(state, "red", 0, 7);
    place(state, "green", 0, (8 - START_OFFSET.green + 52) % 52);
    place(state, "green", 1, (8 - START_OFFSET.green + 52) % 52);
    expect(SAFE_SQUARES.has(8)).toBe(true);
    expect(destinations(state)).toEqual([{ tokenId: "red-0", cell: TRACK[8], alternative: false }]);
    state.tokens.filter((t) => t.state === "common").forEach((t) => t.steps++);
    expect(destinations(state)).toEqual([{ tokenId: "red-0", cell: TRACK[9], alternative: false }]);
  });
  it("hides previews during motion and dialogs and uses six for reward moves", () => {
    const state = selecting();
    place(state, "red", 0, 0);
    state.rewardMove = true;
    expect(destinations(state)).toEqual([{ tokenId: "red-0", cell: TRACK[6], alternative: false }]);
    state.phase = "moving";
    expect(destinations(state)).toEqual([]);
    state.phase = "select";
    state.activeModal = "EXIT_CONFIRM";
    expect(destinations(state)).toEqual([]);
  });
});

describe("royal board rendering and accessible selection", () => {
  it("renders a contested stack with defender and challenger pips", () => {
    const state = selecting("green", 1);
    place(state, "red", 0, 5);
    place(state, "red", 1, 5);
    const challenger = place(state, "green", 0, (5 - START_OFFSET.green + 52) % 52);
    expect(resolveContestLanding(state, challenger, "p-green")).toBeNull();
    const html = renderBoard(state);
    expect(html).toContain("royal-contest-outline");
    expect(html).toContain("Contested stack: 2 defending, 1 attacking");
    expect(html).toContain('data-role="defender"');
    expect(html).toContain('data-role="attacker"');
  });
  it("retains 52 shared cells, 20 home cells, 16 yard slots and the central goal", () => {
    const html = renderToStaticMarkup(createElement(BoardArtwork));
    expect(html.match(/class="royal-cell /g)).toHaveLength(72);
    expect(html.match(/class="royal-socket"/g)).toHaveLength(16);
    expect(html.match(/class="royal-center"/g)).toHaveLength(1);
  });
  it("provides an individually labeled control for every stacked legal piece", () => {
    const state = selecting();
    state.settings.showMoveSuggestions = true;
    place(state, "red", 0, 4);
    place(state, "red", 1, 4);
    const html = renderBoard(state);
    const moves = getLegalMoves(state, 1);
    expect(moves).toHaveLength(2);
    expect(html).toContain('aria-label="Move red piece 1"');
    expect(html).toContain('aria-label="Move red piece 2"');
    expect(html.match(/data-legal="true"/g)).toHaveLength(2);
    expect(html).not.toContain("stale-id");
    expect(html).not.toContain("royal-piece-number");
    expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/\d/);
    expect(html).toContain("royal-move-picker");
    expect(html.match(/class="royal-stack-outline"/g)).toHaveLength(1);
  });
  it.each([false, undefined])(
    "hides destinations by default (%s) but still glows playable pieces",
    (setting) => {
      const state = selecting();
      if (setting === undefined) delete state.settings.showMoveSuggestions;
      else state.settings.showMoveSuggestions = setting;
      place(state, "red", 0, 50);
      const html = renderBoard(state);
      expect(destinations(state).some((p) => p.alternative)).toBe(true);
      expect(html).not.toContain("royal-destination");
      expect(html).not.toContain("royal-route-legend");
      expect(html).toContain('data-visual="selectable"');
      expect(html).not.toContain("royal-move-picker");
      expect(html).toContain('data-legal="true"');
      expect(html).toContain('aria-label="red piece 1, can move"');
    },
  );
  it("shows legal destinations and Second Lap alternatives only when enabled", () => {
    const state = selecting();
    state.settings.showMoveSuggestions = true;
    place(state, "red", 0, 50);
    const before = JSON.stringify(state);
    const html = renderBoard(state);
    expect(html.match(/class="royal-destination"/g)).toHaveLength(2);
    expect(html).toContain('data-alternative="true"');
    expect(html).toContain("royal-route-legend");
    expect(JSON.stringify(state)).toBe(before);
    // Occupancy never hides either legal route.
    place(state, "green", 0, 38);
    place(state, "green", 1, 38);
    const stacked = renderBoard(state);
    expect(stacked.match(/class="royal-destination"/g)).toHaveLength(2);
    expect(stacked).toContain('data-alternative="true"');
    expect(stacked).toContain("royal-route-legend");
    state.phase = "moving";
    expect(renderBoard(state)).not.toContain("royal-destination");
    state.phase = "select";
    state.activeModal = "EXIT_CONFIRM";
    expect(renderBoard(state)).not.toContain("royal-destination");
  });
  it("renders finished pieces at the goal as nonselectable colour counters", () => {
    const state = selecting();
    const token = place(state, "red", 0, 56);
    token.state = "finished";
    const html = renderBoard(state);
    expect(cellForToken(token, 0)).toEqual(FINISH_CELL.red);
    expect(token.steps).toBe(maxStepsOf(token));
    expect(html).toContain('aria-label="red piece 1, finished"');
    expect(html).toContain('data-visual="home"');
    expect(html).not.toContain('aria-label="Move red piece 1"');
  });
  it("keeps all stack sizes inside one cell, including sixteen finished pieces", () => {
    for (let count = 1; count <= 16; count++) {
      for (let i = 0; i < count; i++) {
        const p = stackPlacement(i, count);
        expect(p.width).toBe(1);
        expect(p.height).toBe(1);
        expect(p.x + 0.08).toBeGreaterThanOrEqual(0);
        expect(p.y + 0.08).toBeGreaterThanOrEqual(0);
        expect(p.x + p.width - 0.08).toBeLessThanOrEqual(1);
        expect(p.y + p.height - 0.08).toBeLessThanOrEqual(1);
      }
    }
  });
  it("keeps dice results visible while selecting or moving", () => {
    for (let value = 1; value <= 6; value++) {
      const html = renderToStaticMarkup(
        createElement(Dice, { value, active: false, live: true, rolling: false, color: "blue" }),
      );
      expect(html).toContain('aria-label="Dice showing ' + value + '"');
      expect(html).toContain('data-lit="true"');
      expect(html.match(/royal-dice-pip[^"]*opacity-0/g)?.length ?? 0).toBe(9 - value);
    }
  });
});
