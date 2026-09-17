import { describe, expect, it } from "vitest";

import {
  COLOR_CORNER,
  COLOR_ORDER,
  OPPOSITE_COLOR,
  SAFE_SQUARES,
  START_OFFSET,
  junctionOf,
} from "./board";
import {
  DEFAULT_HOUSE_RULES,
  blockades,
  earnsExtraRoll,
  createGame,
  getLegalMoves,
  moveIsBlocked,
  pathSquares,
  resolveCaptures,
  advanceTurn,
} from "./engine";
import type { Color, GameState, HouseRules, Mode } from "./types";

function game(mode: Mode = "4P", rules: Partial<HouseRules> = {}): GameState {
  return createGame(mode, { ...DEFAULT_HOUSE_RULES, ...rules }, {});
}

/** Put token `index` of `color` on the shared loop at an absolute square. */
function place(state: GameState, color: Color, index: number, absolute: number) {
  const token = state.tokens.find((t) => t.id === `${color}-${index}`)!;
  token.state = "common";
  token.lap = 0;
  token.steps = (absolute - START_OFFSET[color] + 52) % 52;
  return token;
}

function turnOf(state: GameState, color: Color) {
  state.turn.currentPlayerId = `p-${color}`;
  state.turn.actingForTeammate = false;
}

describe("pass-through stacks", () => {
  it("does not expose legacy blockade entries for stacks", () => {
    const s = game();
    place(s, "green", 0, 5);
    expect(blockades(s).size).toBe(0);
    place(s, "green", 1, 5);
    expect(blockades(s).size).toBe(0);
  });

  it("lists every traversed square including the destination", () => {
    const s = game();
    const token = place(s, "red", 0, 0);
    expect(pathSquares(token, 4)).toEqual([1, 2, 3, 4]);
  });

  it("allows an opponent to land on a stronger stack and start a contest", () => {
    const s = game();
    turnOf(s, "red");
    place(s, "red", 0, 0);
    place(s, "green", 0, 4);
    place(s, "green", 1, 4);
    expect(moveIsBlocked(s, s.tokens[0]!, 4)).toBe(false);
    expect(getLegalMoves(s, 4).some((m) => m.tokenId === "red-0")).toBe(true);
  });

  it("allows an opponent to pass over a stack", () => {
    const s = game();
    turnOf(s, "red");
    place(s, "red", 0, 0);
    place(s, "green", 0, 3);
    place(s, "green", 1, 3);
    expect(getLegalMoves(s, 5).some((m) => m.tokenId === "red-0")).toBe(true);
    // A shorter move that stops before the stack is still fine.
    expect(getLegalMoves(s, 2).some((m) => m.tokenId === "red-0")).toBe(true);
  });

  it("an opponent cannot immediately capture a stronger stack", () => {
    const s = game();
    const red = place(s, "red", 0, 4);
    place(s, "green", 0, 4);
    place(s, "green", 1, 4);
    expect(resolveCaptures(s, red)).toEqual([]);
    expect(s.tokens.find((t) => t.id === "green-0")!.state).toBe("common");
  });

  it("never treats a same-color stack on a safe square as blocking", () => {
    const s = game();
    turnOf(s, "red");
    place(s, "red", 0, 6);
    place(s, "green", 0, 8); // 8 is a safe square
    place(s, "green", 1, 8);
    expect(blockades(s).has(8)).toBe(false);
    expect(getLegalMoves(s, 2).some((m) => m.tokenId === "red-0")).toBe(true);
    expect(getLegalMoves(s, 4).some((m) => m.tokenId === "red-0")).toBe(true);
  });

  it("applies safe-stack coexistence to every protected track square", () => {
    for (const safeSquare of SAFE_SQUARES) {
      const s = game();
      place(s, "green", 0, safeSquare);
      place(s, "green", 1, safeSquare);
      const moverColor = COLOR_ORDER.find((color) => {
        const destinationSteps = (safeSquare - START_OFFSET[color] + 52) % 52;
        return color !== "green" && destinationSteps >= 1 && destinationSteps <= 50;
      })!;
      turnOf(s, moverColor);
      place(s, moverColor, 0, (safeSquare + 51) % 52);

      expect(blockades(s).has(safeSquare)).toBe(false);
      expect(getLegalMoves(s, 1).some((move) => move.tokenId === `${moverColor}-0`)).toBe(true);
    }
  });

  it("keeps every unsafe same-color stack passable to opponents", () => {
    for (let square = 0; square < 52; square += 1) {
      if (SAFE_SQUARES.has(square)) continue;
      const s = game();
      const ownerColor = COLOR_ORDER.find(
        (color) => (square - START_OFFSET[color] + 52) % 52 <= 50,
      )!;
      place(s, ownerColor, 0, square);
      place(s, ownerColor, 1, square);
      const moverColor = COLOR_ORDER.find((color) => {
        const destinationSteps = (square - START_OFFSET[color] + 52) % 52;
        return color !== ownerColor && destinationSteps >= 1 && destinationSteps <= 50;
      })!;
      turnOf(s, moverColor);
      place(s, moverColor, 0, (square + 51) % 52);

      expect(blockades(s).has(square)).toBe(false);
      expect(getLegalMoves(s, 1).some((move) => move.tokenId === `${moverColor}-0`)).toBe(true);
    }
  });

  it("dissolves when one owner token leaves, restoring normal capture", () => {
    const s = game();
    const green = place(s, "green", 0, 4);
    place(s, "green", 1, 4);
    green.steps += 3; // one stacked token walks away
    const red = place(s, "red", 0, 4);
    expect(blockades(s).size).toBe(0);
    expect(resolveCaptures(s, red)).toEqual(["green-1"]);
    expect(s.tokens.find((t) => t.id === "green-1")!.state).toBe("base");
  });

  it("still captures a lone opponent token", () => {
    const s = game();
    place(s, "green", 0, 4);
    const red = place(s, "red", 0, 4);
    expect(resolveCaptures(s, red)).toEqual(["green-0"]);
  });

  it("lets the owner pass through its own stack", () => {
    const s = game();
    turnOf(s, "green");
    place(s, "green", 0, 20);
    place(s, "green", 1, 20);
    place(s, "green", 2, 18);
    expect(getLegalMoves(s, 4).some((m) => m.tokenId === "green-2")).toBe(true);
  });

  it("allows releases onto a stacked opponent on the safe start square", () => {
    const s = game();
    turnOf(s, "red");
    place(s, "green", 0, START_OFFSET.red);
    place(s, "green", 1, START_OFFSET.red);
    expect(getLegalMoves(s, 6).filter((m) => m.kind === "release")).toHaveLength(4);
  });

  it("allows the cut-reward six-jump across a stack", () => {
    const s = game("4P", { cutReward: true });
    turnOf(s, "red");
    place(s, "red", 0, 0);
    place(s, "green", 0, 3);
    place(s, "green", 1, 3);
    expect(getLegalMoves(s, 6, true)).toEqual([{ tokenId: "red-0", kind: "move" }]);
  });

  it("allows passing both teammate and enemy team stacks in 2v2", () => {
    const s = game("2V2");
    turnOf(s, "red");
    place(s, "red", 0, 0);
    place(s, "yellow", 0, 3); // red's teammate
    place(s, "yellow", 1, 3);
    expect(getLegalMoves(s, 5).some((m) => m.tokenId === "red-0")).toBe(true);
    place(s, "blue", 0, 4);
    place(s, "blue", 1, 4);
    expect(getLegalMoves(s, 5).some((m) => m.tokenId === "red-0")).toBe(true);
  });

  it("keeps legacy blockade lookup empty after a save/restore round trip", () => {
    const s = game();
    place(s, "green", 0, 5);
    place(s, "green", 1, 5);
    const restored: GameState = JSON.parse(JSON.stringify(s));
    expect(blockades(restored).size).toBe(0);
  });

  it("ignores home-column squares", () => {
    const s = game();
    turnOf(s, "red");
    const red = place(s, "red", 0, 0);
    red.steps = junctionOf(red) - 1;
    expect(pathSquares(red, 4)).toEqual([]);
    expect(moveIsBlocked(s, red, 4)).toBe(false);
  });
});

