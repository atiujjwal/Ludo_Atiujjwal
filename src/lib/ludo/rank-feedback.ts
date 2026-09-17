import { useCallback, useEffect, useRef, useState } from "react";
import { createRankFeedback, createTokenHomeFeedback, rankCats, type RankCat } from "./cat-effects";
import type { Color, GameState } from "./types";
import { createFinalCelebration } from "./final-celebration";
import { usePageVisible } from "@/lib/page-visibility";

export function useRankFeedback(state: GameState, ready: boolean) {
  const [active, setActive] = useState<Partial<Record<Color, RankCat>>>({});
  const [resultsReady, setResultsReady] = useState(false);
  const visible = usePageVisible();
  const tracker = useRef<ReturnType<typeof createRankFeedback> | null>(null);
  const homeTracker = useRef<ReturnType<typeof createTokenHomeFeedback> | null>(null);
  const finalCelebration = useRef<ReturnType<typeof createFinalCelebration> | null>(null);
  const identity = useRef<number | null>(null);
  const wasOver = useRef(false);
  const previousCapture = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    const assignments = rankCats(state);
    if (!tracker.current || identity.current !== state.createdAt) {
      tracker.current?.dispose();
      homeTracker.current?.dispose();
      finalCelebration.current?.dispose();
      identity.current = state.createdAt;
      wasOver.current = state.phase === "over";
      previousCapture.current = state.lastCapture?.id;
      setResultsReady(state.phase === "over");
      finalCelebration.current = createFinalCelebration(() => setResultsReady(true), visible);
      tracker.current = createRankFeedback(
        {},
        {
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
        },
        {
          persistent: true,
          onLoaded: (color, session) => finalCelebration.current?.loaded(color, session),
        },
      );
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
      // Restore looping ranks, but never replay capture/home events or a saved final countdown.
      tracker.current.update(assignments);
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
    const isFinal = !wasOver.current && state.phase === "over";
    const shown = tracker.current.update(assignments, isFinal);
    if (isFinal) {
      setResultsReady(false);
      finalCelebration.current?.start(shown);
    }
    wasOver.current = state.phase === "over";
  }, [state, ready, visible]);
  useEffect(() => finalCelebration.current?.setVisible(visible), [visible]);
  useEffect(
    () => () => {
      tracker.current?.dispose();
      tracker.current = null;
      homeTracker.current?.dispose();
      homeTracker.current = null;
      finalCelebration.current?.dispose();
      finalCelebration.current = null;
    },
    [],
  );
  const loaded = useCallback((color: Color, session: number) => {
    tracker.current?.loaded(color, session);
    homeTracker.current?.loaded(color, session);
  }, []);
  return {
    active,
    // Persistent house effects must never gate results by their lifetime.
    showResults:
      state.phase !== "over" || (ready && identity.current === state.createdAt && resultsReady),
    loaded,
  };
}
