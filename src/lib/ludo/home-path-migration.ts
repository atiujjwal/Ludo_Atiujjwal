import { HOME_LANE_LENGTH, junctionOf, maxStepsOf } from "./board";
import type { GameState } from "./types";

/** Mutates only a cloned/parsed save; marking it makes repeated hydration safe. */
export function normalizeHomePath(state: GameState): GameState {
  if (state.homePathVersion === 2) return state;
  for (const token of state.tokens) {
    if (token.state === "finished") token.steps = maxStepsOf(token);
    else if (token.state !== "base" && token.steps >= junctionOf(token) + HOME_LANE_LENGTH) {
      token.steps = maxStepsOf(token) - 1;
      token.state = "home_stretch";
    }
  }
  state.homePathVersion = 2;
  return state;
}
