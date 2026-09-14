import type { CSSProperties } from "react";
import type { Cell } from "./board";
import type { Color } from "./types";
import { ENAMEL } from "./theme";

export const cellStyle = (cell: Cell, size = 1): CSSProperties => ({
  left: `${(cell.col * 100) / 15}%`,
  top: `${(cell.row * 100) / 15}%`,
  width: `${(size * 100) / 15}%`,
  height: `${(size * 100) / 15}%`,
});
export const colorStyle = (color: Color) => ({ "--enamel": ENAMEL[color] }) as CSSProperties;
