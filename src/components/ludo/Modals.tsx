import { useNavigate } from "@tanstack/react-router";
import { Crown } from "lucide-react";

import { Token } from "@/components/ludo/Token";
import { COLOR_ORDER } from "@/lib/ludo/board";
import { PALETTE } from "@/lib/ludo/palette";

import { canContinueSecondLap, getLegalMoves, tokensOf } from "@/lib/ludo/engine";
import type { Action } from "@/lib/ludo/store";
import { playSfx } from "@/lib/ludo/audio";
import type { GameState } from "@/lib/ludo/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

function Sheet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Dialog open>
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl border-border bg-card p-6 shadow-2xl [&>button:last-child]:hidden"
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
        <div className="mt-4 space-y-3">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

interface Props {
  state: GameState;
  dispatch: React.Dispatch<Action>;
  showResults?: boolean;
}

export function GameModals({ state, dispatch, showResults = true }: Props) {
  const navigate = useNavigate();

  if (state.activeModal === "SECOND_LAP_CHOICE") {
    const { tokenId, dice } = state.modalContext as { tokenId?: string; dice?: number };
    const token = state.tokens.find((candidate) => candidate.id === tokenId);
    const canEnter = Boolean(
      token &&
      dice &&
      getLegalMoves(state, dice, state.modalContext["isReward"] === true).some(
        (move) => move.tokenId === tokenId,
      ),
    );
    const canContinue = Boolean(token && dice && canContinueSecondLap(state, token, dice));
    return (
      <Sheet title="Take another lap?">
        <p className="text-sm text-muted-foreground">
          This token is about to turn into its home column. You can go in now, or loop the board one
          more time for another shot at cutting someone.
        </p>
        <Button
          className="h-12 w-full"
          disabled={!canEnter}
          onClick={() => {
            playSfx("modalClose");
            dispatch({ type: "CHOOSE_ENTER_HOME" });
          }}
        >
          Enter home
        </Button>
        <Button
          variant="secondary"
          className="h-12 w-full"
          disabled={!canContinue}
          onClick={() => {
            playSfx("modalClose");
            dispatch({ type: "CHOOSE_CONTINUE_LAP" });
          }}
        >
          Continue lap
        </Button>
      </Sheet>
    );
  }

  if (state.activeModal === "EXIT_CONFIRM") {
    return (
      <Sheet title="Leave this game?">
        <p className="text-sm text-muted-foreground">
          Your game is saved, so you can pick it up again from the home screen.
        </p>
        <Button
          className="h-12 w-full"
          onClick={() => {
            dispatch({ type: "SET_MODAL", modal: "NONE" });
            void navigate({ to: "/" });
          }}
        >
          Leave game
        </Button>
        <Button
          variant="secondary"
          className="h-12 w-full"
          onClick={() => dispatch({ type: "SET_MODAL", modal: "NONE" })}
        >
          Keep playing
        </Button>
      </Sheet>
    );
  }

  if (state.activeModal === "GAME_OVER") {
    if (!showResults) return null;
    const ranked = [...state.players].sort((a, b) => (a.finishRank ?? 99) - (b.finishRank ?? 99));
    const teamWin = state.winnerTeam
      ? state.players.filter((p) => p.teamId === state.winnerTeam)
      : null;
    const champion = teamWin ?? (ranked[0] ? [ranked[0]] : []);
    const crownColor = champion[0]?.color ?? "red";
    const p = PALETTE[crownColor];

    return (
      <Sheet title={teamWin ? "Team victory!" : "We have a winner!"}>
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="absolute top-[-8%] h-2.5 w-1.5 rounded-[1px] animate-[ludo-fall_2.6s_linear_forwards]"
              style={{
                left: `${(i * 97) % 100}%`,
                background: PALETTE[COLOR_ORDER[i % 4]!].base,
                animationDelay: `${(i % 12) * 0.22}s`,
                transform: `rotate(${(i * 37) % 360}deg)`,
              }}
            />
          ))}
        </div>

        <div
          className="relative flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{
            background: `linear-gradient(150deg, ${p.soft}, var(--card))`,
            boxShadow: `0 0 0 0.16rem ${p.base}, 0 16px 30px -18px ${p.dark}`,
          }}
        >
          <span className="animate-[ludo-pop_0.4s_ease-out]">
            <Token color={crownColor} visual="home" className="h-11 w-11" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 truncate font-display text-xl leading-tight">
              <span className="min-w-0 truncate">
                {champion.map((c) => c.nickname).join(" & ")}
              </span>
              <Crown className="h-4 w-4 shrink-0 text-[var(--ludo-yellow)]" />
            </span>
            <span className="block text-xs font-semibold text-muted-foreground">
              {teamWin ? "All eight pieces home" : "All four pieces home"}
            </span>
          </span>
        </div>

        <ol className="space-y-2">
          {ranked.map((pl) => (
            <li
              key={pl.id}
              className="flex min-w-0 items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold"
              data-result-color={pl.color}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Token color={pl.color} visual="idle" className="h-5 w-5 shrink-0" />
                <span className="truncate">
                  {teamWin ? `Team ${pl.teamId}` : pl.finishRank ? `#${pl.finishRank}` : "—"}{" "}
                  {pl.nickname}
                </span>
              </span>
              <span className="shrink-0 text-muted-foreground">
                {tokensOf(state, pl.color).filter((t) => t.state === "finished").length}/4 home
              </span>
            </li>
          ))}
        </ol>

        <Button
          className="h-12 w-full"
          onClick={() => {
            playSfx("uiTap");
            dispatch({ type: "REMATCH" });
          }}
        >
          Play again — same players
        </Button>
        <Button
          variant="secondary"
          className="h-12 w-full"
          onClick={() => void navigate({ to: "/setup" })}
        >
          New game
        </Button>
        <Button variant="ghost" className="h-12 w-full" onClick={() => void navigate({ to: "/" })}>
          Home
        </Button>
      </Sheet>
    );
  }

  return null;
}
