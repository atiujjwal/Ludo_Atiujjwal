import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { createCaptureFeedback } from "./capture-feedback";
import { CAT_IDS, catUrl } from "./cat-effects";
import { COLOR_ORDER } from "./board";

afterEach(() => vi.useRealTimers());
describe("nonblocking capture cat sequences", () => {
  it("has every source GIF and no obsolete teddy source", () => {
    for (const cat of CAT_IDS)
      expect(existsSync(new URL(`../../../public${catUrl(cat)}`, import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../../public/crying_teddy.gif", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../../../public/animation/happy_teddy.gif", import.meta.url))).toBe(
      false,
    );
  });
  it.each(COLOR_ORDER)("shows both %s victim stages for three loaded seconds each", (color) => {
    vi.useFakeTimers();
    const effects = { show: vi.fn(), hide: vi.fn() };
    const feedback = createCaptureFeedback(4, effects);
    const event = { id: 4, square: 6, tokens: [{ id: `${color}-0`, color }] };
    feedback.update(event);
    expect(effects.show).not.toHaveBeenCalled();
    feedback.update({ ...event, id: 5 });
    feedback.update({ ...event, id: 5 });
    expect(effects.show).toHaveBeenCalledExactlyOnceWith(color, {
      id: 5,
      stage: 0,
      role: "victim",
      cat: "banana-cat-crying",
    });
    vi.advanceTimersByTime(3000); // loading doesn't consume the display interval
    feedback.loaded(color, 5, 0);
    vi.advanceTimersByTime(2999);
    expect(effects.show).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(effects.show).toHaveBeenLastCalledWith(color, {
      id: 5,
      stage: 1,
      role: "victim",
      cat: "crying-crying-cat",
    });
    feedback.loaded(color, 5, 0); // stale first-stage callback
    feedback.loaded(color, 5, 1);
    vi.advanceTimersByTime(1000);
    feedback.loaded(color, 5, 1); // duplicate load can't extend the interval
    vi.advanceTimersByTime(2000);
    expect(effects.hide).toHaveBeenCalledExactlyOnceWith(color);
    feedback.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("shows the actual cutter and simultaneous victims; newer roles replace older ones", () => {
    vi.useFakeTimers();
    const effects = { show: vi.fn(), hide: vi.fn() };
    const feedback = createCaptureFeedback(undefined, effects);
    feedback.update({
      id: 1,
      square: 6,
      cutterColor: "blue",
      tokens: [
        { id: "red-0", color: "red" },
        { id: "green-0", color: "green" },
      ],
    });
    expect(effects.show).toHaveBeenCalledWith("blue", {
      id: 1,
      stage: 0,
      role: "cutter",
      cat: "bleh-cat",
    });
    feedback.loaded("blue", 1, 0);
    vi.advanceTimersByTime(3000);
    expect(effects.show).toHaveBeenLastCalledWith("blue", {
      id: 1,
      stage: 1,
      role: "cutter",
      cat: "cat-orange-cat",
    });
    feedback.update({
      id: 2,
      square: 6,
      cutterColor: "red",
      tokens: [{ id: "blue-0", color: "blue" }],
    });
    feedback.loaded("blue", 1, 1);
    feedback.loaded("blue", 2, 0);
    vi.advanceTimersByTime(3000);
    expect(effects.show).toHaveBeenLastCalledWith("blue", {
      id: 2,
      stage: 1,
      role: "victim",
      cat: "crying-crying-cat",
    });
    feedback.dispose();
    vi.advanceTimersByTime(20000);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds missing-image stages and supports legacy events without a cutter", () => {
    vi.useFakeTimers();
    const effects = { show: vi.fn(), hide: vi.fn() };
    const feedback = createCaptureFeedback(undefined, effects);
    feedback.update({ id: 1, square: 6, tokens: [{ id: "red-0", color: "red" }] });
    vi.advanceTimersByTime(20000);
    expect(effects.show).toHaveBeenCalledTimes(2);
    expect(effects.hide).toHaveBeenCalledExactlyOnceWith("red");
  });
  it("cancels an obsolete house sequence when a rank celebration replaces it", () => {
    vi.useFakeTimers();
    const effects = { show: vi.fn(), hide: vi.fn() };
    const feedback = createCaptureFeedback(undefined, effects);
    feedback.update({ id: 1, square: 6, tokens: [{ id: "red-0", color: "red" }] });
    feedback.loaded("red", 1, 0);
    feedback.cancel("red");
    feedback.cancel("red");
    feedback.loaded("red", 1, 0);
    vi.advanceTimersByTime(20000);
    feedback.update({ id: 1, square: 6, tokens: [{ id: "red-0", color: "red" }] });
    expect(effects.show).toHaveBeenCalledTimes(1);
    expect(effects.hide).toHaveBeenCalledExactlyOnceWith("red");
    expect(vi.getTimerCount()).toBe(0);
  });
});
