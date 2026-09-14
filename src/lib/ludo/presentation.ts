import { COLOR_ORDER, cellForToken, type Cell } from "./board";
import { canContinueSecondLap, getLegalMoves } from "./engine";
import type { GameState, Token } from "./types";

export interface Destination {
  tokenId: string;
  cell: Cell;
  alternative: boolean;
}

/** Visual previews use the same legality and coordinate functions as play. */
export function destinations(state: GameState): Destination[] {
  if (state.phase !== "select" || state.activeModal !== "NONE") return [];
  const dice = state.rewardMove ? 6 : (state.turn.diceValue ?? 0);
  return getLegalMoves(state, dice, state.rewardMove).flatMap((move) => {
    const token = state.tokens.find((t) => t.id === move.tokenId)!;
    const landed: Token = {
      ...token,
      state: "common",
      steps: move.kind === "release" ? 0 : token.steps + dice,
    };
    const previews: Destination[] = [
      { tokenId: token.id, cell: cellForToken(landed, 0), alternative: false },
    ];
    if (canContinueSecondLap(state, token, dice)) {
      previews.push({
        tokenId: token.id,
        cell: cellForToken({ ...landed, lap: token.lap + 1 }, 0),
        alternative: true,
      });
    }
    return previews;
  });
}
/** All pieces remain inside their cell, including all sixteen at the goal. */
export function stackPlacement(index: number, count: number) {
  if (count <= 1) return { x: 0, y: 0, scale: 1 };
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const scale = 1 / columns;
  return {
    x: (index % columns) * scale,
    y: Math.floor(index / columns) * scale + (1 - rows * scale) / 2,
    scale,
  };
}

/** Cell travel and local stack layout are deliberately independent. */
export function positionTokens(tokens: Token[]) {
  const slots = new Map<string, number>();
  COLOR_ORDER.forEach((color) =>
    tokens.filter((t) => t.color === color).forEach((t, i) => slots.set(t.id, i)),
  );
  const buckets = new Map<string, string[]>();
  const items = tokens.map((token) => {
    const slot = slots.get(token.id) ?? 0;
    const cell = cellForToken(token, slot);
    const key = `${cell.row},${cell.col}`;
    buckets.set(key, [...(buckets.get(key) ?? []), token.id]);
    return { token, slot, cell, key };
  });
  return items.map((item) => {
    const bucket = buckets.get(item.key)!;
    return {
      ...item,
      count: bucket.length,
      offset: stackPlacement(bucket.indexOf(item.token.id), bucket.length),
    };
  });
}
