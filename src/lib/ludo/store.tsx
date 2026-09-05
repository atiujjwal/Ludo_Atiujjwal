import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import { junctionOf } from "./board";
import {
  advanceTurn,
  controllingColor,
  createGame,
  earnsExtraRoll,
  getLegalMoves,
  moveIsBlocked,
  playerById,
  refreshTokenState,
  resolveCaptures,
  rollDie,
  tokensOf,
  triggersSecondLap,
  updateStandings,
} from "./engine";
import { clearSave, loadGame, saveGame } from "./persistence";
import { configureAudio, playSfx, setMusicEnabled, unlockAudio, vibrate } from "./audio";
import type { Color, GameState, HouseRules, Mode, Token } from "./types";

export type Action =
  | { type: "HYDRATE"; state: GameState }
  | {
      type: "START";
      mode: Mode;
      houseRules: HouseRules;
      nicknames: Partial<Record<Color, string>>;
      colors?: Color[];
    }
  | { type: "ROLL" }
  | { type: "SELECT_TOKEN"; tokenId: string }
  | { type: "CHOOSE_ENTER_HOME" }
  | { type: "CHOOSE_CONTINUE_LAP" }
  | { type: "CUT_RELEASE" }
  | { type: "CUT_MOVE6" }
  | { type: "CUT_EXTRA_ROLL" }
  | { type: "HOP" }
  | { type: "FINISH_MOVE" }
  | { type: "SET_MODAL"; modal: GameState["activeModal"] }
  | { type: "TOGGLE_SETTING"; key: "soundOn" | "hapticsOn" | "musicOn" | "notificationsOn" }
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

function endOrContinueTurn(state: Draft) {
  if (state.phase === "over") return;
  if (state.turn.owedExtraRoll) {
    state.turn.owedExtraRoll = false;
    state.turn.diceValue = null;
    state.legalMoves = [];
    state.pending = null;
    state.rewardMove = false;
    state.phase = "idle";
    return;
  }
  advanceTurn(state);
}

function beginMove(state: Draft, tokenId: string, dice: number, isReward: boolean) {
  const token = tokenById(state, tokenId);
  if (token.state === "base") {
    token.state = "common";
    token.steps = 0;
    token.lap = 0;
    resolveCaptures(state, token);
    state.legalMoves = [];
    state.phase = "moving";
    state.pending = { tokenId, remaining: 0, isReward };
    return;
  }
  state.legalMoves = [];
  state.phase = "moving";
  state.pending = { tokenId, remaining: dice, isReward };
}

function startMoveOrAsk(state: Draft, tokenId: string, dice: number, isReward: boolean) {
  const token = tokenById(state, tokenId);
  if (token.state !== "base" && triggersSecondLap(state, token, dice)) {
    state.phase = "modal";
    state.activeModal = "SECOND_LAP_CHOICE";
    state.modalContext = { tokenId, dice, isReward };
    return;
  }
  beginMove(state, tokenId, dice, isReward);
}