describe("turn machinery", () => {
  it("retains legal moves when an enemy stack is ahead", () => {
    const s = game();
    turnOf(s, "red");
    place(s, "red", 0, 0);
    place(s, "green", 0, 1);
    place(s, "green", 1, 1);
    expect(getLegalMoves(s, 3)).toEqual([{ tokenId: "red-0", kind: "move" }]);
  });

  it("resets dice and six-streak when the turn advances", () => {
    const s = game();
    s.turn.consecutiveSixes = 3;
    s.turn.diceValue = 6;
    s.turn.owedExtraRoll = true;
    advanceTurn(s);
    expect(s.turn.consecutiveSixes).toBe(0);
    expect(s.turn.diceValue).toBeNull();
    expect(s.turn.owedExtraRoll).toBe(false);
    expect(s.phase).toBe("idle");
    expect(s.pending).toBeNull();
    expect(s.turn.currentPlayerId).toBe("p-green");
  });
});

describe("seating and extra rolls", () => {
  it("pairs two players on opposite corners of the board", () => {
    for (const color of COLOR_ORDER) {
      const partner = OPPOSITE_COLOR[color];
      expect(OPPOSITE_COLOR[partner]).toBe(color);
      const corners = [COLOR_CORNER[color], COLOR_CORNER[partner]].sort();
      // Opposite seats never share a board edge.
      expect(corners).not.toEqual(["bl", "tl"]);
      expect(corners).not.toEqual(["br", "tr"]);
      expect(corners).not.toEqual(["tl", "tr"]);
      expect(corners).not.toEqual(["bl", "br"]);
    }
  });

  it("keeps any claimed two-player colours in claim order", () => {
    const game = createGame("2P", { ...DEFAULT_HOUSE_RULES }, {}, ["green", "red"]);
    expect(game.players.map((p) => p.color)).toEqual(["green", "red"]);
    expect(game.turn.currentPlayerId).toBe("p-green");
  });

  it("grants another roll when a piece reaches home", () => {
    const base = {
      dice: 3,
      captured: false,
      consecutiveSixes: 0,
      isReward: false,
      rewardOwed: false,
      threeSixesVariant: false,
    };
    expect(earnsExtraRoll({ ...base, reachedHome: true })).toBe(true);
    expect(earnsExtraRoll({ ...base, reachedHome: false })).toBe(false);
    // Still true when the piece lands home on a reward move or a third six.
    expect(earnsExtraRoll({ ...base, reachedHome: true, isReward: true })).toBe(true);
    expect(earnsExtraRoll({ ...base, dice: 6, consecutiveSixes: 3, reachedHome: true })).toBe(true);
    expect(earnsExtraRoll({ ...base, dice: 6, consecutiveSixes: 3, reachedHome: false })).toBe(
      false,
    );
    expect(earnsExtraRoll({ ...base, dice: 6, reachedHome: false })).toBe(true);
  });
});
