import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { BoardPiece } from "@/components/ludo/BoardPiece";
import { COLOR_ORDER, SAFE_SQUARES, START_OFFSET, TRACK } from "./board";
import { createGame, DEFAULT_HOUSE_RULES } from "./engine";
import { positionTokens, stackPlacement } from "./presentation";
import { gameReducer } from "./store";
import { APPEARANCE } from "./theme";
import type { GameState } from "./types";

function piece(state: GameState, id: string, onSelect = (_id: string) => {}) {
  return BoardPiece({
    item: positionTokens(state.tokens).find((p) => p.token.id === id)!,
    legal: state.phase === "select",
    moving: state.phase === "moving" && state.pending?.tokenId === id,
    visual: "idle",
    label: id,
    skin: APPEARANCE.token,
    onSelect,
  });
}

function moveDirectly(state: GameState, rearId: string) {
  let current = gameReducer(state, { type: "ROLL", value: 1 });
  expect(current.phase).toBe("select");
  const onSelect = vi.fn((tokenId: string) => {
    current = gameReducer(current, { type: "SELECT_TOKEN", tokenId });
  });
  // Invoke the actual board button's handler, not a separate pawn-picker control.
  piece(current, rearId, onSelect).props.children.props.onClick();
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(rearId);
  expect(current.pending?.tokenId).toBe(rearId);
  expect(piece(current, rearId).props["data-moving"]).toBe(true);
  return gameReducer(current, { type: "HOP" });
}

describe("stationary stop token and rear token rolling one", () => {
  const cases = COLOR_ORDER.flatMap((color) =>
    [...SAFE_SQUARES].flatMap((square) =>
      [0, 1].map((rearIndex) => ({ color, square, rearIndex })),
    ),
  );
  it.each(cases)(
    "$color joins safe/start square $square using token $rearIndex without moving its occupant",
    ({ color, square, rearIndex }) => {
      const state = createGame("4P", { ...DEFAULT_HOUSE_RULES, secondLap: true }, {});
      state.turn.currentPlayerId = "p-" + color;
      const rear = state.tokens.find((t) => t.id === `${color}-${rearIndex}`)!;
      const front = state.tokens.find((t) => t.id === `${color}-${1 - rearIndex}`)!;
      const steps = (square - START_OFFSET[color] + 52) % 52 || 52;
      for (const token of [front, rear]) {
        Object.assign(token, {
          state: "common",
          steps: token === front ? steps : steps - 1,
          lap: steps === 52 ? 1 : 0,
          secondLapUsed: steps === 52,
        });
      }
      const beforeFront = piece(state, front.id);
      const hopped = moveDirectly(state, rear.id);
      const afterFront = piece(hopped, front.id);
      expect(afterFront.props.style).toEqual(beforeFront.props.style);
      expect(afterFront.props["data-moving"]).toBe(false);
      expect(afterFront.props.children.props.style).not.toEqual(
        beforeFront.props.children.props.style,
      );
      const stacked = positionTokens(hopped.tokens).filter(
        (p) => p.token.id === rear.id || p.token.id === front.id,
      );
      expect(
        stacked.every(
          (p) =>
            p.count === 2 && p.cell.row === TRACK[square]!.row && p.cell.col === TRACK[square]!.col,
        ),
      ).toBe(true);
      const finished = gameReducer(hopped, { type: "FINISH_MOVE" });
      expect(finished.tokens.find((t) => t.id === rear.id)!.steps).toBe(steps);
      expect(finished.tokens.filter((t) => t.id !== rear.id)).toEqual(
        state.tokens.filter((t) => t.id !== rear.id),
      );
      expect(finished.lastCapture ?? null).toBeNull();
      expect(piece(finished, rear.id).props["data-moving"]).toBe(false);
      expect(gameReducer(finished, { type: "FINISH_MOVE" }).tokens).toEqual(finished.tokens);
    },
  );

  it.each([
    { mode: "4P" as const, occupant: "red", square: 5 },
    { mode: "2V2" as const, occupant: "yellow", square: 5 },
    { mode: "4P" as const, occupant: "green", square: 8 },
  ])(
    "stacks with $occupant in $mode without capturing or moving the occupant",
    ({ mode, occupant, square }) => {
      const state = createGame(mode, DEFAULT_HOUSE_RULES, {});
      const rear = state.tokens.find((t) => t.id === "red-0")!;
      const front = state.tokens.find((t) => t.id === `${occupant}-1`)!;
      Object.assign(rear, { state: "common", steps: square - 1 });
      Object.assign(front, {
        state: "common",
        steps: (square - START_OFFSET[front.color] + 52) % 52,
      });
      Object.assign(
        state.tokens.find((t) => t.id === "red-2")!,
        { state: "common", steps: 20 },
      );
      const hopped = moveDirectly(state, rear.id);
      expect(piece(hopped, front.id).props.style).toEqual(piece(state, front.id).props.style);
      expect(piece(hopped, front.id).props["data-moving"]).toBe(false);
      const finished = gameReducer(hopped, { type: "FINISH_MOVE" });
      expect(finished.tokens.find((t) => t.id === front.id)).toEqual(front);
      expect(finished.lastCapture ?? null).toBeNull();
      expect(finished.turn.currentPlayerId).not.toBe("p-red");
    },
  );

  it.each(COLOR_ORDER)("leaves a %s stack without animating the remaining pawn", (color) => {
    const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
    state.turn.currentPlayerId = "p-" + color;
    const tokens = state.tokens.filter((t) => t.color === color).slice(0, 2);
    tokens.forEach((t) => Object.assign(t, { state: "common", steps: 8 }));
    const hopped = moveDirectly(state, tokens[1]!.id);
    expect(piece(hopped, tokens[0]!.id).props.style).toEqual(
      piece(state, tokens[0]!.id).props.style,
    );
    expect(piece(hopped, tokens[0]!.id).props["data-moving"]).toBe(false);
    expect(hopped.tokens.find((t) => t.id === tokens[0]!.id)!.steps).toBe(8);
  });
});

describe("bounded independent stack hit regions", () => {
  it("never overlaps hit regions or leaves the square for stacks of 1 to 16", () => {
    for (let count = 1; count <= 16; count++) {
      const regions = Array.from({ length: count }, (_, i) => stackPlacement(i, count));
      regions.forEach((a, i) => {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.x + a.scale).toBeLessThanOrEqual(1);
        expect(a.y + a.scale).toBeLessThanOrEqual(1);
        for (const b of regions.slice(i + 1)) {
          expect(
            a.x + a.scale <= b.x ||
              b.x + b.scale <= a.x ||
              a.y + a.scale <= b.y ||
              b.y + b.scale <= a.y,
          ).toBe(true);
        }
      });
    }
  });

  it("CSS animates cell travel only for the pending pawn and keeps artwork non-interactive", () => {
    const css = readFileSync(new URL("../../royal.css", import.meta.url), "utf8");
    expect(css.match(/\.royal-piece-position\s*\{([^}]+)\}/)![1]).not.toContain("transition:");
    expect(css.match(/\.royal-piece-hit\s*\{([^}]+)\}/)![1]).not.toContain("transition:");
    expect(css.match(/\.royal-piece-position\[data-moving="true"\]\s*\{([^}]+)\}/)![1]).toContain(
      "transition: transform 120ms linear",
    );
    expect(css).toMatch(/\.royal-piece-hit \*\s*\{\s*pointer-events: none/);
    expect(css.match(/\.royal-stack-outline\s*\{([^}]+)\}/)![1]).toContain("pointer-events: none");
  });
});
