import type { Color, Token } from "./types";

export interface Cell {
  col: number;
  row: number;
}

/** Absolute start index of each color on the shared 52-square loop. */
export const START_OFFSET: Record<Color, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

/** Safe squares: the four start squares plus the four stars. */
export const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function run(from: Cell, to: Cell): Cell[] {
  const cells: Cell[] = [];
  const dc = Math.sign(to.col - from.col);
  const dr = Math.sign(to.row - from.row);
  let { col, row } = from;
  cells.push({ col, row });
  while (col !== to.col || row !== to.row) {
    col += dc;
    row += dr;
    cells.push({ col, row });
  }
  return cells;
}

/** The 52 shared track cells on a 15x15 grid, clockwise, index 0 = red start. */
export const TRACK: Cell[] = [
  ...run({ col: 1, row: 6 }, { col: 5, row: 6 }),
  ...run({ col: 6, row: 5 }, { col: 6, row: 0 }),
  { col: 7, row: 0 },
  ...run({ col: 8, row: 0 }, { col: 8, row: 5 }),
  ...run({ col: 9, row: 6 }, { col: 14, row: 6 }),
  { col: 14, row: 7 },
  ...run({ col: 14, row: 8 }, { col: 9, row: 8 }),
  ...run({ col: 8, row: 9 }, { col: 8, row: 14 }),
  { col: 7, row: 14 },
  ...run({ col: 6, row: 14 }, { col: 6, row: 9 }),
  ...run({ col: 5, row: 8 }, { col: 0, row: 8 }),
  { col: 0, row: 7 },
  { col: 0, row: 6 },
];

/** Six private home-column cells per color, ordered from entry to goal. */
export const HOME_COLUMN: Record<Color, Cell[]> = {
  red: run({ col: 1, row: 7 }, { col: 6, row: 7 }),
  green: run({ col: 7, row: 1 }, { col: 7, row: 6 }),
  yellow: run({ col: 13, row: 7 }, { col: 8, row: 7 }),
  blue: run({ col: 7, row: 13 }, { col: 7, row: 8 }),
};

export const GOAL: Cell = { col: 7, row: 7 };

/** Top-left corner of each color's base yard (6x6 block). */
export const BASE_ORIGIN: Record<Color, Cell> = {
  red: { col: 0, row: 0 },
  green: { col: 9, row: 0 },
  yellow: { col: 9, row: 9 },
  blue: { col: 0, row: 9 },
};

export const BASE_SLOTS: Cell[] = [
  { col: 1.4, row: 1.4 },
  { col: 3.4, row: 1.4 },
  { col: 1.4, row: 3.4 },
  { col: 3.4, row: 3.4 },
];

/** Step index at which this token turns off the shared loop into its home column. */
export function junctionOf(token: Pick<Token, "lap">): number {
  return 51 + 52 * token.lap;
}

export function maxStepsOf(token: Pick<Token, "lap">): number {
  return junctionOf(token) + 6;
}

export function isOnCommon(token: Token): boolean {
  return token.state !== "base" && token.state !== "finished" && token.steps < junctionOf(token);
}

export function absoluteIndex(color: Color, steps: number): number {
  return (START_OFFSET[color] + steps) % 52;
}

/** Where a token sits on the 15x15 grid. Base tokens use their yard slot. */
export function cellForToken(token: Token, slot: number): Cell {
  if (token.state === "base") {
    const origin = BASE_ORIGIN[token.color];
    const s = BASE_SLOTS[slot % 4]!;
    return { col: origin.col + s.col, row: origin.row + s.row };
  }
  const junction = junctionOf(token);
  if (token.steps < junction) {
    return TRACK[absoluteIndex(token.color, token.steps)]!;
  }
  const inHome = token.steps - junction;
  if (inHome >= 6) return GOAL;
  return HOME_COLUMN[token.color][inHome]!;
}

export const COLOR_ORDER: Color[] = ["red", "green", "yellow", "blue"];

export const COLOR_LABEL: Record<Color, string> = {
  red: "Red",
  green: "Green",
  yellow: "Yellow",
  blue: "Blue",
};

/** Distinct glyph per color so the board reads without relying on color alone. */
export const COLOR_GLYPH: Record<Color, string> = {
  red: "●",
  green: "▲",
  yellow: "■",
  blue: "◆",
};

export type Corner = "tl" | "tr" | "br" | "bl";

/** Which corner of the board each colour owns — derived from BASE_ORIGIN. */
export const COLOR_CORNER: Record<Color, Corner> = {
  red: "tl",
  green: "tr",
  yellow: "br",
  blue: "bl",
};

/** The colour sitting diagonally across the board. */
export const OPPOSITE_COLOR: Record<Color, Color> = {
  red: "yellow",
  yellow: "red",
  green: "blue",
  blue: "green",
};

