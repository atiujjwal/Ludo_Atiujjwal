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
export const ENAMEL: Record<Color, string> = {
  red: "#891c36",
  green: "#105943",
  blue: "#173c7d",
  yellow: "#a87520",
};
