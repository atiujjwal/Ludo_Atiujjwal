import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CutRewardPanel } from "@/components/ludo/CutRewardPanel";
import { createGame, DEFAULT_HOUSE_RULES, getLegalMoves } from "./engine";

function reward() {
  const state = createGame("4P", { ...DEFAULT_HOUSE_RULES, cutReward: true }, {});
  state.phase = "modal";
  state.activeModal = "CUT_REWARD";
  state.turn.owedExtraRoll = true;
  Object.assign(state.tokens[0]!, { state: "common", steps: 1 });
  return state;
}

it("renders a compact region with separate action/info buttons, not a dialog", () => {
  const state = reward();
  const snapshot = structuredClone(state);
  const dispatch = vi.fn();
  const html = renderToStaticMarkup(createElement(CutRewardPanel, { state, dispatch }));
  expect(html).toContain("Nice cut! Pick your bonus");
  expect(html).toContain("Extra roll already earned");
  for (const label of ["Bring out a token", "Jump a token 6 spaces", "Roll again"]) {
    expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain(`aria-label="Info: ${label}"`);
  }
  expect(html.match(/<button /g)).toHaveLength(6);
  expect(html.match(/aria-expanded="false"/g)).toHaveLength(3);
  expect(html).toContain("aria-labelledby=");
  expect(html).not.toContain('role="dialog"');
  expect(html).not.toContain("data-radix");
  expect(state).toEqual(snapshot);
  expect(dispatch).not.toHaveBeenCalled();
});

it.each(["all finished", "overshoot"])("keeps info usable for unavailable %s bonuses", (kind) => {
  const state = reward();
  for (const token of state.tokens.filter((token) => token.color === "red"))
    Object.assign(token, { state: "finished", steps: 56 });
  if (kind === "overshoot") Object.assign(state.tokens[0]!, { state: "home_stretch", steps: 55 });
  expect(getLegalMoves(state, 6)).toEqual([]);
  expect(getLegalMoves(state, 6, true)).toEqual([]);
  const html = renderToStaticMarkup(createElement(CutRewardPanel, { state, dispatch: vi.fn() }));
  expect(html.match(/disabled=""/g)).toHaveLength(2);
  expect(html).toContain('aria-label="Info: Bring out a token"');
  expect(html).toContain('aria-label="Info: Jump a token 6 spaces"');
  expect(html).toContain('aria-label="Roll again"');
});

it("renders nothing outside a pending Cut Reward", () => {
  const state = reward();
  state.activeModal = "NONE";
  expect(renderToStaticMarkup(createElement(CutRewardPanel, { state, dispatch: vi.fn() }))).toBe(
    "",
  );
});
