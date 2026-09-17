import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";

import { absoluteIndex, boardLayoutOf, isOnCommon, junctionOf, maxStepsOf } from "./board";
import { normalizeHomePath } from "./home-path-migration";
import { normalizeContests, resolveContestDeparture } from "./contests";
import {
  advanceTurn,
  canContinueSecondLap,
  canAct,
  controllingColor,
  createGame,
  earnsExtraRoll,
  getLegalMoves,
  playerById,
  refreshTokenState,
  resolveCapture,
  rollDie,
  tokensOf,
  triggersSecondLap,
  updateStandings,
} from "./engine";
import { clearSave, loadGame, saveGame } from "./persistence";
import { loadPreferences, preferencesOf, savePreferences } from "./local-preferences";
import { guidanceEnabled, normalizeGuidance } from "./guidance";
import {
  configureAudio,
  installAudioGestureHandlers,
  playSfx,
  setMusicEnabled,
  unlockAudio,
  vibrate,
} from "./audio";
import type { Color, GameState, HouseRules, Mode, Token } from "./types";
import { runMovement } from "./movement-coordinator";

export type Action =
  | { type: "HYDRATE"; state: GameState }
  | {
      type: "START";
      mode: Mode;
      houseRules: HouseRules;
      nicknames: Partial<Record<Color, string>>;
      colors?: Color[];
      showMoveSuggestions?: boolean;
    }
  | { type: "ROLL"; value?: number }
  | { type: "SELECT_TOKEN"; tokenId: string }
  | { type: "CHOOSE_ENTER_HOME" }
  | { type: "CHOOSE_CONTINUE_LAP" }
  | { type: "CUT_RELEASE" }
  | { type: "CUT_MOVE6" }
  | { type: "CUT_EXTRA_ROLL" }
  | { type: "HOP" }
  | {
      type: "COMPLETE_MOVE";
      tokenId: string;
      fromSteps: number;
      remaining: number;
      createdAt: number;
    }
  | { type: "ADVANCE_FINISH"; tokenId: string }
  | { type: "FINISH_MOVE" }
  | { type: "SET_MODAL"; modal: GameState["activeModal"] }
  | {
      type: "TOGGLE_SETTING";
      key: "soundOn" | "hapticsOn" | "musicOn" | "notificationsOn" | "showMoveSuggestions";
    }
  | { type: "REMATCH" }
  | { type: "RESET" };

type Draft = GameState;

function note(state: Draft, message: string | null) {
  state.message = message;
  state.messageId += 1;
}

function tokenById(state: Draft, id: string): Token {
  return state.tokens.find((t) => t.id === id)!;
}

function resetSamePlayerToIdle(state: Draft) {
  state.turn.diceValue = null;
  state.turn.consecutiveSixes = 0;
  state.turn.owedExtraRoll = false;
  state.legalMoves = [];
  state.pending = null;
  state.rewardMove = false;
  state.activeModal = "NONE";
  state.modalContext = {};
  state.phase = "idle";
}

/** Start the oldest queued capture reward for the current player. */
function beginDeferredCaptureBonus(state: Draft): boolean {
  if (state.phase === "over") return false;
  const rewards = (state.deferredCaptureRewards ??= []);
  const index = rewards.findIndex((reward) => reward.playerId === state.turn.currentPlayerId);
  if (index < 0) return false;
  const [reward] = rewards.splice(index, 1);
  resetSamePlayerToIdle(state);
  state.turn.normalTurnPending = true;
  note(state, "A contested stack broke — take your saved capture bonus.");
  if (state.gameConfig.houseRules.cutReward) {
    state.turn.owedExtraRoll = true;
    state.phase = "modal";
    state.activeModal = "CUT_REWARD";
    state.modalContext = { deferred: true, captureId: reward!.captureId };
  }
  return true;
}

function queueDeferredCapture(state: Draft, captureId: number, playerId: string) {
  (state.deferredCaptureRewards ??= []).push({ captureId, playerId });
}

function endOrContinueTurn(state: Draft) {
  if (state.phase === "over") return;
  const currentPlayer = playerById(state, state.turn.currentPlayerId);
  if (state.turn.owedExtraRoll && canAct(state, currentPlayer)) {
    state.turn.owedExtraRoll = false;
    state.turn.diceValue = null;
    state.legalMoves = [];
    state.pending = null;
    state.rewardMove = false;
    state.phase = "idle";
    return;
  }
  if (state.turn.normalTurnPending) {
    if (beginDeferredCaptureBonus(state)) return;
    state.turn.normalTurnPending = false;
    resetSamePlayerToIdle(state);
    note(state, "Your regular turn starts now.");
    return;
  }
  advanceTurn(state);
  beginDeferredCaptureBonus(state);
}

