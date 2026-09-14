import type { GameState } from "./types";
import { normalizeGuidance } from "./guidance";
import { normalizeHomePath } from "./home-path-migration";
import { maxStepsOf } from "./board";

const KEY = "ludo:save:v1";

export function saveGame(state: GameState): void {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      ...state,
      settings: normalizeGuidance(state.settings),
      lastSavedAt: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* storage full or blocked — the game keeps running in memory */
  }
}

function looksValid(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<GameState>;
  return (
    s.schemaVersion === 1 &&
    !!s.gameConfig &&
    Array.isArray(s.players) &&
    s.players.length >= 2 &&
    Array.isArray(s.tokens) &&
    s.tokens.length >= 8 &&
    !!s.turn &&
    typeof s.turn.currentPlayerId === "string"
  );
}

export function loadGame(): GameState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!looksValid(parsed)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    const state = normalizeHomePath(parsed);
    state.settings = normalizeGuidance(state.settings);
    // Never restore mid-animation or mid-roll.
    if (state.pending) {
      // Rewind uncompleted triangle entry when discarding interrupted animation.
      const token = state.tokens.find((t) => t.id === state.pending?.tokenId);
      if (state.pending.finishStage && token && token.state !== "finished") {
        token.steps = maxStepsOf(token) - 1;
        token.state = "home_stretch";
      }
      state.pending = null;
      state.phase = "idle";
      state.turn.diceValue = null;
      state.legalMoves = [];
    }
    if (state.phase === "rolling") state.phase = "idle";
    return state;
  } catch {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function hasSave(): boolean {
  return loadGame() !== null;
}

export function clearSave(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
