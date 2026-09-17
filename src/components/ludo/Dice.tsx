import { useEffect, useState, type CSSProperties } from "react";

import { APPEARANCE, type DiceSkin } from "@/lib/ludo/theme";
import { PALETTE } from "@/lib/ludo/palette";
import type { Color } from "@/lib/ludo/types";
import { cn } from "@/lib/utils";

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

interface Props {
  value: number | null;
  rolling: boolean;
  /** Interactive: it is this player's turn and a roll is expected. */
  active: boolean;
  /** Waiting for the tap — adds the invite pulse. */
  waiting?: boolean;
  /** Still this player's turn (e.g. picking a piece) — stays visually lit. */
  live?: boolean;
  color: Color;
  size?: "sm" | "md";
  onRoll?: () => void;
  skin?: DiceSkin;
}

export function Dice({
  value,
  rolling,
  active,
  waiting = false,
  live = false,
  color,
  size = "md",
  onRoll,
  skin = APPEARANCE.dice,
}: Props) {
  const [face, setFace] = useState(value ?? 1);
  const p = PALETTE[color];
  const lit = active || live;

  useEffect(() => {
    if (!rolling) {
      if (value) setFace(value);
      return;
    }
    if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setFace(1 + Math.floor(Math.random() * 6));
    }, 70);
    return () => window.clearInterval(id);
  }, [rolling, value]);

  return (
    <button
      type="button"
      onClick={(event) => {
        if (!active) return;
        // Immediate compositor feedback; React remains authoritative for the
        // roll lifecycle and result.
        event.currentTarget.dataset["rolling"] = "true";
        onRoll?.();
      }}
      disabled={!active}
      aria-label={
        active
          ? value
            ? `Dice showing ${value}. Tap to roll again`
            : "Tap to roll the dice"
          : value
            ? `Dice showing ${value}`
            : "Dice — not your turn"
      }
      className={cn(
        skin.className,
        "relative shrink-0 rounded-2xl transition-transform duration-150",
        size === "md" ? "h-16 w-16" : "h-11 w-11 rounded-xl",
        active
          ? "cursor-pointer hover:-translate-y-0.5 active:translate-y-0.5 active:scale-95"
          : "cursor-default",
      )}
      data-lit={lit}
      data-rolling={rolling}
      data-waiting={!rolling && active && waiting}
      style={{ "--dice-accent": p.base } as CSSProperties}
    >
      <span className="absolute inset-[15%] grid grid-cols-3 grid-rows-3 gap-[8%]">
        {Array.from({ length: 9 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "royal-dice-pip m-auto h-full w-full rounded-full transition-opacity",
              (PIPS[rolling ? face : (value ?? face)] ?? []).includes(i) ? "" : "opacity-0",
            )}
          />
        ))}
      </span>
    </button>
  );
}
