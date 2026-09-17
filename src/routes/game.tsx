import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, LogOut, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { MemoizedLudoBoard as LudoBoard } from "@/components/ludo/LudoBoard";
import { GameModals } from "@/components/ludo/Modals";
import { CutRewardPanel } from "@/components/ludo/CutRewardPanel";
import { PlayerPanel } from "@/components/ludo/PlayerPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { controllingColor, playerById, playerAtCorner } from "@/lib/ludo/engine";
import { PALETTE } from "@/lib/ludo/palette";
import { useGame } from "@/lib/ludo/store";
import { configureAudio, playSfx, unlockAudio, vibrate } from "@/lib/ludo/audio";
import {
  createGuidanceNotices,
  GAME_GUIDANCE_TOAST_ID,
  guidanceEnabled,
} from "@/lib/ludo/guidance";
import { type Corner } from "@/lib/ludo/board";
import type { Color } from "@/lib/ludo/types";
import { useRankFeedback } from "@/lib/ludo/rank-feedback";
import { CAPTURE_CATS, warmCatImages } from "@/lib/ludo/cat-effects";
import { offlineDetailsSnapshot } from "@/lib/ludo/register-sw";

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
  const { state, dispatch, ready: gameReady, hasGame } = useGame();
  const navigate = useNavigate();
  const [rolling, setRolling] = useState(false);
  const rollingRef = useRef(false);
  const rollTimer = useRef<number | undefined>(undefined);
  const canRoll = state.phase === "idle" && state.activeModal === "NONE" && !rolling;
  const canRollRef = useRef(canRoll);
  canRollRef.current = canRoll;
  const guidance = guidanceEnabled(state.settings);
  const rankFeedback = useRankFeedback(state, gameReady);
  const [notices] = useState(() =>
    createGuidanceNotices(state.messageId, {
      show: (message) => toast(message, { id: GAME_GUIDANCE_TOAST_ID }),
      dismiss: () => toast.dismiss(GAME_GUIDANCE_TOAST_ID),
      sound: () => playSfx("skipTurn"),
    }),
  );
  const [ready, setReady] = useState(false);
  const [celebrate, setCelebrate] = useState<{ color: Color; id: number } | null>(null);
  const completedIds = useRef<Set<string> | null>(null);
  const celebrationTimer = useRef<number | undefined>(undefined);
  const selectToken = useCallback(
    (tokenId: string) => {
      const piece = document.querySelector<HTMLElement>(`[data-token-id="${CSS.escape(tokenId)}"]`);
      if (piece) piece.dataset["moving"] = "true";
      playSfx("uiTap");
      vibrate(10);
      dispatch({ type: "SELECT_TOKEN", tokenId });
    },
    [dispatch],
  );
  const roll = useCallback(() => {
    if (!canRollRef.current || rollingRef.current) return;
    rollingRef.current = true;
    unlockAudio();
    playSfx("diceRoll");
    vibrate(20);
    setRolling(true);
    rollTimer.current = window.setTimeout(() => {
      rollingRef.current = false;
      setRolling(false);
      playSfx("diceLand");
      dispatch({ type: "ROLL" });
    }, 620);
  }, [dispatch]);

  useEffect(() => {
    setReady(true);
    if (gameReady && !hasGame) void navigate({ to: "/setup" });
  }, [gameReady, hasGame, navigate]);

  useEffect(() => {
    notices.update(state.messageId, state.message, guidance);
  }, [notices, state.messageId, state.message, guidance]);

  useEffect(() => () => notices.dispose(), [notices]);

  useEffect(() => {
    if (!gameReady || !offlineDetailsSnapshot().ready) return;
    let dispose = () => {};
    const timer = window.setTimeout(() => {
      dispose = warmCatImages([...CAPTURE_CATS.cutter, ...CAPTURE_CATS.victim]);
    }, 3000);
    return () => {
      window.clearTimeout(timer);
      dispose();
    };
  }, [gameReady, state.createdAt]);

  // Local celebration whenever a piece reaches the goal.
  useEffect(() => {
    const finished = state.tokens.filter((t) => t.state === "finished");
    if (!gameReady) {
      completedIds.current = null;
      return;
    }
    const previous = completedIds.current;
    completedIds.current = new Set(finished.map((t) => t.id));
    const last = previous && finished.find((t) => !previous.has(t.id));
    if (last) {
      setCelebrate({ color: last.color, id: Date.now() });
      playSfx("tokenHome");
      vibrate([12, 40, 12]);
      window.clearTimeout(celebrationTimer.current);
      celebrationTimer.current = window.setTimeout(() => setCelebrate(null), 1000);
    }
  }, [state.tokens, gameReady]);
  useEffect(
    () => () => {
      window.clearTimeout(celebrationTimer.current);
      window.clearTimeout(rollTimer.current);
      rollingRef.current = false;
    },
    [],
  );

  // Capture feedback — thud plus a buzz when pieces get sent home.
  const lastCaptureId = useRef<number | undefined>(undefined);
  const captureReady = useRef(false);
  useEffect(() => {
    const cap = state.lastCapture;
    if (!gameReady) {
      captureReady.current = false;
      return;
    }
    if (!captureReady.current) {
      captureReady.current = true;
      lastCaptureId.current = cap?.id;
      return;
    }
    if (!cap) lastCaptureId.current = undefined;
    if (cap && cap.id !== lastCaptureId.current) {
      lastCaptureId.current = cap.id;
      playSfx("tokenCut");
      vibrate([18, 50, 26]);
    }
  }, [state.lastCapture, gameReady]);

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

  if (!ready || !gameReady) return null;

  const player = playerById(state, state.turn.currentPlayerId);
  const acting = controllingColor(state);
  const selectable = state.phase === "select" ? state.legalMoves.map((m) => m.tokenId) : [];
  // Each player sits at the corner their colour owns on the board, so their
  // dice is always beside their own yard.
  const seatAt = (corner: Corner) => playerAtCorner(state, corner);

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
    <main className="royal-game-screen">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11"
          aria-label="Leave game"
          disabled={state.activeModal === "CUT_REWARD"}
          title={state.activeModal === "CUT_REWARD" ? "Choose your cut bonus first" : undefined}
          onClick={() => dispatch({ type: "SET_MODAL", modal: "EXIT_CONFIRM" })}
        >
          <LogOut className="h-5 w-5" />
        </Button>
        {guidance && (
          <p
            className="truncate rounded-full px-4 py-1.5 text-sm font-bold"
            style={{
              background: PALETTE[acting].soft,
              color: PALETTE[acting].light,
              boxShadow: `0 0 0 2px ${PALETTE[acting].base}`,
            }}
          >
            {status}
          </p>
        )}
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={guidance ? "Turn off move suggestions" : "Turn on move suggestions"}
            aria-pressed={guidance}
            onClick={() => {
              if (guidance) notices.dispose();
              dispatch({ type: "TOGGLE_SETTING", key: "showMoveSuggestions" });
            }}
          >
            {guidance ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5 opacity-60" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={state.settings.soundOn ? "Mute sound" : "Unmute sound"}
            onClick={() => {
              const on = !state.settings.soundOn;
              configureAudio(on, state.settings.hapticsOn);
              if (on) {
                unlockAudio();
                playSfx("uiTap");
              }
              dispatch({ type: "TOGGLE_SETTING", key: "soundOn" });
            }}
          >
            {state.settings.soundOn ? (
              <Volume2 className="h-5 w-5" />
            ) : (
              <VolumeX className="h-5 w-5" />
            )}
          </Button>
          <ThemeToggle />
        </div>
      </div>

      <div className="royal-game-layout">
        {seat("tl", "order-1 lg:col-start-1 lg:row-start-1")}
        {seat("tr", "order-2 lg:col-start-3 lg:row-start-1")}

        <div className="royal-game-board">
          <LudoBoard
            state={state}
            selectableTokenIds={selectable}
            activeColor={acting}
            celebrate={celebrate}
            rankEffects={rankFeedback.active}
            onRankLoaded={rankFeedback.loaded}
            onSelect={selectToken}
          />
        </div>

        {seat("bl", "order-4 lg:col-start-1 lg:row-start-2")}
        {seat("br", "order-5 lg:col-start-3 lg:row-start-2")}
        {state.activeModal === "CUT_REWARD" && <CutRewardPanel state={state} dispatch={dispatch} />}
      </div>

      <GameModals state={state} dispatch={dispatch} showResults={rankFeedback.showResults} />
    </main>
  );
}
