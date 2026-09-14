import { useEffect, useState } from "react";
import {
  BASE_ORIGIN,
  DEFAULT_BOARD_LAYOUT,
  FINISH_CELL,
  TRACK,
  geometryColor,
  type BoardLayout,
} from "@/lib/ludo/board";
import { createCaptureFeedback } from "@/lib/ludo/capture-feedback";
import type { CaptureEvent, Color } from "@/lib/ludo/types";
import { cellStyle } from "@/lib/ludo/board-style";

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
  const [victims, setVictims] = useState<Partial<Record<Color, number>>>({});
  const [feedback] = useState(() =>
    createCaptureFeedback(
      capture?.id,
      {
        show: (color, id) => setVictims((previous) => ({ ...previous, [color]: id })),
        hide: (color) =>
          setVictims((previous) => {
            const next = { ...previous };
            delete next[color];
            return next;
          }),
      },
      true,
    ),
  );
  useEffect(() => feedback.update(capture), [capture, feedback]);
  useEffect(() => () => feedback.dispose(), [feedback]);
  return (
    <div className="royal-effects" aria-hidden>
      {(Object.entries(victims) as [Color, number][]).map(([color, id]) => (
        <div
          key={`${color}-${id}`}
          className="royal-crying-yard"
          style={cellStyle(BASE_ORIGIN[geometryColor(color, layout)], 6)}
        >
          <picture className="royal-crying-teddy">
            <source media="(prefers-reduced-motion: reduce)" srcSet="/crying_teddy-still.png" />
            <img
              src="/crying_teddy.gif"
              alt=""
              width="512"
              height="512"
              onLoad={() => feedback.loaded(color, id)}
              onError={() => feedback.loaded(color, id)}
            />
          </picture>
        </div>
      ))}
      {capture && Object.values(victims).includes(capture.id) && (
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
