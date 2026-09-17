import { useEffect, useSyncExternalStore } from "react";

let match = -1;
let degraded = false;
let active = 0;
let frame = 0;
let windowStart = 0;
let previous = 0;
let total = 0;
let slow = 0;
let badWindows = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => degraded;
const serverSnapshot = () => false;

function stop() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  previous = 0;
  total = 0;
  slow = 0;
  windowStart = 0;
}
function sample(now: number) {
  if (!active || degraded || document.hidden) return stop();
  if (!windowStart) windowStart = now;
  if (previous) {
    total++;
    if (now - previous > 34) slow++;
  }
  previous = now;
  if (now - windowStart >= 2000) {
    const result = adaptiveWindowResult(badWindows, total, slow);
    badWindows = result.badWindows;
    total = 0;
    slow = 0;
    windowStart = now;
    if (result.degrade) {
      degraded = true;
      stop();
      listeners.forEach((listener) => listener());
      return;
    }
  }
  frame = requestAnimationFrame(sample);
}

export function adaptiveWindowResult(previousBadWindows: number, total: number, slow: number) {
  const badWindows = total >= 20 && slow / total > 0.2 ? previousBadWindows + 1 : 0;
  return { badWindows, degrade: badWindows >= 2 };
}
function start(matchId: number) {
  if (match !== matchId) {
    match = matchId;
    degraded = false;
    badWindows = 0;
    stop();
    listeners.forEach((listener) => listener());
  }
  active++;
  if (!frame && !degraded && !document.hidden) frame = requestAnimationFrame(sample);
  return () => {
    active = Math.max(0, active - 1);
    if (!active) stop();
  };
}

/** Match-local, non-persistent fallback for sustained GIF rendering jank. */
export function useAdaptiveStaticEffects(matchId: number, enabled: boolean) {
  const isDegraded = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => (enabled ? start(matchId) : undefined), [enabled, matchId]);
  return isDegraded;
}
