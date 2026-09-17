import type { CSSProperties } from "react";
import { APPEARANCE, COUNTER_COLORS, type TokenSkin } from "@/lib/ludo/theme";
import { cn } from "@/lib/utils";
import type { Color } from "@/lib/ludo/types";

export type TokenVisualState = "idle" | "selectable" | "moving" | "home" | "ghost" | "safe";
interface Props {
  color: Color;
  visual?: TokenVisualState;
  className?: string;
  glyph?: boolean;
  skin?: TokenSkin;
  /** A rectangular section of a shared square with its own hit region. */
  section?: boolean;
}

/** Bold enamel counters with the established colour symbols. */
export function Token({
  color,
  visual = "idle",
  className,
  glyph = true,
  skin = APPEARANCE.token,
  section = false,
}: Props) {
  return (
    <span
      className={cn(skin.className, className)}
      data-visual={visual}
      data-section={section}
      data-color={color}
      style={
        {
          "--token-enamel": COUNTER_COLORS[color],
          "--token-ink": color === "yellow" ? "var(--counter-yellow-ink)" : "var(--counter-ink)",
        } as CSSProperties
      }
    >
      {glyph && (
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          {color === "red" && <circle cx="32" cy="32" r="13" />}
          {color === "green" && <path d="M32 16 48 46H16Z" />}
          {color === "yellow" && <rect x="19" y="19" width="26" height="26" rx="2" />}
          {color === "blue" && <path d="m32 14 18 18-18 18-18-18Z" />}
        </svg>
      )}
      {visual === "selectable" && <span className="royal-selection-ring" aria-hidden="true" />}
    </span>
  );
}
