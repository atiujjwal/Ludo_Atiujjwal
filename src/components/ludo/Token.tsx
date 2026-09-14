import { useId } from "react";
import { COLOR_GLYPH } from "@/lib/ludo/board";
import { APPEARANCE, ENAMEL, type TokenSkin } from "@/lib/ludo/theme";
import { cn } from "@/lib/utils";
import type { Color } from "@/lib/ludo/types";

export type TokenVisualState =
  "idle" | "selectable" | "moving" | "walled" | "home" | "ghost" | "safe";
interface Props {
  color: Color;
  visual?: TokenVisualState;
  className?: string;
  glyph?: boolean;
  skin?: TokenSkin;
}

/** One small vector pawn: brass body, enamel base, readable color glyph. */
export function Token({
  color,
  visual = "idle",
  className,
  glyph = true,
  skin = APPEARANCE.token,
}: Props) {
  const id = useId().replace(/:/g, "");
  return (
    <span className={cn(skin.className, className)} data-visual={visual}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" x2="1">
            <stop stopColor="#5b3618" />
            <stop offset=".24" stopColor="#d2a466" />
            <stop offset=".42" stopColor="#fff0bc" />
            <stop offset=".62" stopColor="#b88142" />
            <stop offset=".85" stopColor="#60421e" />
            <stop offset="1" stopColor="#d4b477" />
          </linearGradient>
        </defs>
        <ellipse cx="32" cy="54" rx="26" ry="8" fill="#000" opacity=".4" />
        <ellipse cx="32" cy="48" rx="25" ry="12" fill={`url(#${id})`} stroke="#e9cb8d" />
        <ellipse
          cx="32"
          cy="46"
          rx="21"
          ry="9"
          fill={ENAMEL[color]}
          stroke="#f2d391"
          strokeWidth="1.5"
        />
        <path
          d="M17 44Q28 29 25 23H39Q36 29 47 44Q32 54 17 44Z"
          fill={`url(#${id})`}
          stroke="#a67a3d"
        />
        <ellipse cx="32" cy="24" rx="12" ry="4" fill={`url(#${id})`} stroke="#efd297" />
        <circle cx="32" cy="15" r="11" fill={`url(#${id})`} stroke="#f6dfaa" />
        <circle cx="32" cy="14" r="7" fill={ENAMEL[color]} />
        <ellipse cx="29" cy="11" rx="3" ry="2" fill="#fff" opacity=".6" />
        {glyph && (
          <text x="32" y="17" textAnchor="middle" fill="#fff9e9" fontSize="8">
            {COLOR_GLYPH[color]}
          </text>
        )}
      </svg>
      {visual === "selectable" && <span className="royal-selection-ring" aria-hidden="true" />}
      {visual === "walled" && (
        <span className="royal-wall-mark" aria-hidden="true">
          Ⅱ
        </span>
      )}
    </span>
  );
}
