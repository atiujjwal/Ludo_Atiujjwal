import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HappyTeddy } from "@/components/ludo/HappyTeddy";

it("renders the happy GIF with a reduced-motion fallback and available offline assets", () => {
  const html = renderToStaticMarkup(createElement(HappyTeddy));
  expect(html).toContain('src="/happy_teddy.gif"');
  expect(html).toContain('srcSet="/happy_teddy-still.png"');
  expect(html).toContain("(prefers-reduced-motion: reduce)");
  for (const name of ["happy_teddy.gif", "happy_teddy-still.png"]) {
    expect(existsSync(new URL(`../../../public/${name}`, import.meta.url))).toBe(true);
  }
});

it("mounts the happy teddy only in the winner dialog, including team victories", () => {
  const source = readFileSync(new URL("../../components/ludo/Modals.tsx", import.meta.url), "utf8");
  expect(source.indexOf("<HappyTeddy />")).toBeGreaterThan(
    source.indexOf('state.activeModal === "GAME_OVER"'),
  );
  expect(source.match(/<HappyTeddy \/>/g)).toHaveLength(1);
});
