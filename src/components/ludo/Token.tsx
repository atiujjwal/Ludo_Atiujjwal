import { COLOR_GLYPH } from "@/lib/ludo/board";
import { PALETTE, tokenSurface } from "@/lib/ludo/palette";
import type { Color } from "@/lib/ludo/types";
import { cn } from "@/lib/utils";

export type TokenVisualState =
  | "idle"
  | "selectable"
  | "moving"
  | "walled"
  | "home"
  | "ghost";

interface Props {
  color: Color;
  visual?: TokenVisualState;
  className?: string;
  /** Show the colour-blind-safe shape mark inside the piece. */
  glyph?: boolean;
}

/** A glossy, semi-3D playing piece rendered entirely in CSS. */
export function Token({ color, visual = "idle", className, glyph = true }: Props) {
  const p = PALETTE[color];
  return (
    <span
      className={cn(
        "relative grid aspect-square place-items-center rounded-full",
        visual === "selectable" && "animate-[ludo-bob_1s_ease-in-out_infinite]",
        visual === "moving" && "animate-[ludo-nudge_0.32s_ease-in-out]",
        visual === "ghost" && "opacity-45 saturate-50",
        className,
      )}
      style={{
        background: tokenSurface(color),
        boxShadow: `inset 0 -14% 22% -8% ${p.dark}, inset 0 22% 18% -14% rgba(255,255,255,0.85), 0 8% 12% -4% rgba(0,0,0,0.5), 0 2px 5px rgba(40,25,10,0.45)`,
        border: "0.09em solid rgba(255,255,255,0.92)",
      }}
    >
      {visual === "selectable" && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[14%] rounded-full animate-[ludo-halo_1.1s_ease-in-out_infinite]"
          style={{ color: p.base }}
        />
      )}
      {visual === "walled" && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[10%] rounded-full ring-2 ring-white/90"
        />
      )}
      {glyph && (
        <span
          aria-hidden
          className="select-none text-[0.45em] font-black leading-none text-white/95 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]"
        >
          {COLOR_GLYPH[color]}
        </span>
      )}
      {visual === "home" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-white/35"
        />
      )}
    </span>
  );
}
