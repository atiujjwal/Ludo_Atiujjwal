import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, LogOut, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { LudoBoard } from "@/components/ludo/LudoBoard";
import { GameModals } from "@/components/ludo/Modals";
import { PlayerPanel } from "@/components/ludo/PlayerPanel";
import { Button } from "@/components/ui/button";
import { controllingColor, playerById } from "@/lib/ludo/engine";
import { PALETTE } from "@/lib/ludo/palette";
import { useGame } from "@/lib/ludo/store";
import { playSfx, unlockAudio, vibrate } from "@/lib/ludo/audio";
import { hasSave } from "@/lib/ludo/persistence";
import { COLOR_CORNER, type Corner } from "@/lib/ludo/board";
import type { Color } from "@/lib/ludo/types";

export const Route = createFileRoute("/game")({
  head: () => ({
    meta: [
      { title: "Playing Ludo — Offline Board Game" },
      {
        name: "description",
        content:
          "The Ludo board: roll the dice, move your pieces, form blockades, cut opponents and race all four pieces home.",
      },
      { property: "og:title", content: "Playing Ludo — Offline Board Game" },
      {
        property: "og:description",
        content: "Roll, move, cut and get all four pieces home before your friends do.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GameScreen,
});

function GameScreen() {
  const { state, dispatch } = useGame();
  const navigate = useNavigate();
  const [rolling, setRolling] = useState(false);
  const lastMessage = useRef(0);
  const [ready, setReady] = useState(false);
  const [celebrate, setCelebrate] = useState<{ color: Color; id: number } | null>(null);
  const homeCount = useRef(0);

  useEffect(() => {
    setReady(true);
    if (!hasSave() && state.turn.diceValue === null && state.phase === "idle") {
      if (typeof window !== "undefined" && !window.localStorage.getItem("ludo:save:v1")) {
        void navigate({ to: "/setup" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.messageId !== lastMessage.current && state.message) {
      lastMessage.current = state.messageId;
      if (state.settings.notificationsOn) toast(state.message);
      playSfx("skipTurn");
    }
  }, [state.messageId, state.message, state.settings.notificationsOn]);

  // Local celebration whenever a piece reaches the goal.
  useEffect(() => {
    const finished = state.tokens.filter((t) => t.state === "finished");
    if (finished.length > homeCount.current) {
      const last = finished[finished.length - 1]!;
      setCelebrate({ color: last.color, id: Date.now() });
      playSfx("tokenHome");
      vibrate([12, 40, 12]);
      window.setTimeout(() => setCelebrate(null), 1000);
    }
    homeCount.current = finished.length;
  }, [state.tokens]);

  // Capture feedback — thud plus a buzz when pieces get sent home.
  const lastCaptureId = useRef(0);
  useEffect(() => {
    const cap = state.lastCapture;
    if (cap && cap.id !== lastCaptureId.current) {
      lastCaptureId.current = cap.id;
      playSfx("tokenCut");
      vibrate([18, 50, 26]);
    }
  }, [state.lastCapture]);

  useEffect(() => {
    if (state.activeModal === "GAME_OVER") playSfx("gameWin");
    else if (state.activeModal !== "NONE") playSfx("modalOpen");
  }, [state.activeModal]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (state.phase !== "over") e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state.phase]);

  if (!ready) return null;

  const player = playerById(state, state.turn.currentPlayerId);
  const acting = controllingColor(state);
  const selectable = state.phase === "select" ? state.legalMoves.map((m) => m.tokenId) : [];
  const canRoll = state.phase === "idle" && state.activeModal === "NONE" && !rolling;

  const roll = () => {
    if (!canRoll) return;
    unlockAudio();
    playSfx("diceRoll");
    vibrate(20);
    setRolling(true);
    window.setTimeout(() => {
      setRolling(false);
      playSfx("diceLand");
      dispatch({ type: "ROLL" });
    }, 620);
  };

  // Each player sits at the corner their colour owns on the board, so their
  // dice is always beside their own yard.
  const seatAt = (corner: Corner) =>
    state.players.find((p) => COLOR_CORNER[p.color] === corner) ?? null;

  const status =
    state.phase === "select"
      ? "Tap a glowing piece"
      : state.phase === "moving"
        ? "Moving…"
        : state.activeModal !== "NONE"
          ? "Make your choice"
          : canRoll
            ? `${player.nickname}, tap your dice`
            : "…";

  const seat = (corner: Corner, className: string) => {
    const p = seatAt(corner);
    if (!p) return <div className={className} aria-hidden />;
    return (
      <div className={className}>
        <PlayerPanel
          state={state}
          player={p}
          isTurn={p.id === state.turn.currentPlayerId}
          actingColor={acting}
          rolling={rolling}
          canRoll={canRoll}
          onRoll={roll}
          flip={corner === "tr" || corner === "br"}
        />
      </div>
    );
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-2 px-3 py-3 lg:max-w-5xl">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11"
          aria-label="Leave game"
          onClick={() => dispatch({ type: "SET_MODAL", modal: "EXIT_CONFIRM" })}
        >
          <LogOut className="h-5 w-5" />
        </Button>
        <p
          className="truncate rounded-full px-4 py-1.5 text-sm font-bold"
          style={{
            background: PALETTE[acting].soft,
            color: PALETTE[acting].dark,
            boxShadow: `0 0 0 2px ${PALETTE[acting].base}`,
          }}
        >
          {status}
        </p>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={
              state.settings.notificationsOn ? "Turn off game notices" : "Turn on game notices"
            }
            onClick={() => dispatch({ type: "TOGGLE_SETTING", key: "notificationsOn" })}
          >
            {state.settings.notificationsOn ? (
              <Bell className="h-5 w-5" />
            ) : (
              <BellOff className="h-5 w-5 opacity-60" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={state.settings.soundOn ? "Mute sound" : "Unmute sound"}
            onClick={() => dispatch({ type: "TOGGLE_SETTING", key: "soundOn" })}
          >
            {state.settings.soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <div className="my-auto grid grid-cols-2 items-center gap-2 lg:grid-cols-[minmax(11rem,15rem)_auto_minmax(11rem,15rem)] lg:place-content-center lg:gap-5">
        {seat("tl", "order-1 lg:col-start-1 lg:row-start-1")}
        {seat("tr", "order-2 lg:col-start-3 lg:row-start-1")}

        <div className="order-3 col-span-2 mx-auto w-full max-w-[min(100%,calc(100dvh-15rem))] lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:w-[min(46vw,calc(100dvh-8rem))] lg:max-w-none">
          <LudoBoard
            state={state}
            selectableTokenIds={selectable}
            activeColor={acting}
            celebrate={celebrate}
            onSelect={(tokenId) => {
              playSfx("uiTap");
              vibrate(10);
              dispatch({ type: "SELECT_TOKEN", tokenId });
            }}
          />
        </div>

        {seat("bl", "order-4 lg:col-start-1 lg:row-start-2")}
        {seat("br", "order-5 lg:col-start-3 lg:row-start-2")}
      </div>

      <GameModals state={state} dispatch={dispatch} />
    </main>
  );
}

