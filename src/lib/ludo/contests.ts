import { SAFE_SQUARES, absoluteIndex, boardLayoutOf, isOnCommon } from "./board";
import type { CaptureEvent, Color, ContestSide, GameState, Token, TrackContest } from "./types";

const EVENT_HISTORY_LIMIT = 8;

export interface TrackCellAnalysis {
  square: number;
  safe: boolean;
  occupants: Token[];
  bySide: Map<ContestSide, Token[]>;
  contest: TrackContest | null;
  defenders: Token[];
  attackers: Token[];
}

export interface ContestResolution {
  event: CaptureEvent;
  captured: string[];
  survivorId: string;
  creditedPlayerId: string;
  trigger: "arrival" | "departure";
}

export function contestSide(state: GameState, color: Color): ContestSide {
  return state.gameConfig.mode === "2V2" ? (state.gameConfig.teams[color] ?? color) : color;
}

export function occupantsAt(state: GameState, square: number): Token[] {
  const layout = boardLayoutOf(state.gameConfig);
  return state.tokens.filter(
    (token) => isOnCommon(token) && absoluteIndex(token.color, token.steps, layout) === square,
  );
}

function contestStore(state: GameState): Record<string, TrackContest> {
  return (state.trackContests ??= {});
}

function stablePlayerId(token: Token) {
  return `p-${token.color}`;
}

function emitCapture(
  state: GameState,
  square: number,
  survivor: Token,
  victims: Token[],
): CaptureEvent {
  const previousId = Math.max(
    state.lastCapture?.id ?? 0,
    ...(state.captureEvents ?? []).map((event) => event.id),
  );
  const event: CaptureEvent = {
    id: previousId + 1,
    square,
    cutterColor: survivor.color,
    tokens: victims.map(({ id, color }) => ({ id, color })),
  };
  state.lastCapture = event;
  state.captureEvents = [...(state.captureEvents ?? []), event].slice(-EVENT_HISTORY_LIMIT);
  return event;
}

function sendHome(token: Token) {
  token.state = "base";
  token.steps = 0;
  token.lap = 0;
  token.secondLapUsed = false;
}

function sideBuckets(state: GameState, occupants: Token[]) {
  const bySide = new Map<ContestSide, Token[]>();
  for (const token of occupants) {
    const side = contestSide(state, token.color);
    bySide.set(side, [...(bySide.get(side) ?? []), token]);
  }
  return bySide;
}

function ensureArrivalOrder(
  state: GameState,
  contest: TrackContest,
  occupants: Token[],
  arriving?: { token: Token; playerId: string },
) {
  const present = new Set(occupants.map((token) => token.id));
  contest.attackerArrivals = contest.attackerArrivals.filter(
    (entry) => present.has(entry.tokenId) && entry.side !== contest.defenderSide,
  );
  const recorded = new Set(contest.attackerArrivals.map((entry) => entry.tokenId));
  for (const token of occupants) {
    const side = contestSide(state, token.color);
    if (side === contest.defenderSide || recorded.has(token.id)) continue;
    contest.attackerArrivals.push({
      tokenId: token.id,
      side,
      playerId: arriving?.token.id === token.id ? arriving.playerId : stablePlayerId(token),
    });
    recorded.add(token.id);
  }
}

/** Read-only cell analysis used by rules and rendering. */
export function analyzeTrackCell(state: GameState, square: number): TrackCellAnalysis {
  const occupants = occupantsAt(state, square);
  const bySide = sideBuckets(state, occupants);
  const contest = state.trackContests?.[String(square)] ?? null;
  const defenders = contest ? (bySide.get(contest.defenderSide) ?? []) : [];
  const attackers = contest
    ? occupants.filter((token) => contestSide(state, token.color) !== contest.defenderSide)
    : [];
  return {
    square,
    safe: SAFE_SQUARES.has(square),
    occupants,
    bySide,
    contest,
    defenders,
    attackers,
  };
}

function reconcile(
  state: GameState,
  square: number,
  trigger: "arrival" | "departure",
  arriving?: { token: Token; playerId: string },
): ContestResolution | null {
  const store = contestStore(state);
  if (SAFE_SQUARES.has(square)) {
    delete store[String(square)];
    return null;
  }
  const occupants = occupantsAt(state, square);
  const bySide = sideBuckets(state, occupants);
  if (bySide.size <= 1) {
    delete store[String(square)];
    return null;
  }

  let contest = store[String(square)];
  if (!contest) {
    const resident = occupants.find((token) => token.id !== arriving?.token.id) ?? occupants[0]!;
    contest = { defenderSide: contestSide(state, resident.color), attackerArrivals: [] };
    store[String(square)] = contest;
  }
  ensureArrivalOrder(state, contest, occupants, arriving);

  let defenders = bySide.get(contest.defenderSide) ?? [];
  if (defenders.length === 0) {
    const oldest = contest.attackerArrivals.find((entry) =>
      occupants.some((token) => token.id === entry.tokenId),
    );
    if (!oldest) {
      delete store[String(square)];
      return null;
    }
    contest.defenderSide = oldest.side;
    ensureArrivalOrder(state, contest, occupants, arriving);
    defenders = bySide.get(contest.defenderSide) ?? [];
  }

  const attackers = occupants.filter(
    (token) => contestSide(state, token.color) !== contest.defenderSide,
  );
  if (attackers.length === 0) {
    delete store[String(square)];
    return null;
  }
  if (attackers.length < defenders.length) return null;

  const newest = [...contest.attackerArrivals]
    .reverse()
    .find((entry) => attackers.some((token) => token.id === entry.tokenId));
  if (!newest) return null;
  const survivor = attackers.find((token) => token.id === newest.tokenId)!;
  const victims = occupants.filter((token) => token.id !== survivor.id);
  for (const victim of victims) sendHome(victim);
  delete store[String(square)];
  const event = emitCapture(state, square, survivor, victims);
  return {
    event,
    captured: victims.map((token) => token.id),
    survivorId: survivor.id,
    creditedPlayerId: newest.playerId,
    trigger,
  };
}

/** Reconcile an unsafe origin after a token has logically left it. */
export function resolveContestDeparture(
  state: GameState,
  square: number | null | undefined,
): ContestResolution | null {
  if (square === null || square === undefined) return null;
  return reconcile(state, square, "departure");
}

/** Apply destination-only combat after movement has fully landed. */
export function resolveContestLanding(
  state: GameState,
  token: Token,
  playerId = state.turn.currentPlayerId,
): ContestResolution | null {
  if (!isOnCommon(token)) return null;
  const square = absoluteIndex(token.color, token.steps, boardLayoutOf(state.gameConfig));
  return reconcile(state, square, "arrival", { token, playerId });
}

/** Normalize optional state without causing capture side effects during hydration. */
export function normalizeContests(state: GameState): GameState {
  state.trackContests ??= {};
  state.deferredCaptureRewards ??= [];
  state.captureEvents ??= state.lastCapture ? [state.lastCapture] : [];
  for (const key of Object.keys(state.trackContests)) {
    const square = Number(key);
    if (!Number.isInteger(square) || square < 0 || square >= 52 || SAFE_SQUARES.has(square)) {
      delete state.trackContests[key];
      continue;
    }
    const occupants = occupantsAt(state, square);
    const bySide = sideBuckets(state, occupants);
    const contest = state.trackContests[key]!;
    if (bySide.size <= 1 || !bySide.has(contest.defenderSide)) {
      delete state.trackContests[key];
      continue;
    }
    ensureArrivalOrder(state, contest, occupants);
  }
  return state;
}
