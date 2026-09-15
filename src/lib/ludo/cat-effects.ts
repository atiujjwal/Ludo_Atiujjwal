import type { Color, GameState, Token } from "./types";

export const CAT_IDS = [
  "bleh-cat",
  "cat-orange-cat",
  "banana-cat-crying",
  "crying-crying-cat",
  "babsb-cat",
  "dancing-cat-ai",
  "happy-cat",
  "weird-cute",
] as const;
export type CatId = (typeof CAT_IDS)[number];
/** Shared visible duration for each loaded capture stage and rank celebration. */
export const CAT_DISPLAY_MS = 3000;
export const catUrl = (cat: CatId, still = false) =>
  `/animation/${cat}${still ? "-still.png" : cat === "weird-cute" ? ".webp" : ".gif"}`;
export const CAPTURE_CATS = {
  cutter: ["bleh-cat", "cat-orange-cat"],
  victim: ["banana-cat-crying", "crying-crying-cat"],
} as const;

/** The remaining loser is marked finished too; only actual token completion awards ranks. */
export function rankCats(state: GameState): Partial<Record<Color, CatId>> {
  const result: Partial<Record<Color, CatId>> = {};
  if (state.gameConfig.mode === "2V2") {
    if (state.phase === "over" && state.winnerTeam)
      for (const player of state.players)
        result[player.color] =
          player.teamId === state.winnerTeam ? "babsb-cat" : "crying-crying-cat";
    return result;
  }
  for (const player of state.players) {
    const rank = player.finishRank;
    if (!rank) continue;
    if (state.phase === "over" && rank === state.players.length)
      result[player.color] = "crying-crying-cat";
    else if (rank < state.players.length) {
      const own = state.tokens.filter((token) => token.color === player.color);
      if (own.length === 4 && own.every((token) => token.state === "finished"))
        result[player.color] =
          rank === 1 ? "babsb-cat" : rank === 2 ? "dancing-cat-ai" : "happy-cat";
    }
  }
  return result;
}

export interface RankCat {
  cat: CatId;
  session: number;
  animated?: boolean;
  kind?: "home" | "rank";
}
let nextRankSession = 0;
export function createRankFeedback(
  initial: Partial<Record<Color, CatId>>,
  effects: {
    show: (color: Color, entry: RankCat) => void;
    hide: (color: Color) => void;
  },
) {
  let previous = initial;
  const active = new Map<
    Color,
    { entry: RankCat; loaded: boolean; timer: ReturnType<typeof setTimeout> }
  >();
  function expire(color: Color, delay: number) {
    const item = active.get(color);
    if (!item) return;
    clearTimeout(item.timer);
    item.timer = setTimeout(() => {
      active.delete(color);
      effects.hide(color);
    }, delay);
  }
  return {
    update(next: Partial<Record<Color, CatId>>, celebrateAll = false) {
      for (const [color, cat] of Object.entries(next) as [Color, CatId][]) {
        if (!celebrateAll && previous[color] === cat) continue;
        const old = active.get(color);
        if (old) clearTimeout(old.timer);
        const entry = { cat, session: ++nextRankSession };
        active.set(color, { entry, loaded: false, timer: setTimeout(() => {}, 0) });
        expire(color, 10000);
        effects.show(color, entry);
      }
      previous = next;
    },
    loaded(color: Color, session: number) {
      const item = active.get(color);
      if (!item || item.entry.session !== session || item.loaded) return;
      item.loaded = true;
      expire(color, CAT_DISPLAY_MS);
    },
    cancel(color: Color) {
      const item = active.get(color);
      if (!item) return;
      clearTimeout(item.timer);
      active.delete(color);
      effects.hide(color);
    },
    dispose() {
      for (const [color, item] of active) {
        clearTimeout(item.timer);
        effects.hide(color);
      }
      active.clear();
    },
  };
}

/** Newly settled first/second/third tokens only; saved finishes are seeded silently. */
export function createTokenHomeFeedback(
  initial: readonly Token[],
  effects: Parameters<typeof createRankFeedback>[1],
) {
  let completed = new Set(
    initial.filter((token) => token.state === "finished").map((token) => token.id),
  );
  const tracker = createRankFeedback({}, effects);
  return {
    ...tracker,
    update(tokens: readonly Token[]) {
      const finished = tokens.filter((token) => token.state === "finished");
      for (const token of finished)
        if (
          !completed.has(token.id) &&
          finished.filter((other) => other.color === token.color).length < 4
        )
          tracker.update({ [token.color]: "weird-cute" }, true);
      completed = new Set(finished.map((token) => token.id));
    },
  };
}
