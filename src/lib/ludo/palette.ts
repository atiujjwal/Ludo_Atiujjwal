import type { Color } from "./types";

export interface Palette {
  base: string;
  light: string;
  dark: string;
  soft: string;
}

export const PALETTE: Record<Color, Palette> = {
  red: {
    base: "var(--ludo-red)",
    light: "var(--ludo-red-light)",
    dark: "var(--ludo-red-dark)",
    soft: "var(--ludo-red-soft)",
  },
  green: {
    base: "var(--ludo-green)",
    light: "var(--ludo-green-light)",
    dark: "var(--ludo-green-dark)",
    soft: "var(--ludo-green-soft)",
  },
  yellow: {
    base: "var(--ludo-yellow)",
    light: "var(--ludo-yellow-light)",
    dark: "var(--ludo-yellow-dark)",
    soft: "var(--ludo-yellow-soft)",
  },
  blue: {
    base: "var(--ludo-blue)",
    light: "var(--ludo-blue-light)",
    dark: "var(--ludo-blue-dark)",
    soft: "var(--ludo-blue-soft)",
  },
};

/** Glossy piece surface: highlight top-left, colour body, darker rim. */
export function tokenSurface(color: Color): string {
  const p = PALETTE[color];
  return `radial-gradient(circle at 32% 26%, ${p.light} 0%, ${p.base} 46%, ${p.dark} 100%)`;
}
