import type { Color } from "./types";

export interface BoardTheme {
  id: string;
  className: string;
}
export interface TokenSkin {
  id: string;
  className: string;
}
export interface DiceSkin {
  id: string;
  className: string;
}

// Independent presentation defaults; these never enter saved gameplay state.
export const ROYAL_BOARD: BoardTheme = { id: "royal", className: "royal-board" };
export const ROYAL_TOKEN: TokenSkin = { id: "royal", className: "royal-token" };
export const ROYAL_DICE: DiceSkin = { id: "royal", className: "royal-dice" };
export const APPEARANCE = { board: ROYAL_BOARD, token: ROYAL_TOKEN, dice: ROYAL_DICE };
// Counter faces stay brighter than the board's fabric and home paths.
export const COUNTER_COLORS: Record<Color, string> = {
  red: "var(--counter-red)",
  green: "var(--counter-green)",
  blue: "var(--counter-blue)",
  yellow: "var(--counter-yellow)",
};
export const ENAMEL: Record<Color, string> = {
  red: "var(--enamel-red)",
  green: "var(--enamel-green)",
  blue: "var(--enamel-blue)",
  yellow: "var(--enamel-yellow)",
};
