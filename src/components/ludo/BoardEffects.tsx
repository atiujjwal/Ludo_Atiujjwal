import { useEffect, useState } from "react";
import {
  BASE_ORIGIN,
  DEFAULT_BOARD_LAYOUT,
  FINISH_CELL,
  TRACK,
  geometryColor,
  type BoardLayout,
} from "@/lib/ludo/board";
import { createCaptureFeedback, type CaptureCat } from "@/lib/ludo/capture-feedback";
import type { CaptureEvent, Color } from "@/lib/ludo/types";
import { cellStyle } from "@/lib/ludo/board-style";
import { CatMedia } from "./CatMedia";

/** Brief, CSS-only feedback; never owns a gameplay timer. */
export function BoardEffects({
  capture,
  celebrate,
  layout = DEFAULT_BOARD_LAYOUT,
}: {
  capture?: CaptureEvent | null;
  celebrate?: { color: Color; id: number } | null;
  layout?: BoardLayout;
}) {
  const [cats, setCats] = useState<Partial<Record<Color, CaptureCat>>>({});
  const [feedback] = useState(() =>
    createCaptureFeedback(capture?.id, {
      show: (color, entry) => setCats((previous) => ({ ...previous, [color]: entry })),
      hide: (color) =>
        setCats((previous) => {
          const next = { ...previous };
          delete next[color];
          return next;
        }),
    }),
  );
  useEffect(() => feedback.update(capture), [capture, feedback]);
  useEffect(() => () => feedback.dispose(), [feedback]);
  return (
    <div className="royal-effects" aria-hidden>
      {(Object.entries(cats) as [Color, CaptureCat][]).map(([color, entry]) => (
        <div
          key={`${color}-${entry.id}-${entry.stage}`}
          className="royal-cat-yard"
          data-color={color}
          data-role={entry.role}
          data-stage={entry.stage}
          style={cellStyle(BASE_ORIGIN[geometryColor(color, layout)], 6)}
        >
          <CatMedia
            cat={entry.cat}
            session={`capture-${color}-${entry.id}-${entry.stage}`}
            className="royal-house-cat"
            onLoaded={() => feedback.loaded(color, entry.id, entry.stage)}
          />
        </div>
      ))}
      {capture && Object.values(cats).some((entry) => entry?.id === capture.id) && (
        <span
          key={capture.id}
          className="royal-capture"
          style={cellStyle(TRACK[capture.square]!)}
        />
      )}
      {celebrate && (
        <span
          key={celebrate.id}
          className="royal-home-burst"
          style={cellStyle(FINISH_CELL[geometryColor(celebrate.color, layout)])}
        >
          ✦
        </span>
      )}
    </div>
  );
}
