import { useEffect, useRef, useState } from "react";
import { createRankFeedback, rankCats, type RankCat } from "./cat-effects";
import type { Color, GameState } from "./types";

export function useRankFeedback(state: GameState, ready: boolean) {
  const [active, setActive] = useState<Partial<Record<Color, RankCat>>>({});
  const [animateResults, setAnimateResults] = useState(false);
  const tracker = useRef<ReturnType<typeof createRankFeedback> | null>(null);
  const identity = useRef<number | null>(null);
  const wasOver = useRef(false);
  useEffect(() => {
    if (!ready) return;
    const assignments = rankCats(state);
    if (!tracker.current || identity.current !== state.createdAt) {
      tracker.current?.dispose();
      identity.current = state.createdAt;
      wasOver.current = state.phase === "over";
      setAnimateResults(false);
      tracker.current = createRankFeedback(assignments, {
        show: (color, entry) => setActive((previous) => ({ ...previous, [color]: entry })),
        hide: (color) =>
          setActive((previous) => {
            const next = { ...previous };
            delete next[color];
            return next;
          }),
      });
      return;
    }
    tracker.current.update(assignments);
    if (!wasOver.current && state.phase === "over") setAnimateResults(true);
    wasOver.current = state.phase === "over";
  }, [state, ready]);
  useEffect(
    () => () => {
      tracker.current?.dispose();
      tracker.current = null;
    },
    [],
  );
  return {
    active,
    animateResults,
    loaded: (color: Color, session: number) => tracker.current?.loaded(color, session),
  };
}
