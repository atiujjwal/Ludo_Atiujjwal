import { useEffect, useMemo, useState } from "react";

import { Token } from "@/components/ludo/Token";
import {
  BASE_ORIGIN,
  BASE_SLOTS,
  COLOR_ORDER,
  HOME_COLUMN,
  SAFE_SQUARES,
  START_OFFSET,
  TRACK,
  cellForToken,
} from "@/lib/ludo/board";
import { blockades } from "@/lib/ludo/engine";
import { PALETTE } from "@/lib/ludo/palette";
import type { CaptureEvent, Color, GameState, Token as TokenModel } from "@/lib/ludo/types";
import { cn } from "@/lib/utils";

const U = 100 / 15;

function pct(n: number) {
  return `${n * U}%`;
}

/** Ghost pieces that slide from the capture square back to their own yard. */
function CaptureGhosts({
  capture,
  slotOf,
}: {
  capture: CaptureEvent;
  slotOf: Map<string, number>;
}) {
  const [home, setHome] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setHome(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const from = TRACK[capture.square];
  if (!from) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40" aria-hidden>
      {capture.tokens.map((t) => {
        const slot = slotOf.get(t.id) ?? 0;
        const origin = BASE_ORIGIN[t.color];
        const s = BASE_SLOTS[slot % 4]!;
        const cell = home
          ? { col: origin.col + s.col, row: origin.row + s.row }
          : from;
        return (
          <span
            key={t.id}
            className="absolute grid place-items-center transition-all duration-[620ms] ease-in-out"
            style={{
              left: pct(cell.col),
              top: pct(cell.row),
              width: pct(1),
              height: pct(1),
              opacity: home ? 0 : 1,
              transform: home ? "scale(0.9)" : "scale(1.18) rotate(-12deg)",
            }}
          >
            <Token color={t.color} visual="idle" className="h-[82%] w-[82%]" />
          </span>
        );
      })}
    </div>
  );
}

interface Props {
  state: GameState;
  selectableTokenIds: string[];
  activeColor: Color;
  onSelect: (tokenId: string) => void;
  /** Colour of the token that just reached home — triggers a local burst. */
  celebrate?: { color: Color; id: number } | null;
}

