import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CatMedia, ResultCat } from "@/components/ludo/CatMedia";
import { CAT_IDS, catUrl } from "./cat-effects";

it.each(CAT_IDS)("renders %s with a static reduced-motion fallback and bounded artwork", (cat) => {
  const html = renderToStaticMarkup(createElement(CatMedia, { cat, session: "test" }));
  expect(html).toContain(`${catUrl(cat)}?effect=test`);
  expect(html).toContain(`srcSet="${catUrl(cat, true)}"`);
  expect(html).toContain("(prefers-reduced-motion: reduce)");
  expect(html).toContain('aria-hidden="true"');
});
it("resumed results use static cats instead of replaying a victory", () => {
  const html = renderToStaticMarkup(
    createElement(ResultCat, { cat: "babsb-cat", animate: false, session: "saved" }),
  );
  expect(html).toContain('src="/animation/babsb-cat-still.png?effect=saved"');
});
