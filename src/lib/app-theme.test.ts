import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_THEME_KEY,
  THEME_BOOTSTRAP,
  THEME_COLORS,
  readAppTheme,
  saveAppTheme,
} from "./app-theme";

function browser(stored: string | null = null, unavailable = false) {
  const values = new Map<string, string>();
  if (stored !== null) values.set(APP_THEME_KEY, stored);
  const localStorage = {
    getItem: vi.fn((key: string) => {
      if (unavailable) throw new Error("Storage unavailable");
      return values.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (unavailable) throw new Error("Storage unavailable");
      values.set(key, value);
    }),
  };
  const classes = new Set<string>();
  const root = {
    dataset: {} as Record<string, string>,
    style: { colorScheme: "" },
    classList: {
      toggle: (name: string, enabled: boolean) =>
        enabled ? classes.add(name) : classes.delete(name),
    },
  };
  const meta = {
    content: "",
    setAttribute: (_key: string, value: string) => {
      meta.content = value;
    },
  };
  const document = { documentElement: root, querySelector: () => meta };
  vi.stubGlobal("window", { localStorage });
  vi.stubGlobal("document", document);
  return { localStorage, document, root, meta, classes };
}
afterEach(() => vi.unstubAllGlobals());

describe("independent persisted app appearance", () => {
  it.each([null, "", "system", "invalid", "dark"])("defaults %s to dark", (stored) => {
    browser(stored);
    expect(readAppTheme()).toBe("dark");
  });
  it("switches Dark → Light → Dark synchronously and persists only the appearance key", () => {
    const env = browser();
    for (const theme of ["dark", "light", "dark"] as const) {
      saveAppTheme(theme);
      expect(env.root.dataset["theme"]).toBe(theme);
      expect(env.root.style.colorScheme).toBe(theme);
      expect(env.classes.has("dark")).toBe(theme === "dark");
      expect(env.meta.content).toBe(THEME_COLORS[theme]);
      expect(readAppTheme()).toBe(theme);
    }
    expect(env.localStorage.setItem.mock.calls.every(([key]) => key === APP_THEME_KEY)).toBe(true);
  });
  it("allows switching when persistence is blocked", () => {
    const env = browser(null, true);
    expect(readAppTheme()).toBe("dark");
    expect(() => saveAppTheme("light")).not.toThrow();
    expect(env.root.dataset["theme"]).toBe("light");
  });
  it.each(["light", "dark", "invalid", null])(
    "bootstraps %s before React, including cached HTML",
    (stored) => {
      const env = browser(stored);
      runInNewContext(THEME_BOOTSTRAP, { localStorage: env.localStorage, document: env.document });
      expect(env.root.dataset["theme"]).toBe(stored === "light" ? "light" : "dark");
      expect(env.meta.content).toBe(THEME_COLORS[stored === "light" ? "light" : "dark"]);
    },
  );
  it("bootstraps dark without storage access", () => {
    const env = browser(null, true);
    expect(() =>
      runInNewContext(THEME_BOOTSTRAP, { localStorage: env.localStorage, document: env.document }),
    ).not.toThrow();
    expect(env.root.dataset["theme"]).toBe("dark");
  });
});

const palettes = readFileSync(new URL("../app-palettes.css", import.meta.url), "utf8");
const blocks = [...palettes.matchAll(/:root[^{}]*\{([^}]+)\}/g)].map((match) =>
  Object.fromEntries(
    [...match[1]!.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]),
  ),
);
function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255);
  const linear = channels.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
function ratio(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}
describe("royal palette contrast", () => {
  it.each(["dark", "light"])(
    "%s house ornaments remain distinct from their jewel-colour fabric",
    (theme) => {
      const p = theme === "dark" ? blocks[0]! : { ...blocks[0], ...blocks[1] };
      for (const color of ["red", "green", "blue", "yellow"]) {
        const ink = p[color === "yellow" ? "--royal-house-yellow-ink" : "--royal-house-ornament"];
        expect(
          ratio(ink, p[`--royal-house-${color}`]),
          `${theme} ${color} house ornament`,
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );
  it.each(["dark", "light"])("%s essential text and player labels meet 4.5:1", (theme) => {
    const p = theme === "dark" ? blocks[0]! : { ...blocks[0], ...blocks[1] };
    const pairs: [string, string][] = [
      ["--foreground", "--background"],
      ["--card-foreground", "--card"],
      ["--muted-foreground", "--card"],
      ["--primary-foreground", "--primary"],
      ...["red", "green", "blue", "yellow"].flatMap<[string, string]>((color) => [
        [`--ludo-${color}-light`, "--card"],
        [`--ludo-${color}-light`, `--ludo-${color}-soft`],
      ]),
    ];
    for (const [ink, surface] of pairs)
      expect(ratio(p[ink], p[surface]), `${theme}: ${ink} on ${surface}`).toBeGreaterThanOrEqual(
        4.5,
      );
    for (const color of ["red", "green", "blue", "yellow"]) {
      const ink = p[color === "yellow" ? "--counter-yellow-ink" : "--counter-ink"];
      expect(ratio(ink, p[`--counter-${color}`]), `${color} symbol`).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(p["--royal-safe-ink"], p["--royal-safe-surface"])).toBeGreaterThanOrEqual(3);
    expect(ratio(p["--royal-cell-edge"], p["--royal-marble-top"])).toBeGreaterThanOrEqual(3);
  });
});
