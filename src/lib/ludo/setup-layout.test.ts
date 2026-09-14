import { readFileSync } from "node:fs";
import { transform } from "lightningcss";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../routes/setup.tsx", import.meta.url), "utf8");
const css = transform({
  filename: "royal.css",
  code: readFileSync(new URL("../../royal.css", import.meta.url)),
}).code.toString();

// Static layout-contract checks, not a substitute for browser geometry tests.
describe("setup form scrolling regression", () => {
  it("starts suggestions off and keeps the toggle separate from the gameplay rules", () => {
    expect(source).toContain(
      "const [showMoveSuggestions, setShowMoveSuggestions] = useState(false)",
    );
    expect(source).toContain("aria-checked={showMoveSuggestions}");
    expect(source.indexOf('aria-labelledby="display-heading"')).toBeLessThan(
      source.indexOf('aria-labelledby="hr-heading"'),
    );
    expect(source).not.toMatch(/>\s*\{index \+ 1\}\s*</);
    expect(source).toContain("claimed as player");
  });
  it("keeps shared main padding in the base layer below page utilities", () => {
    expect(css).toMatch(/@layer base\s*\{\s*main\s*\{/);
  });

  it("reserves the action bar's own height for every roster length", () => {
    const actions = css.match(/\.royal-setup-actions\s*\{([^}]+)\}/)?.[1];
    expect(actions).toBeDefined();
    expect(actions).toMatch(/position:\s*sticky/);
    expect(actions).not.toMatch(/position:\s*(fixed|absolute)/);
    expect(actions).toMatch(/margin-top:/);
    expect(actions).toContain("safe-area-inset-bottom");
    const actionClass = source.match(/<div className="(royal-setup-actions[^"]*)"/)?.[1];
    expect(actionClass).toBeDefined();
    expect(actionClass).not.toMatch(/\b(fixed|absolute)\b/);
    // One footer after the complete roster, not a hard-coded spacer per player count.
    expect(source.indexOf("royal-setup-actions")).toBeGreaterThan(source.indexOf("roster.map"));
    expect(source).not.toContain("pb-28");
  });

  it("stops floating above inputs while a name is focused", () => {
    expect(css).toMatch(
      /\.royal-setup-screen:has\(input:focus\) \.royal-setup-actions\s*\{\s*position:\s*static/,
    );
    expect(css).toMatch(/\.royal-setup-screen input\s*\{\s*scroll-margin-block:/);
  });
});