function beginMove(state: Draft, tokenId: string, dice: number, isReward: boolean) {
  const token = tokenById(state, tokenId);
  const originSquare = isOnCommon(token)
    ? absoluteIndex(token.color, token.steps, boardLayoutOf(state.gameConfig))
    : null;
  const actorPlayerId = state.turn.currentPlayerId;
  if (token.state === "base") {
    token.state = "common";
    token.steps = 0;
    token.lap = 0;
    state.legalMoves = [];
    state.phase = "moving";
    state.pending = { tokenId, remaining: 0, isReward, originSquare, actorPlayerId };
    return;
  }
  state.legalMoves = [];
  state.phase = "moving";
  state.pending = { tokenId, remaining: dice, isReward, originSquare, actorPlayerId };
}

function startMoveOrAsk(state: Draft, tokenId: string, dice: number, isReward: boolean) {
  const token = tokenById(state, tokenId);
  if (token.state !== "base" && triggersSecondLap(state, token, dice)) {
    state.phase = "modal";
    state.activeModal = "SECOND_LAP_CHOICE";
    state.modalContext = { tokenId, dice, isReward };
    state.legalMoves = [];
    return;
  }
  beginMove(state, tokenId, dice, isReward);
}

function noLegalRoll(state: Draft, dice: number) {
  state.pending = null;
  state.legalMoves = [];
  state.activeModal = "NONE";
  state.modalContext = {};
  state.phase = "idle";
  if (state.rewardMove) {
    state.rewardMove = false;
    endOrContinueTurn(state);
  } else if (dice === 6 && state.turn.consecutiveSixes < 3) {
    note(state, "No legal move for a 6 — roll again.");
    state.turn.diceValue = null;
  } else {
    note(state, `No legal move for a ${dice} — turn skipped.`);
    state.turn.owedExtraRoll = false;
    endOrContinueTurn(state);
  }
}

function evaluateRoll(state: Draft, dice: number) {
  const hr = state.gameConfig.houseRules;
  state.turn.diceValue = dice;
  state.turn.consecutiveSixes = dice === 6 ? state.turn.consecutiveSixes + 1 : 0;

  if (dice === 6 && state.turn.consecutiveSixes >= 3 && !hr.threeSixesVariant) {
    note(state, "Three sixes in a row — turn skipped!");
    state.turn.owedExtraRoll = false;
    advanceTurn(state);
    beginDeferredCaptureBonus(state);
    return;
  }

  const moves = getLegalMoves(state, dice);
  state.legalMoves = moves;

  if (moves.length === 0) {
    noLegalRoll(state, dice);
    return;
  }
  if (moves.length === 1) {
    startMoveOrAsk(state, moves[0]!.tokenId, dice, false);
    return;
  }
  state.phase = "select";
}

function finishMove(state: Draft) {
  const pending = state.pending;
  if (!pending || pending.remaining > 0 || pending.finishStage === "enter") return;
  const token = tokenById(state, pending.tokenId);
  refreshTokenState(token);

  const departure = resolveContestDeparture(state, pending.originSquare);
  if (departure) queueDeferredCapture(state, departure.event.id, departure.creditedPlayerId);
  const capture = resolveCapture(state, token, pending.actorPlayerId);
  const captured = capture?.captured ?? [];
  const reachedHome = token.state === "finished";
  const hr = state.gameConfig.houseRules;
  const dice = state.turn.diceValue ?? 0;

  const owed = earnsExtraRoll({
    dice,
    reachedHome,
    captured: captured.length > 0,
    consecutiveSixes: state.turn.consecutiveSixes,
    isReward: pending.isReward,
    rewardOwed: state.turn.owedExtraRoll,
    threeSixesVariant: hr.threeSixesVariant,
  });
  if (reachedHome) note(state, "Piece home — roll again!");
  else if (captured.length > 0) note(state, "Opponent cut — roll again!");

  // Reset an exhausted third-six streak before any reward dialog/save.
  if (state.turn.consecutiveSixes >= 3 && (captured.length > 0 || reachedHome)) {
    state.turn.consecutiveSixes = 0;
  }

  state.turn.owedExtraRoll = owed;

  state.pending = null;
  state.rewardMove = false;
  state.legalMoves = [];

  updateStandings(state);
  if (state.phase === "over") {
    state.pending = null;
    return;
  }

  if (captured.length > 0 && hr.cutReward) {
    state.phase = "modal";
    state.activeModal = "CUT_REWARD";
    state.modalContext = { cutterColor: token.color };
    return;
  }

  state.phase = "idle";
  endOrContinueTurn(state);
}

