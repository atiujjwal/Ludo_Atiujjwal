import {
  COLOR_ORDER,
  DEFAULT_BOARD_LAYOUT,
  boardLayoutOf,
  cellForToken,
  maxStepsOf,
  type Cell,
} from "./board";
import { canContinueSecondLap, getLegalMoves } from "./engine";
import type { GameState, Pending, Token } from "./types";

export interface Destination {
  tokenId: string;
  cell: Cell;
  alternative: boolean;
}

/** Visual previews use the same legality and coordinate functions as play. */
export function destinations(
  state: GameState,
  legalMoves = getLegalMoves(
    state,
    state.rewardMove ? 6 : (state.turn.diceValue ?? 0),
    state.rewardMove,
  ),
): Destination[] {
  if (state.phase !== "select" || state.activeModal !== "NONE") return [];
  const dice = state.rewardMove ? 6 : (state.turn.diceValue ?? 0);
  const layout = boardLayoutOf(state.gameConfig);
  return legalMoves.flatMap((move) => {
    const token = state.tokens.find((t) => t.id === move.tokenId)!;
    const landed: Token = {
      ...token,
      state: "common",
      steps: move.kind === "release" ? 0 : token.steps + dice,
    };
    const previews: Destination[] = [
      { tokenId: token.id, cell: cellForToken(landed, 0, layout), alternative: false },
    ];
    if (canContinueSecondLap(state, token, dice)) {
      previews.push({
        tokenId: token.id,
        cell: cellForToken({ ...landed, lap: token.lap + 1 }, 0, layout),
        alternative: true,
      });
    }
    return previews;
  });
}
/** Full-size counters fan slightly within their cell's existing 8% inset. */
export function stackPlacement(index: number, count: number) {
  if (count <= 1) return { x: 0, y: 0, width: 1, height: 1 };
  if (count === 2) return { x: index === 0 ? -0.08 : 0.08, y: 0, width: 1, height: 1 };
  // A perimeter fan leaves an exposed edge for every piece, unlike a grid
  // whose middle pieces could be completely covered by their neighbours.
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return { x: Math.cos(angle) * 0.08, y: Math.sin(angle) * 0.08, width: 1, height: 1 };
}

/** Cell travel and local stack layout are deliberately independent. */
export function positionTokens(
  tokens: Token[],
  pending?: Pending | null,
  layout = DEFAULT_BOARD_LAYOUT,
) {
  const slots = new Map<string, number>();
  COLOR_ORDER.forEach((color) =>
    tokens.filter((t) => t.color === color).forEach((t, i) => slots.set(t.id, i)),
  );
  const buckets = new Map<string, string[]>();
  const items = tokens.map((token) => {
    const slot = slots.get(token.id) ?? 0;
    const cell = cellForToken(token, slot, layout);
    const key = `${cell.row},${cell.col}`;
    buckets.set(key, [...(buckets.get(key) ?? []), token.id]);
    return { token, slot, cell, key };
  });
  return items.map((item) => {
    const bucket = buckets.get(item.key)!;
    return {
      ...item,
      count: bucket.length,
      offset:
        item.token.state === "finished" ||
        (pending?.tokenId === item.token.id && pending.finishStage === "settle")
          ? stackPlacement(item.slot, 4)
          : pending?.tokenId === item.token.id && item.token.steps === maxStepsOf(item.token)
            ? stackPlacement(0, 1)
            : stackPlacement(bucket.indexOf(item.token.id), bucket.length),
    };
  });
}
