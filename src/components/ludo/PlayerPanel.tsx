import { Crown } from "lucide-react";

import { Dice } from "@/components/ludo/Dice";
import { Token } from "@/components/ludo/Token";
import { tokensOf } from "@/lib/ludo/engine";
import { PALETTE } from "@/lib/ludo/palette";
import type { GameState, Player } from "@/lib/ludo/types";
import { cn } from "@/lib/utils";

interface Props {
  state: GameState;
  player: Player;
  isTurn: boolean;
  actingColor: string;
  rolling: boolean;
  canRoll: boolean;
  onRoll: () => void;
  /** Mirror the layout so the dice hugs the board on right-hand seats. */
  flip?: boolean;
}

export function PlayerPanel({
  state,
  player,
  isTurn,
  actingColor,
  rolling,
  canRoll,
  onRoll,
  flip = false,
}: Props) {
  const p = PALETTE[player.color];
  const home = tokensOf(state, player.color).filter((t) => t.state === "finished").length;
  const forTeammate = isTurn && actingColor !== player.color;
  const sixStreak = isTurn ? state.turn.consecutiveSixes : 0;

  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center gap-2 rounded-2xl px-2.5 py-2 transition-all duration-200",
        flip && "flex-row-reverse text-right",
        isTurn ? "scale-[1.02]" : "opacity-70",
      )}
      style={{
        background: isTurn ? `linear-gradient(160deg, ${p.soft}, white)` : "white",
        boxShadow: isTurn
          ? `0 0 0 0.16rem ${p.base}, 0 12px 22px -14px ${p.dark}`
          : "0 0 0 1px rgba(60,40,15,0.08)",
      }}
    >
      <Token color={player.color} className="h-8 w-8 shrink-0" />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-sm font-bold leading-tight">
          {player.nickname}
          {player.finishRank === 1 && <Crown className="h-3.5 w-3.5 shrink-0 text-[var(--ludo-yellow)]" />}
        </p>
        <p className="truncate text-[0.68rem] font-semibold leading-tight text-muted-foreground">
          {isTurn ? (
            <span style={{ color: p.dark }}>
              {forTeammate ? "Playing partner's pieces" : "Your turn"}
            </span>
          ) : player.finishRank ? (
            `Finished #${player.finishRank}`
          ) : (
            `${home}/4 home`
          )}
          {player.teamId ? ` · Team ${player.teamId}` : ""}
        </p>
        <div className={cn("mt-1 flex items-center gap-0.5", flip && "justify-end")} aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn("h-1.5 w-3 rounded-full", i === home - 1 && "animate-[ludo-pop_0.35s_ease-out]")}
              style={{ background: i < home ? p.base : "rgba(60,40,15,0.13)" }}
            />
          ))}
          {sixStreak > 0 && (
            <span
              className="ml-1 animate-[ludo-pop_0.3s_ease-out] rounded-full px-1.5 text-[0.6rem] font-black leading-tight text-white"
              style={{ background: sixStreak >= 3 ? "var(--ludo-red)" : p.dark }}
            >
              {"6".repeat(sixStreak)}
            </span>
          )}
        </div>
      </div>

      <Dice
        value={isTurn ? state.turn.diceValue : null}
        rolling={isTurn && rolling}
        active={isTurn && canRoll}
        waiting={isTurn && canRoll && state.turn.diceValue === null}
        live={isTurn}
        color={player.color}
        size="sm"
        onRoll={onRoll}
      />
    </div>
  );
}
