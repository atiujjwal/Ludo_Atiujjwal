import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createCaptureFeedback } from "./capture-feedback";
import { COLOR_ORDER } from "./board";
import type { Color } from "./types";

afterEach(() => vi.useRealTimers());
describe("independent capture overlays", () => {
  it("serves the root teddy assets and keeps its loaded state visible", () => {
    expect(existsSync(new URL("../../../public/crying_teddy.gif", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../../public/crying_teddy-still.png", import.meta.url))).toBe(
      true,
    );
    const component = readFileSync(
      new URL("../../components/ludo/BoardEffects.tsx", import.meta.url),
      "utf8",
    );
    expect(component).toContain('visible ? "/crying_teddy.gif" : "/crying_teddy-still.png"');
    expect(component).toContain('srcSet="/crying_teddy-still.png"');
    expect(component).not.toContain("CryingAudio");
    const css = readFileSync(new URL("../../royal.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.royal-crying-teddy\s*\{[^}]*position: absolute/);
    expect(css).toMatch(/@keyframes royal-crying\s*\{[\s\S]*?100%\s*\{\s*opacity: 1/);
  });
  it.each(COLOR_ORDER)("consumes saved events and expires %s once", (color) => {
    vi.useFakeTimers();
    const effects = { show: vi.fn(), hide: vi.fn() };
    const feedback = createCaptureFeedback(4, effects);
    const event = { id: 4, square: 6, tokens: [{ id: `${color}-0`, color }] };
    feedback.update(event);
    expect(effects.show).not.toHaveBeenCalled();
    feedback.update({ ...event, id: 5 });
    feedback.update({ ...event, id: 5 });
    expect(effects.show).toHaveBeenCalledExactlyOnceWith(color, 5);
    vi.advanceTimersByTime(2499);
    expect(effects.hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(effects.hide).toHaveBeenCalledExactlyOnceWith(color);
    feedback.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("restarts victim lifetimes, supports simultaneous victims and cleans obsolete timers", () => {
    vi.useFakeTimers();
    const effects = { show: vi.fn(), hide: vi.fn() };
    const feedback = createCaptureFeedback(undefined, effects);
    const tokens = ["red", "blue"].map((color) => ({ id: color, color: color as Color }));
    feedback.update({ id: 1, square: 6, tokens });
    vi.advanceTimersByTime(1000);
    feedback.update({ id: 2, square: 6, tokens: [tokens[0]!] });
    vi.advanceTimersByTime(1500);
    expect(effects.hide.mock.calls).toEqual([["blue"]]);
    feedback.dispose();
    vi.advanceTimersByTime(10000);
    expect(effects.hide.mock.calls).toEqual([["blue"], ["red"]]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("gives a slowly loaded teddy a full lifetime and ignores obsolete image loads", () => {
    vi.useFakeTimers();
    const effects = { show: vi.fn(), hide: vi.fn() };
    const feedback = createCaptureFeedback(undefined, effects, true);
    const tokens = [{ id: "blue-0", color: "blue" as const }];
    feedback.update({ id: 1, square: 6, tokens });
    vi.advanceTimersByTime(3000);
    expect(effects.hide).not.toHaveBeenCalled();
    feedback.update({ id: 2, square: 6, tokens });
    feedback.loaded("blue", 1);
    vi.advanceTimersByTime(3000);
    expect(effects.hide).not.toHaveBeenCalled();
    feedback.loaded("blue", 2);
    vi.advanceTimersByTime(2499);
    expect(effects.hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(effects.hide).toHaveBeenCalledExactlyOnceWith("blue");
    feedback.dispose();
  });
});