export function gameReducer(state: GameState, action: Action): GameState {
  if (action.type === "HYDRATE") {
    const hydrated = normalizeContests(normalizeHomePath(structuredClone(action.state)));
    hydrated.settings = normalizeGuidance(hydrated.settings);
    const savedReward =
      hydrated.activeModal === "CUT_REWARD" ||
      hydrated.rewardMove ||
      (hydrated.activeModal === "SECOND_LAP_CHOICE" && hydrated.modalContext["isReward"] === true);
    if (savedReward) {
      // Older saves may have opened this dialog without recording a capture roll.
      hydrated.turn.owedExtraRoll = true;
      if (hydrated.turn.consecutiveSixes >= 3) hydrated.turn.consecutiveSixes = 0;
    }
    if (hydrated.activeModal === "SECOND_LAP_CHOICE") {
      const context = hydrated.modalContext as {
        tokenId?: string;
        dice?: number;
        isReward?: boolean;
      };
      const token = hydrated.tokens.find((t) => t.id === context.tokenId);
      const dice = context.dice ?? 0;
      const legal = getLegalMoves(hydrated, dice, Boolean(context.isReward));
      if (
        !token ||
        !triggersSecondLap(hydrated, token, dice) ||
        (!legal.some((m) => m.tokenId === token.id) && !canContinueSecondLap(hydrated, token, dice))
      ) {
        hydrated.activeModal = "NONE";
        hydrated.modalContext = {};
        hydrated.rewardMove = Boolean(context.isReward);
        hydrated.phase = "select";
      }
    }
    if (hydrated.phase === "select") {
      const dice = hydrated.rewardMove ? 6 : (hydrated.turn.diceValue ?? 0);
      hydrated.legalMoves = getLegalMoves(hydrated, dice, hydrated.rewardMove);
      if (hydrated.legalMoves.length === 0) noLegalRoll(hydrated, dice);
    } else {
      hydrated.legalMoves = [];
    }
    hydrated.turn.actingForTeammate =
      controllingColor(hydrated) !== playerById(hydrated, hydrated.turn.currentPlayerId).color;
    return hydrated;
  }
  if (action.type === "START") {
    const fresh = createGame(action.mode, action.houseRules, action.nicknames, action.colors);
    const { soundOn, hapticsOn, musicOn } = preferencesOf(state.settings);
    fresh.settings = { ...fresh.settings, soundOn, hapticsOn, musicOn };
    fresh.settings.showMoveSuggestions = action.showMoveSuggestions ?? false;
    fresh.settings = normalizeGuidance(fresh.settings);
    return fresh;
  }

  if (action.type === "REMATCH") {
    // Same players, same colours, same house rules — a fresh board.
    const nicknames: Partial<Record<Color, string>> = {};
    for (const p of state.players) nicknames[p.color] = p.nickname;
    const fresh = createGame(
      state.gameConfig.mode,
      state.gameConfig.houseRules,
      nicknames,
      state.gameConfig.activeColors,
    );
    fresh.settings = normalizeGuidance(state.settings);
    return fresh;
  }

  const draft: Draft = structuredClone(state);

  switch (action.type) {
    case "ROLL": {
      if (draft.phase !== "idle" || draft.activeModal !== "NONE") return state;
      const dice = action.value ?? rollDie();
      if (!Number.isInteger(dice) || dice < 1 || dice > 6) return state;
      evaluateRoll(draft, dice);
      break;
    }
    case "SELECT_TOKEN": {
      if (draft.phase !== "select") return state;
      const dice = draft.rewardMove ? 6 : (draft.turn.diceValue ?? 0);
      const currentMoves = getLegalMoves(draft, dice, draft.rewardMove);
      const legal = currentMoves.some((m) => m.tokenId === action.tokenId);
      if (!legal) return state;
      startMoveOrAsk(draft, action.tokenId, dice, draft.rewardMove);
      break;
    }
    case "CHOOSE_ENTER_HOME": {
      if (draft.activeModal !== "SECOND_LAP_CHOICE") return state;
      const { tokenId, dice, isReward } = draft.modalContext as {
        tokenId: string;
        dice: number;
        isReward: boolean;
      };
      const token = draft.tokens.find((candidate) => candidate.id === tokenId);
      const legal =
        token && getLegalMoves(draft, dice, isReward).some((m) => m.tokenId === tokenId);
      if (!token || !legal || !triggersSecondLap(draft, token, dice)) return state;
      draft.activeModal = "NONE";
      draft.modalContext = {};
      beginMove(draft, tokenId, dice, isReward);
      break;
    }
    case "CHOOSE_CONTINUE_LAP": {
      if (draft.activeModal !== "SECOND_LAP_CHOICE") return state;
      const { tokenId, dice, isReward } = draft.modalContext as {
        tokenId: string;
        dice: number;
        isReward: boolean;
      };
      const token = draft.tokens.find((candidate) => candidate.id === tokenId);
      if (!token || !canContinueSecondLap(draft, token, dice)) return state;
      token.secondLapUsed = true;
      token.lap += 1;
      draft.activeModal = "NONE";
      draft.modalContext = {};
      beginMove(draft, tokenId, dice, isReward);
      break;
    }
    case "CUT_RELEASE": {
      if (draft.activeModal !== "CUT_REWARD") return state;
      const color = controllingColor(draft);
      const releaseIds = new Set(
        getLegalMoves(draft, 6)
          .filter((move) => move.kind === "release")
          .map((move) => move.tokenId),
      );
      const baseToken = tokensOf(draft, color).find((token) => releaseIds.has(token.id));
      if (!baseToken) return state;
      draft.activeModal = "NONE";
      draft.modalContext = {};
      baseToken.state = "common";
      baseToken.steps = 0;
      baseToken.lap = 0;
      baseToken.secondLapUsed = false;
      resolveCapture(draft, baseToken, draft.turn.currentPlayerId);
      draft.phase = "idle";
      endOrContinueTurn(draft);
      break;
    }
    case "CUT_MOVE6": {
      if (draft.activeModal !== "CUT_REWARD") return state;
      const moves = getLegalMoves(draft, 6, true);
      if (moves.length === 0) return state;
      draft.activeModal = "NONE";
      draft.modalContext = {};
      draft.rewardMove = true;
      if (moves.length === 1) {
        startMoveOrAsk(draft, moves[0]!.tokenId, 6, true);
      } else {
        draft.legalMoves = moves;
        draft.phase = "select";
        note(draft, "Bonus move: pick a token to jump 6.");
      }
      break;
    }
    case "CUT_EXTRA_ROLL": {
      if (draft.activeModal !== "CUT_REWARD") return state;
      draft.activeModal = "NONE";
      draft.modalContext = {};
      draft.turn.owedExtraRoll = true;
      draft.phase = "idle";
      endOrContinueTurn(draft);
      break;
    }
    case "HOP": {
      const pending = draft.pending;
      if (!pending || pending.remaining <= 0) return state;
      const token = tokenById(draft, pending.tokenId);
      token.steps += 1;
      pending.remaining -= 1;
      if (token.steps === maxStepsOf(token) && pending.remaining === 0) {
        // Keep completion/bonuses pending until the entry and settling motion finish.
        token.state = "home_stretch";
        pending.finishStage = "enter";
      } else refreshTokenState(token);
      break;
    }
    case "COMPLETE_MOVE": {
      const pending = draft.pending;
      const token = pending && tokenById(draft, pending.tokenId);
      if (
        draft.createdAt !== action.createdAt ||
        draft.phase !== "moving" ||
        !pending ||
        !token ||
        pending.tokenId !== action.tokenId ||
        pending.remaining !== action.remaining ||
        token.steps !== action.fromSteps
      )
        return state;
      // Replay the already-authorized route in one reducer transaction. The
      // existing HOP action remains available to tests and older callers.
      while (pending.remaining > 0) {
        token.steps += 1;
        pending.remaining -= 1;
        if (token.steps === maxStepsOf(token) && pending.remaining === 0) {
          token.state = "home_stretch";
          pending.finishStage = "enter";
        } else refreshTokenState(token);
      }
      if (pending.finishStage === "enter") pending.finishStage = "settle";
      finishMove(draft);
      break;
    }
    case "ADVANCE_FINISH": {
      if (
        draft.phase !== "moving" ||
        draft.pending?.tokenId !== action.tokenId ||
        draft.pending.remaining !== 0 ||
        draft.pending.finishStage !== "enter"
      )
        return state;
      draft.pending.finishStage = "settle";
      break;
    }
    case "FINISH_MOVE": {
      finishMove(draft);
      break;
    }
    case "SET_MODAL": {
      draft.activeModal = action.modal;
      break;
    }
    case "TOGGLE_SETTING": {
      if (action.key === "notificationsOn" || action.key === "showMoveSuggestions") {
        draft.settings.showMoveSuggestions = !guidanceEnabled(draft.settings);
        draft.settings = normalizeGuidance(draft.settings);
      } else {
        draft.settings[action.key] = !draft.settings[action.key];
      }
      break;
    }
    case "RESET": {
      return state;
    }
  }

  draft.turn.actingForTeammate =
    controllingColor(draft) !== playerById(draft, draft.turn.currentPlayerId).color;
  return draft;
}

