import { afterEach, expect, it, vi } from "vitest";
import { createFinalCelebration } from "./final-celebration";

afterEach(() => vi.useRealTimers());
const entries = {
  red: { cat: "babsb-cat", session: 10 },
  blue: { cat: "crying-crying-cat", session: 11 },
} as const;

it("waits for every final load, then exactly six foreground seconds", () => {
  vi.useFakeTimers();
  const ready = vi.fn();
  const gate = createFinalCelebration(ready);
  gate.start(entries);
  gate.loaded("red", 10);
  vi.advanceTimersByTime(2000);
  gate.loaded("blue", 9);
  expect(ready).not.toHaveBeenCalled();
  gate.loaded("blue", 11);
  vi.advanceTimersByTime(5999);
  expect(ready).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(ready).toHaveBeenCalledTimes(1);
  gate.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not restart for duplicate loads, state updates or completed visibility changes", () => {
  vi.useFakeTimers();
  const ready = vi.fn();
  const gate = createFinalCelebration(ready);
  gate.start(entries);
  gate.loaded("red", 10);
  gate.loaded("blue", 11);
  vi.advanceTimersByTime(3000);
  gate.start(entries);
  gate.loaded("blue", 11);
  vi.advanceTimersByTime(3000);
  gate.setVisible(false);
  gate.setVisible(true);
  vi.advanceTimersByTime(20000);
  expect(ready).toHaveBeenCalledTimes(1);
  gate.dispose();
});

it("pauses and resumes the remaining countdown without counting hidden time", () => {
  vi.useFakeTimers();
  const ready = vi.fn();
  const gate = createFinalCelebration(ready);
  gate.start(entries);
  gate.loaded("red", 10);
  gate.loaded("blue", 11);
  vi.advanceTimersByTime(2000);
  gate.setVisible(false);
  vi.advanceTimersByTime(60000);
  expect(ready).not.toHaveBeenCalled();
  gate.setVisible(true);
  vi.advanceTimersByTime(3999);
  expect(ready).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(ready).toHaveBeenCalledTimes(1);
  gate.dispose();
});

it("can load or reach the bounded failure fallback while hidden without opening results", () => {
  vi.useFakeTimers();
  const ready = vi.fn();
  const gate = createFinalCelebration(ready, false);
  gate.start(entries);
  gate.loaded("red", 10);
  vi.advanceTimersByTime(30000);
  expect(ready).not.toHaveBeenCalled();
  gate.setVisible(true);
  vi.advanceTimersByTime(6000);
  expect(ready).toHaveBeenCalledTimes(1);
  gate.dispose();
});

it("bounds unresolved media to ten seconds before the six-second countdown", () => {
  vi.useFakeTimers();
  const ready = vi.fn();
  const gate = createFinalCelebration(ready);
  gate.start(entries);
  vi.advanceTimersByTime(15999);
  expect(ready).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(ready).toHaveBeenCalledTimes(1);
  gate.dispose();
});

it.each(["loading", "counting"])("cleans up an obsolete %s celebration", (stage) => {
  vi.useFakeTimers();
  const ready = vi.fn();
  const gate = createFinalCelebration(ready);
  gate.start(entries);
  if (stage === "counting") {
    gate.loaded("red", 10);
    gate.loaded("blue", 11);
  }
  gate.dispose();
  gate.loaded("blue", 11);
  gate.setVisible(true);
  gate.start(entries);
  vi.advanceTimersByTime(30000);
  expect(ready).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
