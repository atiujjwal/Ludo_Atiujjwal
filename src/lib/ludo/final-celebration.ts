import type { RankCat } from "./cat-effects";
import type { Color } from "./types";

export const FINAL_CELEBRATION_MS = 6000;
export const FINAL_LOAD_TIMEOUT_MS = 10000;

/** Presentation-only foreground countdown, independent of persistent GIF lifetime. */
export function createFinalCelebration(onReady: () => void, initiallyVisible = true) {
  let visible = initiallyVisible;
  let started = false;
  let disposed = false;
  let complete = false;
  let remaining = FINAL_CELEBRATION_MS;
  let began: number | null = null;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let countdown: ReturnType<typeof setTimeout> | undefined;
  const waiting = new Map<Color, number>();
  function advance() {
    if (disposed || complete || !started || waiting.size || !visible || began !== null) return;
    clearTimeout(loadTimer);
    began = Date.now();
    countdown = setTimeout(() => {
      began = null;
      complete = true;
      onReady();
    }, remaining);
  }
  return {
    start(entries: Partial<Record<Color, RankCat>>) {
      if (started || disposed) return;
      started = true;
      for (const [color, entry] of Object.entries(entries) as [Color, RankCat][])
        waiting.set(color, entry.session);
      loadTimer = setTimeout(() => {
        waiting.clear();
        advance();
      }, FINAL_LOAD_TIMEOUT_MS);
      advance();
    },
    loaded(color: Color, session: number) {
      if (disposed || waiting.get(color) !== session) return;
      waiting.delete(color);
      advance();
    },
    setVisible(next: boolean) {
      if (disposed || visible === next) return;
      visible = next;
      if (!visible && began !== null) {
        remaining = Math.max(0, remaining - (Date.now() - began));
        began = null;
        clearTimeout(countdown);
      }
      advance();
    },
    dispose() {
      disposed = true;
      waiting.clear();
      clearTimeout(loadTimer);
      clearTimeout(countdown);
    },
  };
}
