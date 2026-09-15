import { afterEach, expect, it, vi } from "vitest";
import { createTokenHomeFeedback } from "./cat-effects";
import { COLOR_ORDER } from "./board";
import { createGame, DEFAULT_HOUSE_RULES } from "./engine";

afterEach(() => vi.useRealTimers());

it.each(COLOR_ORDER)("celebrates the first three settled %s tokens, never its fourth", (color) => {
  vi.useFakeTimers();
  const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
  const effects = { show: vi.fn(), hide: vi.fn() };
  const feedback = createTokenHomeFeedback(state.tokens, effects);
  const own = state.tokens.filter((token) => token.color === color);
  for (const [index, token] of own.entries()) {
    Object.assign(token, { state: "home_stretch", steps: 56 });
    feedback.update(state.tokens);
    expect(effects.show).toHaveBeenCalledTimes(index < 3 ? index : 3);
    token.state = "finished";
    feedback.update(state.tokens);
    feedback.update(state.tokens);
    expect(effects.show).toHaveBeenCalledTimes(Math.min(index + 1, 3));
    if (index === 3) continue;
    const [owner, entry] = effects.show.mock.calls.at(-1)!;
    expect(owner).toBe(color);
    expect(entry.cat).toBe("weird-cute");
    feedback.loaded(color, entry.session);
    vi.advanceTimersByTime(2999);
    expect(effects.hide).toHaveBeenCalledTimes(index);
    vi.advanceTimersByTime(1);
    expect(effects.hide).toHaveBeenCalledTimes(index + 1);
  }
  feedback.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it("seeds resumed finishes and replaces rapid arrivals without stale callbacks", () => {
  vi.useFakeTimers();
  const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
  const own = state.tokens.filter((token) => token.color === "red");
  own[0]!.state = "finished";
  const effects = { show: vi.fn(), hide: vi.fn() };
  const feedback = createTokenHomeFeedback(state.tokens, effects);
  feedback.update(state.tokens);
  expect(effects.show).not.toHaveBeenCalled();
  own[1]!.state = "finished";
  feedback.update(state.tokens);
  const first = effects.show.mock.calls.at(-1)![1].session;
  feedback.loaded("red", first);
  vi.advanceTimersByTime(2000);
  own[2]!.state = "finished";
  feedback.update(state.tokens);
  const latest = effects.show.mock.calls.at(-1)![1].session;
  feedback.loaded("red", first);
  feedback.loaded("red", latest);
  vi.advanceTimersByTime(2999);
  expect(effects.hide).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(effects.hide).toHaveBeenCalledExactlyOnceWith("red");
  own[3]!.state = "finished";
  feedback.update(state.tokens);
  expect(effects.show).toHaveBeenCalledTimes(2);
  feedback.cancel("red");
  feedback.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it("uses the completed token's colour, independently of the controlling teammate", () => {
  vi.useFakeTimers();
  const state = createGame("2V2", DEFAULT_HOUSE_RULES, {});
  const effects = { show: vi.fn(), hide: vi.fn() };
  const feedback = createTokenHomeFeedback(state.tokens, effects);
  state.tokens.find((token) => token.color === "yellow")!.state = "finished";
  feedback.update(state.tokens);
  expect(effects.show).toHaveBeenCalledWith(
    "yellow",
    expect.objectContaining({ cat: "weird-cute" }),
  );
  feedback.cancel("yellow");
  vi.advanceTimersByTime(20000);
  expect(effects.hide).toHaveBeenCalledExactlyOnceWith("yellow");
  expect(vi.getTimerCount()).toBe(0);
});
