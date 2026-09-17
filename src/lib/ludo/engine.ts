import {
  COLOR_ORDER,
  SAFE_SQUARES,
  absoluteIndex,
  boardLayoutOf,
  DEFAULT_BOARD_LAYOUT,
  isOnCommon,
  junctionOf,
  maxStepsOf,
  type Corner,
} from "./board";
import type {
  Color,
  GameConfig,
  GameState,
  HouseRules,
  LegalMove,
  Mode,
  Player,
  TeamId,
  Token,
} from "./types";
import { resolveContestLanding, type ContestResolution } from "./contests";

export const MODE_COLORS: Record<Mode, Color[]> = {
  "2P": ["red", "yellow"],
  "3P": ["red", "green", "yellow"],
  "4P": ["red", "green", "yellow", "blue"],
  "2V2": ["red", "green", "yellow", "blue"],
};

export const TEAMS: Record<Color, TeamId> = {
  red: "A",
  yellow: "A",
  green: "B",
  blue: "B",
};

export const DEFAULT_HOUSE_RULES: HouseRules = {
  exitOnOne: false,
  secondLap: false,
  cutReward: false,
  threeSixesVariant: false,
};

export function sanitizeNickname(raw: string): string {
  return raw
    .replace(/[<>&"'`\\/]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
}

export function createGame(
  mode: Mode,
  houseRules: HouseRules,
  nicknames: Partial<Record<Color, string>>,
  chosenColors?: Color[],
): GameState {
  const required = MODE_COLORS[mode].length;
  const picked = (chosenColors ?? []).filter((c, i, a) => a.indexOf(c) === i);
  const validChoice = picked.length === required;
  const activeColors = mode === "4P" || mode === "2V2" || !validChoice ? MODE_COLORS[mode] : picked;
  const isTeam = mode === "2V2";
  // In selectable modes, claim order is turn order: the first pick starts.
  const seatOrder = [...activeColors];

  const players: Player[] = seatOrder.map((color, i) => ({
    id: `p-${color}`,
    color,
    nickname: sanitizeNickname(nicknames[color] ?? "") || `Player ${i + 1}`,
    teamId: isTeam ? TEAMS[color] : null,
    finished: false,
    finishRank: null,
  }));

  const tokens: Token[] = seatOrder.flatMap((color) =>
    [0, 1, 2, 3].map((i) => ({
      id: `${color}-${i}`,
      color,
      state: "base" as const,
      steps: 0,
      secondLapUsed: false,
      lap: 0,
    })),
  );

  const gameConfig: GameConfig = {
    mode,
    houseRules: { ...houseRules },
    activeColors: seatOrder,
    teams: isTeam ? { ...TEAMS } : {},
  };

  return {
    schemaVersion: 1,
    homePathVersion: 2,
    gameConfig,
    players,
    tokens,
    turn: {
      currentPlayerId: players[0]!.id,
      actingForTeammate: false,
      diceValue: null,
      consecutiveSixes: 0,
      owedExtraRoll: false,
    },
    phase: "idle",
    pending: null,
    legalMoves: [],
    activeModal: "NONE",
    modalContext: {},
    message: null,
    messageId: 0,
    rewardMove: false,
    winnerTeam: null,
    captureEvents: [],
    trackContests: {},
    deferredCaptureRewards: [],
    settings: {
      soundOn: true,
      hapticsOn: true,
      musicOn: false,
      notificationsOn: false,
      showMoveSuggestions: false,
    },
    createdAt: Date.now(),
    lastSavedAt: Date.now(),
  };
}

export function playerById(state: GameState, id: string): Player {
  return state.players.find((p) => p.id === id)!;
}
export function playerAtCorner(state: GameState, corner: Corner): Player | null {
  const color = boardLayoutOf(state.gameConfig).cornerToColor[corner];
  return state.players.find((player) => player.color === color) ?? null;
}

export function teammateColor(state: GameState, color: Color): Color | null {
  if (state.gameConfig.mode !== "2V2") return null;
  const team = TEAMS[color];
  return COLOR_ORDER.find((c) => c !== color && TEAMS[c] === team) ?? null;
}

export function tokensOf(state: GameState, color: Color): Token[] {
  return state.tokens.filter((t) => t.color === color);
}

/** Which color the current player is moving this turn (own, or teammate's in 2v2). */
export function controllingColor(state: GameState): Color {
  const player = playerById(state, state.turn.currentPlayerId);
  const own = tokensOf(state, player.color);
  if (own.every((t) => t.state === "finished")) {
    const mate = teammateColor(state, player.color);
    if (mate) return mate;
  }
  return player.color;
}

export function areTeammates(state: GameState, a: Color, b: Color): boolean {
  return state.gameConfig.mode === "2V2" && TEAMS[a] === TEAMS[b];
}

/** @deprecated Stacks no longer block movement. Retained for older internal callers. */
export function blockades(state: GameState): Map<number, Color> {
  void state;
  return new Map();
}

/** True when two colours belong to the same non-capturing side. */
export function wallIsFriendly(state: GameState, owner: Color, color: Color): boolean {
  return owner === color || areTeammates(state, owner, color);
}

/**
 * Every shared-loop square the token would traverse for this roll, including
 * the destination. Squares inside a home column are private and never listed.
 */
export function pathSquares(token: Token, dice: number, layout = DEFAULT_BOARD_LAYOUT): number[] {
  const junction = junctionOf(token);
  const squares: number[] = [];
  if (!Number.isInteger(dice) || dice < 1 || dice > 6) return squares;
  if (token.state === "base") return [absoluteIndex(token.color, 0, layout)];
  for (let s = token.steps + 1; s <= token.steps + dice; s++) {
    if (s >= junction) break;
    squares.push(absoluteIndex(token.color, s, layout));
  }
  return squares;
}

/** @deprecated Occupied shared cells never block movement or landing. */
export function moveIsBlocked(state: GameState, token: Token, dice: number): boolean {
  void state;
  void token;
  void dice;
  return false;
}

export function getLegalMoves(state: GameState, dice: number, movesOnly = false): LegalMove[] {
  if (!Number.isInteger(dice) || dice < 1 || dice > 6) return [];
  const color = controllingColor(state);
  const hr = state.gameConfig.houseRules;
  const moves: LegalMove[] = [];
  for (const token of tokensOf(state, color)) {
    if (token.state === "finished") continue;
    if (token.state === "base") {
      if (movesOnly) continue;
      if (dice === 6 || (hr.exitOnOne && dice === 1)) {
        moves.push({ tokenId: token.id, kind: "release" });
      }
      continue;
    }
    if (token.steps + dice > maxStepsOf(token)) continue;
    moves.push({ tokenId: token.id, kind: "move" });
  }
  return moves;
}

/** True when this move would cross the token's home-column junction for the first time. */
export function triggersSecondLap(state: GameState, token: Token, dice: number): boolean {
  const hr = state.gameConfig.houseRules;
  if (!hr.secondLap) return false;
  if (token.secondLapUsed) return false;
  if (token.state === "base" || token.state === "finished") return false;
  const junction = junctionOf(token);
  return token.steps <= junction - 1 && token.steps + dice >= junction;
}

/** Whether the optional second-lap route is legal for the complete rolled path. */
export function canContinueSecondLap(state: GameState, token: Token, dice: number): boolean {
  if (!triggersSecondLap(state, token, dice)) return false;
  const continued = { ...token, lap: token.lap + 1, secondLapUsed: true };
  return continued.steps + dice <= maxStepsOf(continued);
}

/** Apply captures caused by `token` landing. Returns captured token ids. */
export function resolveCaptures(state: GameState, token: Token): string[] {
  return resolveCapture(state, token)?.captured ?? [];
}

/** Detailed destination resolution for the reducer; animation never owns these rules. */
export function resolveCapture(
  state: GameState,
  token: Token,
  playerId = state.turn.currentPlayerId,
): ContestResolution | null {
  return resolveContestLanding(state, token, playerId);
}

/**
 * Does the player roll again after the move that just finished?
 * A capture, six, or newly completed piece earns another roll — granted once,
 * from the move that completed, so it can never chain off the same piece.
 */
export function earnsExtraRoll(opts: {
  dice: number;
  reachedHome: boolean;
  captured: boolean;
  consecutiveSixes: number;
  isReward: boolean;
  rewardOwed: boolean;
  threeSixesVariant: boolean;
}): boolean {
  if (opts.captured || opts.reachedHome) return true;
  if (opts.isReward) return opts.rewardOwed;
  // evaluateRoll rejects a third six before movement when the variant is off.
  // A played third six needs a capture or home completion, not just its dice value.
  if (opts.consecutiveSixes >= 3) return false;
  return opts.dice === 6;
}

export function refreshTokenState(token: Token): void {
  if (token.state === "base") return;
  const junction = junctionOf(token);
  if (token.steps >= maxStepsOf(token)) token.state = "finished";
  else if (token.steps >= junction) token.state = "home_stretch";
  else token.state = "common";
}

/** Mark newly-finished players and decide whether the game is over. */
export function updateStandings(state: GameState): void {
  const ranksTaken = state.players.filter((p) => p.finishRank !== null).length;
  let rank = ranksTaken;
  for (const player of state.players) {
    if (player.finished) continue;
    const own = tokensOf(state, player.color);
    if (own.length && own.every((t) => t.state === "finished")) {
      player.finished = true;
      rank += 1;
      player.finishRank = rank;
    }
  }

  if (state.gameConfig.mode === "2V2") {
    for (const team of ["A", "B"] as TeamId[]) {
      const colors = COLOR_ORDER.filter((c) => TEAMS[c] === team);
      const all = state.tokens.filter((t) => colors.includes(t.color));
      if (all.length === 8 && all.every((t) => t.state === "finished")) {
        state.winnerTeam = team;
        state.phase = "over";
        state.activeModal = "GAME_OVER";
      }
    }
    return;
  }

  const unfinished = state.players.filter((p) => !p.finished);
  if (unfinished.length <= 1) {
    for (const p of unfinished) {
      rank += 1;
      p.finished = true;
      p.finishRank = rank;
    }
    state.phase = "over";
    state.activeModal = "GAME_OVER";
  }
}

/** Can this player still act? In 2v2 a finished player plays their teammate's tokens. */
export function canAct(state: GameState, player: Player): boolean {
  if (!player.finished) return true;
  if (state.gameConfig.mode !== "2V2") return false;
  const mate = teammateColor(state, player.color);
  if (!mate) return false;
  return tokensOf(state, mate).some((t) => t.state !== "finished");
}

export function advanceTurn(state: GameState): void {
  const order = state.players;
  const index = order.findIndex((p) => p.id === state.turn.currentPlayerId);
  for (let i = 1; i <= order.length; i++) {
    const next = order[(index + i) % order.length]!;
    if (canAct(state, next)) {
      state.turn.currentPlayerId = next.id;
      break;
    }
  }
  state.turn.diceValue = null;
  state.turn.consecutiveSixes = 0;
  state.turn.owedExtraRoll = false;
  state.turn.normalTurnPending = false;
  state.turn.actingForTeammate =
    controllingColor(state) !== playerById(state, state.turn.currentPlayerId).color;
  state.legalMoves = [];
  state.pending = null;
  state.rewardMove = false;
  state.phase = "idle";
}

export function rollDie(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (buf[0]! % 6) + 1;
  }
  return Math.floor(Math.random() * 6) + 1;
}