export function LudoBoard({ state, selectableTokenIds, activeColor, onSelect, celebrate }: Props) {
  const active = state.gameConfig.activeColors;
  const walls = useMemo(() => blockades(state), [state]);

  const slotOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const color of COLOR_ORDER) {
      state.tokens.filter((t) => t.color === color).forEach((t, i) => map.set(t.id, i));
    }
    return map;
  }, [state.tokens]);

  // Stack offsets so co-located tokens stay visible.
  const stackIndex = useMemo(() => {
    const buckets = new Map<string, TokenModel[]>();
    for (const t of state.tokens) {
      if (t.state === "base") continue;
      const c = cellForToken(t, 0);
      const key = `${c.col}:${c.row}`;
      buckets.set(key, [...(buckets.get(key) ?? []), t]);
    }
    const map = new Map<string, { i: number; n: number }>();
    for (const group of buckets.values()) {
      group.forEach((t, i) => map.set(t.id, { i, n: group.length }));
    }
    return map;
  }, [state.tokens]);

  const movingId = state.pending?.tokenId ?? null;

  return (
    <div
      className="relative aspect-square w-full overflow-hidden rounded-[2rem] p-[1.5%]"
      style={{
        background: "linear-gradient(155deg, var(--board), oklch(0.955 0.03 88))",
        boxShadow:
          "inset 0 0 0 0.35rem rgba(255,255,255,0.85), inset 0 0 0 0.5rem var(--board-edge), var(--elev-3)",
      }}
    >
      <div className="relative h-full w-full">
        {/* Base yards */}
        {COLOR_ORDER.map((color) => {
          const o = BASE_ORIGIN[color];
          const isActive = active.includes(color);
          const p = PALETTE[color];
          const isTurn = isActive && color === activeColor;
          return (
            <div
              key={`base-${color}`}
              className={cn(
                "absolute rounded-[1.2rem] p-[3%] transition-all duration-300",
                !isActive && "opacity-20 grayscale",
              )}
              style={{
                left: pct(o.col),
                top: pct(o.row),
                width: pct(6),
                height: pct(6),
                background: `linear-gradient(150deg, ${p.light}, ${p.base} 55%, ${p.dark})`,
                boxShadow: isTurn
                  ? `0 0 0 0.28rem white, 0 0 1.6rem 0.2rem ${p.base}, inset 0 -0.3rem 0.6rem rgba(0,0,0,0.25)`
                  : `inset 0 -0.3rem 0.6rem rgba(0,0,0,0.22), 0 6px 14px -8px rgba(0,0,0,0.4)`,
              }}
            >
              <div
                className="grid h-full w-full grid-cols-2 grid-rows-2 gap-[8%] rounded-[0.9rem] p-[11%]"
                style={{ background: "rgba(255,255,255,0.82)" }}
              >
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-full"
                    style={{
                      background: p.soft,
                      boxShadow: `inset 0 0.12rem 0.3rem rgba(0,0,0,0.18)`,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Shared track */}
        {TRACK.map((cell, index) => {
          const startColor = COLOR_ORDER.find((c) => START_OFFSET[c] === index);
          const safe = SAFE_SQUARES.has(index);
          const wallOwner = walls.get(index);
          return (
            <div
              key={`track-${index}`}
              className="absolute flex items-center justify-center rounded-[0.2rem]"
              style={{
                left: pct(cell.col),
                top: pct(cell.row),
                width: pct(1),
                height: pct(1),
                background: startColor
                  ? PALETTE[startColor].soft
                  : safe
                    ? "var(--safe)"
                    : "white",
                boxShadow: wallOwner
                  ? `inset 0 0 0 0.1rem ${PALETTE[wallOwner].dark}`
                  : "inset 0 0 0 1px rgba(60,40,15,0.14), inset 0 -0.1rem 0.2rem rgba(60,40,15,0.06)",
              }}
            >
              {safe && !startColor && (
                <span className="select-none text-[0.6rem] leading-none text-black/30">★</span>
              )}
              {startColor && (
                <span
                  className="select-none text-[0.6rem] leading-none"
                  style={{ color: PALETTE[startColor].dark }}
                >
                  ➤
                </span>
              )}
            </div>
          );
        })}

        {/* Home columns */}
        {COLOR_ORDER.map((color) =>
          HOME_COLUMN[color].map((cell, i) => (
            <div
              key={`home-${color}-${i}`}
              className={cn("absolute rounded-[0.2rem]", !active.includes(color) && "opacity-20 grayscale")}
              style={{
                left: pct(cell.col),
                top: pct(cell.row),
                width: pct(1),
                height: pct(1),
                background: `linear-gradient(180deg, ${PALETTE[color].light}, ${PALETTE[color].base})`,
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.6)",
              }}
            />
          )),
        )}

        {/* Goal — four triangles, each pointing back down its own lane */}
        <div
          className="absolute"
          style={{
            left: pct(7),
            top: pct(7),
            width: pct(1),
            height: pct(1),
            filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
          }}
        >
          {(
            [
              ["red", "polygon(0% 0%, 0% 100%, 50% 50%)"],
              ["green", "polygon(0% 0%, 100% 0%, 50% 50%)"],
              ["yellow", "polygon(100% 0%, 100% 100%, 50% 50%)"],
              ["blue", "polygon(0% 100%, 100% 100%, 50% 50%)"],
            ] as [Color, string][]
          ).map(([color, clip]) => (
            <span
              key={`goal-${color}`}
              aria-hidden
              className={cn(
                "absolute inset-0 transition-opacity duration-300",
                !active.includes(color) && "opacity-25",
              )}
              style={{
                clipPath: clip,
                background: `linear-gradient(160deg, ${PALETTE[color].light}, ${PALETTE[color].base} 60%, ${PALETTE[color].dark})`,
              }}
            />
          ))}
          <span className="absolute inset-0 rounded-[0.15rem] ring-1 ring-inset ring-white/70" aria-hidden />
        </div>

        {/* Beaten pieces walking back to their yard */}
        {state.lastCapture && (
          <CaptureGhosts key={state.lastCapture.id} capture={state.lastCapture} slotOf={slotOf} />
        )}


        {/* Home confetti burst */}
        {celebrate && (
          <div
            key={celebrate.id}
            aria-hidden
            className="pointer-events-none absolute"
            style={{ left: pct(7), top: pct(7), width: pct(1), height: pct(1) }}
          >
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i / 12) * Math.PI * 2;
              return (
                <span
                  key={i}
                  className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-[1px] animate-[ludo-confetti_0.9s_ease-out_forwards]"
                  style={{
                    background: PALETTE[celebrate.color].base,
                    ["--dx" as string]: `${Math.cos(angle) * 46}px`,
                    ["--dy" as string]: `${Math.sin(angle) * 46}px`,
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Tokens */}
        {state.tokens.map((token) => {
          const slot = slotOf.get(token.id) ?? 0;
          const cell = cellForToken(token, slot);
          const stack = stackIndex.get(token.id);
          const nudge = stack && stack.n > 1 ? (stack.i - (stack.n - 1) / 2) * 0.24 : 0;
          const selectable = selectableTokenIds.includes(token.id);
          const inWall =
            token.state === "common" &&
            walls.get((START_OFFSET[token.color] + token.steps) % 52) === token.color;
          const visual = selectable
            ? "selectable"
            : token.id === movingId
              ? "moving"
              : token.state === "finished"
                ? "home"
                : inWall
                  ? "walled"
                  : "idle";
          return (
            <button
              key={token.id}
              type="button"
              disabled={!selectable}
              onClick={() => onSelect(token.id)}
              aria-label={`${token.color} piece ${slot + 1}${selectable ? " — tap to move" : ""}${
                inWall ? " (in a blockade)" : ""
              }`}
              className={cn(
                "absolute grid place-items-center rounded-full transition-[left,top] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                selectable ? "z-30 cursor-pointer" : "z-20 cursor-default",
              )}
              style={{
                left: pct(cell.col + nudge),
                top: pct(cell.row - Math.abs(nudge) * 0.35),
                width: pct(1),
                height: pct(1),
              }}
            >
              <Token color={token.color} visual={visual} className="h-[82%] w-[82%]" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
