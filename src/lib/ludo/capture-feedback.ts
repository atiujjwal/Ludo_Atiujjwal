import type { CaptureEvent, Color } from "./types";

/** Presentation-only lifetimes. The initial saved event is deliberately consumed. */
export function createCaptureFeedback(
  initialId: number | undefined,
  effects: {
    show: (color: Color, id: number) => void;
    hide: (color: Color) => void;
  },
  waitForImage = false,
) {
  let lastId = initialId;
  const timers = new Map<Color, ReturnType<typeof setTimeout>>();
  const active = new Map<Color, number>();
  function expire(color: Color, delay: number) {
    clearTimeout(timers.get(color));
    timers.set(
      color,
      setTimeout(() => {
        timers.delete(color);
        active.delete(color);
        effects.hide(color);
      }, delay),
    );
  }
  return {
    update(event?: CaptureEvent | null) {
      if (!event) {
        lastId = undefined;
        return;
      }
      if (event.id === lastId) return;
      lastId = event.id;
      for (const color of new Set(event.tokens.map((token) => token.color))) {
        active.set(color, event.id);
        effects.show(color, event.id);
        // Slow image loads must not consume the entire visible lifetime.
        // Still bound missing-asset overlays and clean up their timers.
        expire(color, waitForImage ? 10000 : 2500);
      }
    },
    loaded(color: Color, id: number) {
      if (active.get(color) === id) expire(color, 2500);
    },
    dispose() {
      timers.forEach((timer, color) => {
        clearTimeout(timer);
        effects.hide(color);
      });
      timers.clear();
      active.clear();
    },
  };
}
