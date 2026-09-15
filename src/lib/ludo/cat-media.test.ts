import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CatMedia } from "@/components/ludo/CatMedia";
import { CAT_IDS, catUrl } from "./cat-effects";
import { BoardEffects } from "@/components/ludo/BoardEffects";
import { boardLayoutOf, COLOR_ORDER } from "./board";
import { PlayerPanel } from "@/components/ludo/PlayerPanel";
import { createGame, DEFAULT_HOUSE_RULES, updateStandings } from "./engine";

it.each(CAT_IDS)("renders %s with a static reduced-motion fallback and bounded artwork", (cat) => {
  const html = renderToStaticMarkup(createElement(CatMedia, { cat, session: "test" }));
  expect(html).toContain(`${catUrl(cat)}?effect=test`);
  expect(html).toContain(`srcSet="${catUrl(cat, true)}"`);
  expect(html).toContain("(prefers-reduced-motion: reduce)");
  expect(html).toContain('aria-hidden="true"');
});
it("resumed house cats use static artwork instead of replaying a victory", () => {
  const html = renderToStaticMarkup(
    createElement(BoardEffects, {
      rankEffects: { red: { cat: "babsb-cat", session: 0, animated: false } },
    }),
  );
  expect(html).toContain("/animation/babsb-cat-still.png?effect=house-rank-red-0");
});
it.each(COLOR_ORDER)(
  "keeps %s finish rank on its card, with no cat graphics even on its turn",
  (color) => {
    const state = createGame("4P", DEFAULT_HOUSE_RULES, {});
    const player = state.players.find((candidate) => candidate.color === color)!;
    for (const token of state.tokens.filter((token) => token.color === color))
      Object.assign(token, { state: "finished", steps: 56 });
    updateStandings(state);
    const html = renderToStaticMarkup(
      createElement(PlayerPanel, {
        state,
        player,
        isTurn: true,
        actingColor: color,
        rolling: false,
        canRoll: false,
        onRoll: () => {},
      }),
    );
    expect(html).toContain(player.nickname);
    expect(html).toContain("Finished #1");
    expect(html).not.toContain("data-cat");
    expect(html).not.toContain("royal-rank-cat-row");
  },
);
it.each(
  COLOR_ORDER.flatMap((first) =>
    COLOR_ORDER.filter((second) => second !== first).map((second) => ({ first, second })),
  ),
)(
  "places rank cats in the diagonal $first/$second houses without enabling guidance",
  ({ first, second }) => {
    const html = renderToStaticMarkup(
      createElement(BoardEffects, {
        layout: boardLayoutOf({ mode: "2P", activeColors: [first, second] }),
        rankEffects: {
          [first]: { cat: "babsb-cat", session: 1 },
          [second]: { cat: "crying-crying-cat", session: 2 },
        },
      }),
    );
    expect(html).toContain(
      `data-color="${first}" data-role="rank" style="left:0%;top:0%;width:40%;height:40%"`,
    );
    expect(html).toContain(
      `data-color="${second}" data-role="rank" style="left:60%;top:60%;width:40%;height:40%"`,
    );
    expect(html).toContain("/animation/babsb-cat.gif");
    expect(html).toContain("/animation/crying-crying-cat.gif");
    expect(html).toContain('aria-hidden="true"');
  },
);
