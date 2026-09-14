export type Color = "red" | "green" | "yellow" | "blue";
export type Mode = "2P" | "3P" | "4P" | "2V2";
export type TeamId = "A" | "B";

export interface HouseRules {
  exitOnOne: boolean;
  secondLap: boolean;
  cutReward: boolean;
  threeSixesVariant: boolean;
}

export interface GameConfig {
  mode: Mode;
  houseRules: HouseRules;
  activeColors: Color[];
  teams: Partial<Record<Color, TeamId>>;
}

export interface Player {
  id: string;
  color: Color;
  nickname: string;
  teamId: TeamId | null;
  finished: boolean;
  finishRank: number | null;
}

export type TokenState = "base" | "common" | "home_stretch" | "finished";

export interface Token {
  id: string;
  color: Color;
  state: TokenState;
  steps: number;
  secondLapUsed: boolean;
  lap: number;
}

export interface Turn {
  currentPlayerId: string;
  actingForTeammate: boolean;
  diceValue: number | null;
  consecutiveSixes: number;
  owedExtraRoll: boolean;
}

export type ModalKind = "NONE" | "SECOND_LAP_CHOICE" | "CUT_REWARD" | "EXIT_CONFIRM" | "GAME_OVER";

export type Phase = "idle" | "rolling" | "select" | "moving" | "modal" | "over";

export interface LegalMove {
  tokenId: string;
  kind: "release" | "move";
}

export interface Pending {
  tokenId: string;
  remaining: number;
  isReward: boolean;
  finishStage?: "enter" | "settle";
}

export interface Settings {
  soundOn: boolean;
  hapticsOn: boolean;
  musicOn?: boolean;
  /** Synchronized compatibility alias for showMoveSuggestions. */
  notificationsOn?: boolean;
  /** All optional move guidance; fall back to the legacy alias, then false. */
  showMoveSuggestions?: boolean;
}

/** Presentation-only record of the last capture, used to animate the walk back. */
export interface CaptureEvent {
  id: number;
  /** Absolute shared-track square where the capture happened. */
  square: number;
  tokens: { id: string; color: Color }[];
}

export interface GameState {
  schemaVersion: 1;
  /** Absent in legacy saves whose private lane had six cells. */
  homePathVersion?: 2;
  gameConfig: GameConfig;
  players: Player[];
  tokens: Token[];
  turn: Turn;
  phase: Phase;
  pending: Pending | null;
  legalMoves: LegalMove[];
  activeModal: ModalKind;
  modalContext: Record<string, unknown>;
  message: string | null;
  messageId: number;
  rewardMove: boolean;
  winnerTeam: TeamId | null;
  /** Presentation only — never read by rule code. */
  lastCapture?: CaptureEvent | null;
  settings: Settings;

  createdAt: number;
  lastSavedAt: number;
}
