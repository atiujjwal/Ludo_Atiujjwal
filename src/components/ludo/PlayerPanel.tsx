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
  /** Right-hand seat: keep its dice at the outer right edge. */
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
        "royal-player-panel relative min-w-0 rounded-2xl px-2.5 py-2 transition-transform duration-200",
        flip && "text-right",
        isTurn ? "scale-[1.02]" : "opacity-90",
      )}
      style={{
        boxShadow: isTurn
          ? `0 0 0 0.16rem ${p.base}, 0 12px 22px -14px ${p.dark}`
          : "var(--elev-1)",
      }}
      data-player-color={player.color}
    >
      <div
        className={cn(
          "royal-player-info flex min-w-0 items-center gap-2",
          !flip && "flex-row-reverse",
        )}
      >
        <Token color={player.color} className="h-8 w-8 shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-bold leading-tight">
            {player.nickname}
            {player.finishRank === 1 && (
              <Crown className="h-3.5 w-3.5 shrink-0 text-[var(--ludo-yellow)]" />
            )}
          </p>
          <p className="truncate text-[0.68rem] font-semibold leading-tight text-muted-foreground">
            {player.finishRank ? (
              `Finished #${player.finishRank}`
            ) : isTurn ? (
              <span style={{ color: p.light }}>
                {forTeammate ? "Playing partner's pieces" : "Your turn"}
              </span>
            ) : (
              `${home}/4 home`
            )}
            {player.teamId ? ` · Team ${player.teamId}` : ""}
          </p>
          {player.finishRank && isTurn && state.phase !== "over" && (
            <p className="text-[0.68rem] font-semibold leading-tight" style={{ color: p.light }}>
              {forTeammate ? "Your turn · Playing partner's pieces" : "Your turn"}
            </p>
          )}
          <div className={cn("mt-1 flex items-center gap-0.5", flip && "justify-end")} aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-3 rounded-full",
                  i === home - 1 && "animate-[ludo-pop_0.35s_ease-out]",
                )}
                style={{ background: i < home ? p.base : "var(--progress-empty)" }}
              />
            ))}
            {sixStreak > 0 && (
              <span
                className="ml-1 animate-[ludo-pop_0.3s_ease-out] rounded-full px-1.5 text-[0.6rem] font-black leading-tight text-[var(--on-color)]"
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
    </div>
  );
}
