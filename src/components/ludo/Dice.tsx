import { useEffect, useState } from "react";

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
}: Props) {
  const [face, setFace] = useState(value ?? 1);
  const p = PALETTE[color];
  const lit = active || live;

  useEffect(() => {
    if (!rolling) {
      if (value) setFace(value);
      return;
    }
    const id = window.setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 70);
    return () => window.clearInterval(id);
  }, [rolling, value]);

  return (
    <button
      type="button"
      onClick={onRoll}
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
        "relative shrink-0 rounded-2xl bg-white transition-transform duration-150",
        size === "md" ? "h-16 w-16" : "h-11 w-11 rounded-xl",
        active ? "cursor-pointer hover:-translate-y-0.5 active:translate-y-0.5 active:scale-95" : "cursor-default",
        !lit && "opacity-45 saturate-50",
        rolling && "animate-[ludo-tumble_0.55s_cubic-bezier(0.34,1.3,0.64,1)_infinite]",
        !rolling && active && waiting && "animate-[ludo-nudge_1.4s_ease-in-out_infinite]",
      )}
      style={{
        boxShadow: lit
          ? `inset 0 -0.35rem 0 -0.1rem ${p.soft}, 0 0 0 0.22rem ${p.base}, 0 10px 20px -8px ${p.dark}`
          : `inset 0 -0.3rem 0 -0.1rem rgba(0,0,0,0.06), 0 0 0 0.14rem rgba(0,0,0,0.12)`,
      }}
    >
      <span className="absolute inset-[15%] grid grid-cols-3 grid-rows-3 gap-[8%]">
        {Array.from({ length: 9 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "m-auto h-full w-full rounded-full transition-opacity",
              (PIPS[face] ?? []).includes(i) ? "" : "opacity-0",
            )}
            style={{
              background: `radial-gradient(circle at 32% 28%, ${p.light}, ${p.dark})`,
            }}
          />
        ))}
      </span>

    </button>
  );
}
