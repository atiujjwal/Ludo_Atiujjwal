import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRankFeedback, createTokenHomeFeedback, rankCats, type RankCat } from "./cat-effects";
import type { Color, GameState } from "./types";

export function useRankFeedback(state: GameState, ready: boolean) {
  const [active, setActive] = useState<Partial<Record<Color, RankCat>>>({});
  const [resumedRanks, setResumedRanks] = useState<Partial<Record<Color, RankCat>>>({});
  const tracker = useRef<ReturnType<typeof createRankFeedback> | null>(null);
  const homeTracker = useRef<ReturnType<typeof createTokenHomeFeedback> | null>(null);
  const identity = useRef<number | null>(null);
  const wasOver = useRef(false);
  const previousCapture = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    const assignments = rankCats(state);
    if (!tracker.current || identity.current !== state.createdAt) {
      tracker.current?.dispose();
      homeTracker.current?.dispose();
      identity.current = state.createdAt;
      wasOver.current = state.phase === "over";
      previousCapture.current = state.lastCapture?.id;
      setResumedRanks(
        state.phase === "over"
          ? Object.fromEntries(
              Object.entries(assignments).map(([color, cat]) => [
                color,
                { cat, session: 0, animated: false },
              ]),
            )
          : {},
      );
      tracker.current = createRankFeedback(assignments, {
        show: (color, entry) => {
          homeTracker.current?.cancel(color);
          setActive((previous) => ({ ...previous, [color]: entry }));
        },
        hide: (color) =>
          setActive((previous) => {
            const next = { ...previous };
            if (next[color]?.kind !== "home") delete next[color];
            return next;
          }),
      });
      homeTracker.current = createTokenHomeFeedback(state.tokens, {
        show: (color, entry) =>
          setActive((previous) => ({ ...previous, [color]: { ...entry, kind: "home" } })),
        hide: (color) =>
          setActive((previous) => {
            const next = { ...previous };
            if (next[color]?.kind === "home") delete next[color];
            return next;
          }),
      });
      return;
    }
    if (state.lastCapture && previousCapture.current !== state.lastCapture.id) {
      const affected = new Set(state.lastCapture.tokens.map((token) => token.color));
      if (state.lastCapture.cutterColor) affected.add(state.lastCapture.cutterColor);
      for (const color of affected) homeTracker.current?.cancel(color);
    }
    previousCapture.current = state.lastCapture?.id;
    homeTracker.current?.update(state.tokens);
    // Final standings celebrate every house, including ranks that finished earlier.
    tracker.current.update(assignments, !wasOver.current && state.phase === "over");
    wasOver.current = state.phase === "over";
  }, [state, ready]);
  useEffect(
    () => () => {
      tracker.current?.dispose();
      tracker.current = null;
      homeTracker.current?.dispose();
      homeTracker.current = null;
    },
    [],
  );
  const loaded = useCallback((color: Color, session: number) => {
    tracker.current?.loaded(color, session);
    homeTracker.current?.loaded(color, session);
  }, []);
  const houses = useMemo(() => ({ ...resumedRanks, ...active }), [resumedRanks, active]);
  return {
    active: houses,
    // Reveal text-only results after the brief house celebration, not over it.
    showResults: (state.phase !== "over" || wasOver.current) && Object.keys(active).length === 0,
    loaded,
  };
}
