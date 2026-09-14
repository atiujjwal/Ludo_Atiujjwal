import type { Color, GameConfig, Token } from "./types";

export interface Cell {
  col: number;
  row: number;
}
export const TRACK_LENGTH = 52;
export const HOME_LANE_LENGTH = 5;

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

/** Five private cells; the next dice step enters the centre home triangle. */
export const HOME_COLUMN: Record<Color, Cell[]> = {
  red: run({ col: 1, row: 7 }, { col: 5, row: 7 }),
  green: run({ col: 7, row: 1 }, { col: 7, row: 5 }),
  yellow: run({ col: 13, row: 7 }, { col: 9, row: 7 }),
  blue: run({ col: 7, row: 13 }, { col: 7, row: 9 }),
};

export const GOAL: Cell = { col: 7, row: 7 };
export const FINISH_CELL: Record<Color, Cell> = {
  red: { col: 6, row: 7 },
  green: { col: 7, row: 6 },
  yellow: { col: 8, row: 7 },
  blue: { col: 7, row: 8 },
};

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
  return TRACK_LENGTH - 1 + TRACK_LENGTH * token.lap;
}

export function maxStepsOf(token: Pick<Token, "lap">): number {
  return junctionOf(token) + HOME_LANE_LENGTH;
}

export function isOnCommon(token: Token): boolean {
  return token.state !== "base" && token.state !== "finished" && token.steps < junctionOf(token);
}

export function absoluteIndex(color: Color, steps: number, layout = DEFAULT_BOARD_LAYOUT): number {
  return (START_OFFSET[geometryColor(color, layout)] + steps) % TRACK_LENGTH;
}

/** Where a token sits on the 15x15 grid. Base tokens use their yard slot. */
export function cellForToken(token: Token, slot: number, layout = DEFAULT_BOARD_LAYOUT): Cell {
  const geometry = geometryColor(token.color, layout);
  if (token.state === "base") {
    const origin = BASE_ORIGIN[geometry];
    const s = BASE_SLOTS[slot % 4]!;
    return { col: origin.col + s.col, row: origin.row + s.row };
  }
  const junction = junctionOf(token);
  if (token.steps < junction) {
    return TRACK[absoluteIndex(token.color, token.steps, layout)]!;
  }
  const inHome = token.steps - junction;
  if (inHome >= HOME_LANE_LENGTH) return FINISH_CELL[geometry];
  return HOME_COLUMN[geometry][inHome]!;
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

export interface BoardLayout {
  readonly colorToCorner: Readonly<Record<Color, Corner>>;
  readonly cornerToColor: Readonly<Record<Corner, Color>>;
}
export const CORNER_COLOR: Readonly<Record<Corner, Color>> = Object.freeze({
  tl: "red",
  tr: "green",
  br: "yellow",
  bl: "blue",
});
export const DEFAULT_BOARD_LAYOUT: BoardLayout = Object.freeze({
  colorToCorner: Object.freeze({ ...COLOR_CORNER }),
  cornerToColor: CORNER_COLOR,
});
const layouts = new Map<string, BoardLayout>();

/** Geometry is a seat's property; token colour is always the player's identity. */
export function geometryColor(color: Color, layout = DEFAULT_BOARD_LAYOUT): Color {
  return CORNER_COLOR[layout.colorToCorner[color]];
}

/** Deterministic across starts, rematches and old saves; never modifies game data. */
export function boardLayoutOf(config: Pick<GameConfig, "mode" | "activeColors">): BoardLayout {
  const [first, second] = config.activeColors;
  if (
    config.mode !== "2P" ||
    config.activeColors.length !== 2 ||
    !first ||
    !second ||
    first === second ||
    !COLOR_ORDER.includes(first) ||
    !COLOR_ORDER.includes(second)
  )
    return DEFAULT_BOARD_LAYOUT;
  const key = `${first}:${second}`;
  const cached = layouts.get(key);
  if (cached) return cached;
  const assigned: Partial<Record<Color, Corner>> = { [first]: "tl", [second]: "br" };
  const free = new Set<Corner>(["tr", "bl"]);
  const unused = COLOR_ORDER.filter((color) => color !== first && color !== second);
  for (const color of unused) {
    if (free.has(COLOR_CORNER[color])) {
      assigned[color] = COLOR_CORNER[color];
      free.delete(COLOR_CORNER[color]);
    }
  }
  for (const color of unused) {
    if (!assigned[color]) {
      const corner = free.values().next().value!;
      assigned[color] = corner;
      free.delete(corner);
    }
  }
  const colorToCorner = assigned as Record<Color, Corner>;
  const cornerToColor = Object.fromEntries(
    COLOR_ORDER.map((color) => [colorToCorner[color], color]),
  ) as Record<Corner, Color>;
  const layout = Object.freeze({
    colorToCorner: Object.freeze(colorToCorner),
    cornerToColor: Object.freeze(cornerToColor),
  });
  layouts.set(key, layout);
  return layout;
}

/** The colour sitting diagonally across the board. */
export const OPPOSITE_COLOR: Record<Color, Color> = {
  red: "yellow",
  yellow: "red",
  green: "blue",
  blue: "green",
};
