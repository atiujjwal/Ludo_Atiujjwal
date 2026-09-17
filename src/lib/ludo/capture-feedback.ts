import type { CaptureEvent, Color } from "./types";
import { CAPTURE_CATS, CAT_DISPLAY_MS, type CatId } from "./cat-effects";

export interface CaptureCat {
  id: number;
  stage: 0 | 1;
  role: "cutter" | "victim";
  cat: CatId;
}
/** One replaceable sequence per colour, independent of all gameplay timers. */
export function createCaptureFeedback(
  initialId: number | undefined,
  effects: {
    show: (color: Color, entry: CaptureCat) => void;
    hide: (color: Color) => void;
  },
) {
  let lastId = initialId;
  const active = new Map<
    Color,
    { entry: CaptureCat; loaded: boolean; timer: ReturnType<typeof setTimeout> }
  >();
  function expire(color: Color, delay: number) {
    const item = active.get(color);
    if (!item) return;
    clearTimeout(item.timer);
    item.timer = setTimeout(() => {
      if (item.entry.stage === 0) start(color, item.entry.id, item.entry.role, 1);
      else {
        active.delete(color);
        effects.hide(color);
      }
    }, delay);
  }
  function start(color: Color, id: number, role: CaptureCat["role"], stage: 0 | 1) {
    const old = active.get(color);
    if (old) clearTimeout(old.timer);
    const entry: CaptureCat = { id, stage, role, cat: CAPTURE_CATS[role][stage] };
    active.set(color, { entry, loaded: false, timer: setTimeout(() => {}, 0) });
    expire(color, 10000);
    effects.show(color, entry);
  }
  return {
    update(event?: CaptureEvent | null) {
      if (!event) {
        lastId = undefined;
        return;
      }
      if (lastId !== undefined && event.id <= lastId) return;
      lastId = event.id;
      for (const color of new Set(event.tokens.map((token) => token.color)))
        start(color, event.id, "victim", 0);
      if (event.cutterColor) start(event.cutterColor, event.id, "cutter", 0);
    },
    loaded(color: Color, id: number, stage: 0 | 1) {
      const item = active.get(color);
      if (!item || item.entry.id !== id || item.entry.stage !== stage || item.loaded) return;
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
