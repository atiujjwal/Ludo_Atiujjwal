import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame, DEFAULT_HOUSE_RULES, updateStandings, resolveCaptures } from "./engine";
import { absoluteIndex, boardLayoutOf, COLOR_ORDER } from "./board";
import { createRankFeedback, rankCats } from "./cat-effects";
import type { Color, Mode } from "./types";

afterEach(() => vi.useRealTimers());
describe("rank cat identity and timing", () => {
  it.each(
    COLOR_ORDER.flatMap((first) =>
      COLOR_ORDER.filter((second) => second !== first).map((second) => ({ first, second })),
    ),
  )("preserves cutter identity with diagonal $first/$second seating", ({ first, second }) => {
    const state = createGame("2P", DEFAULT_HOUSE_RULES, {}, [first, second]);
    const cutter = state.tokens.find((token) => token.color === first)!;
    const victim = state.tokens.find((token) => token.color === second)!;
    Object.assign(cutter, { state: "common", steps: 1 });
    const layout = boardLayoutOf(state.gameConfig);
    const square = absoluteIndex(first, 1, layout);
    Object.assign(victim, {
      state: "common",
      steps: (square - absoluteIndex(second, 0, layout) + 52) % 52,
    });
    expect(resolveCaptures(state, cutter)).toEqual([victim.id]);
    expect(state.lastCapture?.cutterColor).toBe(first);
    expect(state.lastCapture?.tokens[0]?.color).toBe(second);
  });
  it.each(["red", "green", "yellow", "blue"] as Color[])(
    "records %s as the actual cutter, not the current player",
    (color) => {
      const state = createGame("2V2", DEFAULT_HOUSE_RULES, {});
      const cutter = state.tokens.find((token) => token.color === color)!;
      Object.assign(cutter, { state: "common", steps: 1 });
      const victim = state.tokens.find(
        (token) =>
          state.players.find((p) => p.color === token.color)!.teamId !==
          state.players.find((p) => p.color === color)!.teamId,
      )!;
      const layout = boardLayoutOf(state.gameConfig);
      const square = absoluteIndex(color, 1, layout);
      const start = absoluteIndex(victim.color, 0, layout);
      Object.assign(victim, { state: "common", steps: (square - start + 52) % 52 });
      state.turn.currentPlayerId = state.players.find((player) => player.color !== color)!.id;
      expect(resolveCaptures(state, cutter)).toContain(victim.id);
      expect(state.lastCapture?.cutterColor).toBe(color);
    },
  );
  it.each(["2P", "3P", "4P"] as Mode[])(
    "assigns every %s rank and the unfinished loser correctly",
    (mode) => {
      const state = createGame(mode, DEFAULT_HOUSE_RULES, {});
      const colors = state.players.map((player) => player.color);
      expect(rankCats(state)).toEqual({});
      for (const [index, color] of colors.slice(0, -1).entries()) {
        for (const token of state.tokens.filter((t) => t.color === color))
          Object.assign(token, { state: "finished", steps: 56 });
        updateStandings(state);
        expect(rankCats(state)[color]).toBe(["babsb-cat", "dancing-cat-ai", "happy-cat"][index]);
        if (index < colors.length - 2) expect(state.phase).not.toBe("over");
      }
      expect(state.phase).toBe("over");
      const loser = colors.at(-1)!;
      expect(state.players.find((player) => player.color === loser)!.finished).toBe(true);
      expect(state.tokens.filter((t) => t.color === loser).every((t) => t.state === "base")).toBe(
        true,
      );
      expect(rankCats(state)[loser]).toBe("crying-crying-cat");
    },
  );
  it.each(["A", "B"] as const)(
    "waits for the whole winning team %s and includes every losing member",
    (team) => {
      const state = createGame("2V2", DEFAULT_HOUSE_RULES, {});
      const winners = state.players.filter((p) => p.teamId === team);
      for (const player of winners) {
        for (const token of state.tokens.filter((t) => t.color === player.color))
          Object.assign(token, { state: "finished", steps: 56 });
        updateStandings(state);
        if (!state.winnerTeam) expect(rankCats(state)).toEqual({});
      }
      for (const player of state.players)
        expect(rankCats(state)[player.color]).toBe(
          player.teamId === team ? "babsb-cat" : "crying-crying-cat",
        );
    },
  );
  it("suppresses saved ranks, expires at three loaded seconds and ignores obsolete loads", () => {
    vi.useFakeTimers();
    const effects = { show: vi.fn(), hide: vi.fn() };
    const feedback = createRankFeedback({ red: "babsb-cat" }, effects);
    feedback.update({ red: "babsb-cat", blue: "dancing-cat-ai" });
    expect(effects.show).toHaveBeenCalledTimes(1);
    const session = effects.show.mock.calls[0]![1].session;
    vi.advanceTimersByTime(1000);
    feedback.loaded("blue", session - 1);
    feedback.loaded("blue", session);
    vi.advanceTimersByTime(2999);
    feedback.loaded("blue", session);
    expect(effects.hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(effects.hide).toHaveBeenCalledExactlyOnceWith("blue");
    feedback.update({ red: "babsb-cat", blue: "dancing-cat-ai" });
    expect(effects.show).toHaveBeenCalledTimes(1);
    feedback.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds failed rank loads", () => {
    vi.useFakeTimers();
    const effects = { show: vi.fn(), hide: vi.fn() };
    const feedback = createRankFeedback({}, effects);
    feedback.update({ red: "babsb-cat" });
    vi.advanceTimersByTime(10000);
    expect(effects.hide).toHaveBeenCalledExactlyOnceWith("red");
  });
  it("celebrates all final houses once, replacing earlier rank timers without stale loads", () => {
    vi.useFakeTimers();
    const effects = { show: vi.fn(), hide: vi.fn() };
    const feedback = createRankFeedback({ red: "babsb-cat" }, effects);
    feedback.update({ red: "babsb-cat", green: "dancing-cat-ai" });
    const old = effects.show.mock.calls[0]![1].session;
    const final = { red: "babsb-cat", green: "dancing-cat-ai", blue: "crying-crying-cat" } as const;
    feedback.update(final, true);
    expect(effects.show).toHaveBeenCalledTimes(4);
    feedback.loaded("green", old);
    for (const [color, entry] of effects.show.mock.calls.slice(1))
      feedback.loaded(color, entry.session);
    feedback.update(final);
    expect(effects.show).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(2999);
    expect(effects.hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(effects.hide).toHaveBeenCalledTimes(3);
    feedback.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
