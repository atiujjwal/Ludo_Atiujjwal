import { memo } from "react";
import {
  BASE_ORIGIN,
  BASE_SLOTS,
  COLOR_ORDER,
  DEFAULT_BOARD_LAYOUT,
  geometryColor,
  type BoardLayout,
  HOME_COLUMN,
  SAFE_SQUARES,
  START_OFFSET,
  TRACK,
  type Cell,
} from "@/lib/ludo/board";
import { ENAMEL } from "@/lib/ludo/theme";
import type { Color } from "@/lib/ludo/types";
import { cellStyle, colorStyle } from "@/lib/ludo/board-style";

/** Small original lotus/paisley ornament, shared across the four courtyards. */
export function RoyalMotif({ variant = 0 }: { variant?: number }) {
  if (variant === 1) {
    return (
      <svg
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M50 72C8 65 5 27 24 27C20 6 43 10 50 23C57 10 80 6 76 27C95 27 92 65 50 72ZM50 72L24 34M50 72L35 22M50 72V28M50 72L65 22M50 72L76 34" />
        <path d="M41 77Q65 77 62 58Q60 49 55 45Q52 39 57 37Q66 38 64 47L70 50L63 51Q76 82 48 84H32M57 37L54 31M60 37L62 30" />
        <ellipse cx="23" cy="36" rx="4" ry="6" />
        <ellipse cx="35" cy="26" rx="4" ry="6" />
        <ellipse cx="50" cy="29" rx="4" ry="6" />
        <ellipse cx="65" cy="26" rx="4" ry="6" />
        <ellipse cx="77" cy="36" rx="4" ry="6" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M50 12C30 33 29 52 50 70C71 52 70 33 50 12ZM50 70C18 70 9 47 17 30C38 33 48 47 50 70ZM50 70C82 70 91 47 83 30C62 33 52 47 50 70ZM18 77Q50 91 82 77M30 85H70" />
      {variant % 2 === 0 ? (
        <path d="M50 24Q37 47 50 59Q63 47 50 24M24 44L37 59M76 44L63 59" />
      ) : (
        <path d="M50 32C29 55 69 65 60 43C54 30 44 43 51 49M24 44Q26 58 37 59M76 44Q74 58 63 59" />
      )}
      <circle cx="50" cy="76" r="3" />
    </svg>
  );
}

function PlayerZone({
  color,
  index,
  layout,
}: {
  color: Color;
  index: number;
  layout: BoardLayout;
}) {
  const origin = BASE_ORIGIN[geometryColor(color, layout)];
  return (
    <>
      <div
        className="royal-zone"
        data-color={color}
        style={{ ...cellStyle(origin, 6), ...colorStyle(color) }}
      >
        <div className="royal-courtyard" />
        <div className="royal-motif">
          <RoyalMotif variant={index} />
        </div>
      </div>
      {BASE_SLOTS.map((slot, i) => (
        <div
          key={i}
          className="royal-socket"
          data-color={color}
          style={cellStyle({ col: origin.col + slot.col, row: origin.row + slot.row })}
        />
      ))}
    </>
  );
}
function TrackCell({ cell, index, layout }: { cell: Cell; index: number; layout: BoardLayout }) {
  const start = COLOR_ORDER.find((color) => START_OFFSET[geometryColor(color, layout)] === index);
  return (
    <div
      className={`royal-cell ${SAFE_SQUARES.has(index) ? "royal-safe" : ""}`}
      style={{ ...cellStyle(cell), ...(start ? colorStyle(start) : {}) }}
      data-start={start}
    >
      {SAFE_SQUARES.has(index) && <span aria-hidden="true">{start ? "❖" : "✦"}</span>}
    </div>
  );
}
function HomePath({ color, layout }: { color: Color; layout: BoardLayout }) {
  const cells = HOME_COLUMN[geometryColor(color, layout)];
  return (
    <>
      {cells.map((cell, i) => (
        <div
          key={i}
          className="royal-cell royal-home"
          style={{ ...cellStyle(cell), ...colorStyle(color) }}
        >
          {i === cells.length - 1 && <span aria-hidden="true">❖</span>}
        </div>
      ))}
    </>
  );
}
function CenterArea({ layout }: { layout: BoardLayout }) {
  return (
    <div className="royal-center" style={cellStyle({ col: 6, row: 6 }, 3)} aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <path d="M0 0L50 50L0 100Z" fill={ENAMEL[layout.cornerToColor.tl]} />
        <path d="M0 0H100L50 50Z" fill={ENAMEL[layout.cornerToColor.tr]} />
        <path d="M100 0V100L50 50Z" fill={ENAMEL[layout.cornerToColor.br]} />
        <path d="M0 100H100L50 50Z" fill={ENAMEL[layout.cornerToColor.bl]} />
        <path
          d="M0 0L100 100M0 100L100 0M50 5L95 50L50 95L5 50Z"
          fill="none"
          stroke="var(--center-line)"
          strokeWidth="3"
        />
        <path
          d="M50 28Q75 50 50 72Q25 50 50 28Z"
          fill="var(--center-fill)"
          stroke="var(--center-outline)"
        />
      </svg>
    </div>
  );
}
/** Static geometry never receives the game state or animation ticks. */
export const BoardArtwork = memo(function BoardArtwork({
  layout = DEFAULT_BOARD_LAYOUT,
}: {
  layout?: BoardLayout;
}) {
  return (
    <div className="royal-artwork" aria-hidden="true">
      {COLOR_ORDER.map((color, i) => (
        <PlayerZone key={color} color={color} index={i} layout={layout} />
      ))}
      {TRACK.map((cell, i) => (
        <TrackCell key={i} cell={cell} index={i} layout={layout} />
      ))}
      {COLOR_ORDER.map((color) => (
        <HomePath key={color} color={color} layout={layout} />
      ))}
      <CenterArea layout={layout} />
    </div>
  );
});