function evaluateRoll(state: Draft, dice: number) {
  const hr = state.gameConfig.houseRules;
  state.turn.diceValue = dice;
  state.turn.consecutiveSixes = dice === 6 ? state.turn.consecutiveSixes + 1 : 0;

  if (dice === 6 && state.turn.consecutiveSixes >= 3 && !hr.threeSixesVariant) {
    note(state, "Three sixes in a row — turn skipped!");
    state.turn.owedExtraRoll = false;
    advanceTurn(state);
    return;
  }

  const moves = getLegalMoves(state, dice);
  state.legalMoves = moves;

  if (moves.length === 0) {
    note(state, `No legal move for a ${dice} — turn skipped.`);
    state.turn.owedExtraRoll = false;
    advanceTurn(state);
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
  if (!pending) return;
  const token = tokenById(state, pending.tokenId);
  refreshTokenState(token);

  const captured = resolveCaptures(state, token);
  const reachedHome = token.state === "finished";
  const hr = state.gameConfig.houseRules;
  const dice = state.turn.diceValue ?? 0;

  const owed = earnsExtraRoll({
    dice,
    reachedHome,
    consecutiveSixes: state.turn.consecutiveSixes,
    isReward: pending.isReward,
    rewardOwed: state.turn.owedExtraRoll,
    threeSixesVariant: hr.threeSixesVariant,
  });
  if (reachedHome) note(state, "Piece home — roll again!");

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

function reducer(state: GameState, action: Action): GameState {
  if (action.type === "HYDRATE") return action.state;
  if (action.type === "START") {
    return createGame(action.mode, action.houseRules, action.nicknames, action.colors);
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
    fresh.settings = state.settings;
    return fresh;
  }

  const draft: Draft = structuredClone(state);

  switch (action.type) {
    case "ROLL": {
      if (draft.phase !== "idle" || draft.activeModal !== "NONE") return state;
      evaluateRoll(draft, rollDie());
      break;
    }
    case "SELECT_TOKEN": {
      if (draft.phase !== "select") return state;
      const legal = draft.legalMoves.some((m) => m.tokenId === action.tokenId);
      if (!legal) return state;
      const dice = draft.rewardMove ? 6 : (draft.turn.diceValue ?? 0);
      startMoveOrAsk(draft, action.tokenId, dice, draft.rewardMove);
      break;
    }
    case "CHOOSE_ENTER_HOME": {
      const { tokenId, dice, isReward } = draft.modalContext as {
        tokenId: string;
        dice: number;
        isReward: boolean;
      };
      draft.activeModal = "NONE";
      draft.modalContext = {};
      beginMove(draft, tokenId, dice, isReward);
      break;
    }
    case "CHOOSE_CONTINUE_LAP": {
      const { tokenId, dice, isReward } = draft.modalContext as {
        tokenId: string;
        dice: number;
        isReward: boolean;
      };
      const token = tokenById(draft, tokenId);
      token.secondLapUsed = true;
      token.lap = 1;
      draft.activeModal = "NONE";
      draft.modalContext = {};
      beginMove(draft, tokenId, dice, isReward);
      break;
    }
    case "CUT_RELEASE": {
      const color = controllingColor(draft);
      const baseToken = tokensOf(draft, color).find(
        (t) => t.state === "base" && !moveIsBlocked(draft, t, 6),
      );
      draft.activeModal = "NONE";
      draft.modalContext = {};
      if (baseToken) {
        baseToken.state = "common";
        baseToken.steps = 0;
        baseToken.lap = 0;
        baseToken.secondLapUsed = false;
        resolveCaptures(draft, baseToken);
      }
      draft.phase = "idle";
      endOrContinueTurn(draft);
      break;
    }
    case "CUT_MOVE6": {
      draft.activeModal = "NONE";
      draft.modalContext = {};
      draft.rewardMove = true;
      const moves = getLegalMoves(draft, 6, true);
      if (moves.length === 0) {
        draft.rewardMove = false;
        draft.phase = "idle";
        endOrContinueTurn(draft);
      } else if (moves.length === 1) {
        startMoveOrAsk(draft, moves[0]!.tokenId, 6, true);
      } else {
        draft.legalMoves = moves;
        draft.phase = "select";
        note(draft, "Bonus move: pick a token to jump 6.");
      }
      break;
    }
    case "CUT_EXTRA_ROLL": {
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
      refreshTokenState(token);
      pending.remaining -= 1;
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
      draft.settings[action.key] = !draft.settings[action.key];
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
}

const GameContext = createContext<Ctx | null>(null);

const EMPTY = createGame("4P", { ...{ exitOnOne: false, secondLap: false, cutReward: false, threeSixesVariant: false } }, {});

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const readyRef = useRef(false);
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const saved = loadGame();
    if (saved) dispatch({ type: "HYDRATE", state: saved });
    readyRef.current = true;
    force();
  }, []);

  // Persist after every transition.
  useEffect(() => {
    if (!readyRef.current) return;
    saveGame(state);
  }, [state]);

  useEffect(() => {
    configureAudio(state.settings.soundOn, state.settings.hapticsOn);
  }, [state.settings.soundOn, state.settings.hapticsOn]);

  useEffect(() => {
    setMusicEnabled(Boolean(state.settings.musicOn) && state.settings.soundOn);
    return () => setMusicEnabled(false);
  }, [state.settings.musicOn, state.settings.soundOn]);

  // Hop-by-hop animation driver.
  useEffect(() => {
    const pending = state.pending;
    if (!pending) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (pending.remaining > 0) {
      const id = window.setTimeout(() => {
        playSfx("tokenHop");
        dispatch({ type: "HOP" });
      }, reduced ? 30 : 130);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => dispatch({ type: "FINISH_MOVE" }), reduced ? 30 : 200);
    return () => window.clearTimeout(id);
  }, [state.pending]);

  const value = useMemo(
    () => ({ state, dispatch, ready: readyRef.current }),
    [state, readyRef.current],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside GameProvider");
  return { state: ctx.state as GameState, dispatch: ctx.dispatch };
}

export { clearSave, loadGame, playSfx, unlockAudio, vibrate, junctionOf };
