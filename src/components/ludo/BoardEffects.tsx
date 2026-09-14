import { GOAL, TRACK } from "@/lib/ludo/board";
import type { CaptureEvent, Color } from "@/lib/ludo/types";
import { cellStyle } from "@/lib/ludo/board-style";

/** Brief, CSS-only feedback; never owns a gameplay timer. */
export function BoardEffects({
  capture,
  celebrate,
}: {
  capture?: CaptureEvent | null;
  celebrate?: { color: Color; id: number } | null;
}) {
  return (
    <div className="royal-effects" aria-hidden>
      {capture && (
        <span
          key={capture.id}
          className="royal-capture"
          style={cellStyle(TRACK[capture.square]!)}
        />
      )}
      {celebrate && (
        <span key={celebrate.id} className="royal-home-burst" style={cellStyle(GOAL)}>
          ✦
        </span>
      )}
    </div>
  );
}