interface Ctx {
  state: GameState | null;
  dispatch: React.Dispatch<Action>;
  ready: boolean;
  hasGame: boolean;
}

const GameContext = createContext<Ctx | null>(null);

const EMPTY = createGame(
  "4P",
  { ...{ exitOnOne: false, secondLap: false, cutReward: false, threeSixesVariant: false } },
  {},
);

export function GameProvider({ children }: { children: ReactNode }) {
  useEffect(() => installAudioGestureHandlers(), []);
  const [state, reducerDispatch] = useReducer(gameReducer, EMPTY);
  const [ready, setReady] = useState(false);
  const [hasGame, setHasGame] = useState(false);
  const { soundOn, hapticsOn, musicOn } = state.settings;
  const movementKey = state.pending
    ? `${state.createdAt}:${state.pending.tokenId}:${state.pending.remaining}:${state.pending.finishStage ?? "route"}:${state.tokens.find((token) => token.id === state.pending?.tokenId)?.steps ?? -1}`
    : "none";
  const dispatch = useCallback((action: Action) => {
    if (action.type === "RESET") {
      setHasGame(false);
      clearSave();
      return;
    }
    if (action.type === "START" || action.type === "REMATCH") setHasGame(true);
    reducerDispatch(action);
  }, []);

  useEffect(() => {
    const saved = loadGame();
    const initial = saved ?? structuredClone(EMPTY);
    const { soundOn, hapticsOn, musicOn } = loadPreferences(initial.settings);
    initial.settings = { ...initial.settings, soundOn, hapticsOn, musicOn };
    reducerDispatch({ type: "HYDRATE", state: initial });
    setHasGame(Boolean(saved));
    setReady(true);
  }, []);

  // Persist only stable turns. Saving individual animation hops can restore a
  // partially moved token while losing the remainder of its pending move.
  useEffect(() => {
    if (!ready || !hasGame || state.phase === "moving" || state.phase === "rolling") return;
    saveGame(state);
  }, [ready, hasGame, state]);

  useEffect(() => {
    if (ready) savePreferences({ soundOn, hapticsOn, musicOn: Boolean(musicOn) });
  }, [ready, soundOn, hapticsOn, musicOn]);

  useEffect(() => {
    configureAudio(state.settings.soundOn, state.settings.hapticsOn);
  }, [state.settings.soundOn, state.settings.hapticsOn]);

  useEffect(() => {
    setMusicEnabled(Boolean(state.settings.musicOn) && state.settings.soundOn);
    return () => setMusicEnabled(false);
  }, [state.settings.musicOn, state.settings.soundOn]);

  // The coordinator animates the complete visual route without React state
  // updates, then commits the authorized move once.
  useEffect(() => {
    const pending = state.pending;
    if (!pending) return;
    if (pending.remaining > 0) {
      const token = state.tokens.find((candidate) => candidate.id === pending.tokenId);
      if (!token) return;
      return runMovement(state, token, pending, () =>
        dispatch({
          type: "COMPLETE_MOVE",
          tokenId: token.id,
          fromSteps: token.steps,
          remaining: pending.remaining,
          createdAt: state.createdAt,
        }),
      );
    }
    const entering = pending.finishStage === "enter";
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(
      () =>
        dispatch(
          entering ? { type: "ADVANCE_FINISH", tokenId: pending.tokenId } : { type: "FINISH_MOVE" },
        ),
      reduced ? 30 : pending.finishStage === "settle" ? 180 : 200,
    );
    return () => window.clearTimeout(id);
    // Preference changes are allowed during travel and must not restart it.
    // movementKey includes every rule-bearing field used by this coordinator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movementKey, dispatch]);

  const value = useMemo(
    () => ({ state, dispatch, ready, hasGame }),
    [dispatch, ready, state, hasGame],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside GameProvider");
  return {
    state: ctx.state as GameState,
    dispatch: ctx.dispatch,
    ready: ctx.ready,
    hasGame: ctx.hasGame,
  };
}

export { clearSave, loadGame, playSfx, unlockAudio, vibrate, junctionOf };
