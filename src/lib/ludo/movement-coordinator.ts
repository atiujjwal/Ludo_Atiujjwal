import { boardLayoutOf, cellForToken, maxStepsOf } from "./board";
import { playSfx } from "./audio";
import { stackPlacement } from "./presentation";
import type { GameState, Pending, Token } from "./types";

const HOP_MS = 130;

/**
 * Animate an authorized move with compositor transforms. The reducer remains
 * the source of truth and receives exactly one completion action.
 */
export function runMovement(
  state: GameState,
  token: Token,
  pending: Pending,
  complete: () => void,
): () => void {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const hopMs = reduced ? 30 : HOP_MS;
  const layout = boardLayoutOf(state.gameConfig);
  const route = [cellForToken(token, 0, layout)];
  for (let hop = 1; hop <= pending.remaining; hop++)
    route.push(cellForToken({ ...token, state: "common", steps: token.steps + hop }, 0, layout));

  const reachesHome = token.steps + pending.remaining === maxStepsOf(token);
  const settleMs = reduced ? 60 : reachesHome ? 380 : 200;
  const travelMs = pending.remaining * hopMs;
  const wrapper = document.querySelector<HTMLElement>(`[data-token-id="${CSS.escape(token.id)}"]`);
  let animation: Animation | undefined;
  let settleAnimation: Animation | undefined;
  let done = false;
  let due = false;
  let timeout: number | undefined;
  const cueTimers: number[] = [];
  const finish = () => {
    if (done) return;
    if (document.hidden) {
      due = true;
      return;
    }
    done = true;
    complete();
  };
  const visibility = () => {
    if (document.hidden) animation?.pause();
    else if (due) finish();
    else animation?.play();
  };

  for (let hop = 0; hop < pending.remaining; hop++)
    cueTimers.push(window.setTimeout(() => playSfx("tokenHop"), (hop + 1) * hopMs));

  if (!reduced && wrapper?.animate) {
    animation = wrapper.animate(
      route.map((cell, index) => ({
        transform: `translate3d(${cell.col * 100}%, ${cell.row * 100}%, 0)`,
        offset: index / Math.max(1, route.length - 1),
      })),
      { duration: travelMs, easing: "linear", fill: "forwards" },
    );
    void animation.finished.then(
      () => {
        if (reachesHome) {
          const button = wrapper.querySelector<HTMLElement>(".royal-piece-hit");
          const slot = state.tokens
            .filter((candidate) => candidate.color === token.color)
            .indexOf(token);
          const target = stackPlacement(slot, 4);
          const settle = () => {
            settleAnimation = button?.animate(
              [
                { transform: button.style.transform },
                { transform: `translate(${target.x * 100}%, ${target.y * 100}%)` },
              ],
              { duration: 150, easing: "ease-out", fill: "forwards" },
            );
          };
          cueTimers.push(window.setTimeout(settle, 200));
        }
        timeout = window.setTimeout(finish, settleMs);
      },
      () => {},
    );
  } else {
    timeout = window.setTimeout(finish, travelMs + settleMs);
  }
  // Transition events are advisory; this fallback owns completion.
  const fallback = window.setTimeout(finish, travelMs + settleMs + 500);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    done = true;
    animation?.cancel();
    settleAnimation?.cancel();
    window.clearTimeout(timeout);
    window.clearTimeout(fallback);
    cueTimers.forEach(window.clearTimeout);
    document.removeEventListener("visibilitychange", visibility);
  };
}
