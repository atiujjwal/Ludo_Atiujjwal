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

describe("full-size overlapping stacks", () => {
  it("keeps doubles full size and exposes their edges on opposite sides", () => {
    expect([0, 1].map((i) => stackPlacement(i, 2))).toEqual([
      { x: -0.08, y: 0, width: 1, height: 1 },
      { x: 0.08, y: 0, width: 1, height: 1 },
    ]);
  });

  it("each stacked counter retains its own token selection handler", () => {
    const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
    state.phase = "select";
    state.tokens.forEach((token) =>
      Object.assign(token, {
        state: "common",
        steps: (8 - START_OFFSET[token.color] + 52) % 52,
      }),
    );
    const onSelect = vi.fn();
    for (const token of state.tokens) {
      const button = piece(state, token.id, onSelect).props.children;
      expect(button.props["data-stacked"]).toBe(true);
      button.props.onClick();
      expect(onSelect).toHaveBeenLastCalledWith(token.id);
    }
    expect(onSelect).toHaveBeenCalledTimes(16);
  });

  it("keeps full-size artwork inside the square with an exposed edge for every piece", () => {
    for (let count = 2; count <= 16; count++) {
      const regions = Array.from({ length: count }, (_, i) => stackPlacement(i, count));
      regions.forEach((a, i) => {
        expect(a.width).toBe(1);
        expect(a.height).toBe(1);
        expect(Math.abs(a.x)).toBeLessThanOrEqual(0.08);
        expect(Math.abs(a.y)).toBeLessThanOrEqual(0.08);
        // The outward point lies inside this 42%-radius counter but outside
        // every other counter: each token has a directly tappable crescent.
        const length = Math.hypot(a.x, a.y);
        const edge = { x: a.x + (a.x / length) * 0.4199, y: a.y + (a.y / length) * 0.4199 };
        regions.forEach((b, j) => {
          if (i !== j) expect(Math.hypot(edge.x - b.x, edge.y - b.y)).toBeGreaterThan(0.42);
        });
      });
    }
  });

  it("CSS animates cell travel only for the pending pawn and keeps artwork non-interactive", () => {
    const css = readFileSync(new URL("../../royal.css", import.meta.url), "utf8");
    expect(css.match(/\.royal-piece-position\s*\{([^}]+)\}/)![1]).not.toContain("transition:");
    expect(css.match(/\.royal-piece-hit\s*\{([^}]+)\}/)![1]).not.toContain("transition:");
    const moving = css.match(/\.royal-piece-position\[data-moving="true"\]\s*\{([^}]+)\}/)![1];
    expect(moving).toContain("will-change: transform");
    expect(moving).not.toContain("transition:");
    expect(css).toMatch(/\.royal-piece-hit \*\s*\{\s*pointer-events: none/);
    expect(css.match(/\.royal-stack-outline\s*\{([^}]+)\}/)![1]).toContain("pointer-events: none");
  });
  it("raises playable artwork without resizing counters or moving stacked hit regions", () => {
    const css = readFileSync(new URL("../../royal.css", import.meta.url), "utf8");
    const raised = css.match(/\.royal-token\[data-visual="selectable"\]\s*\{([^}]+)\}/)![1];
    expect(raised).toContain("translateY(-4%)");
    expect(raised).toContain("var(--royal-shadow-deep)");
    expect(raised).not.toMatch(/scale\(|animation:|width:|height:/);
    expect(css).toMatch(
      /\[data-stacked="true"\] \.royal-token\[data-visual="selectable"\]\s*\{[^}]*transform: none/,
    );
  });
});
