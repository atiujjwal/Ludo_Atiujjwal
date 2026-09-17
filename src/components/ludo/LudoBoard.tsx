import { memo, useMemo } from "react";
import { Token } from "./Token";
import { MemoizedBoardPiece as BoardPiece } from "./BoardPiece";
import { guidanceEnabled } from "@/lib/ludo/guidance";
import { BoardArtwork } from "./BoardArtwork";
import { cellStyle, colorStyle } from "@/lib/ludo/board-style";
import { BoardEffects } from "./BoardEffects";
import {
  BASE_ORIGIN,
  COLOR_ORDER,
  SAFE_SQUARES,
  TRACK,
  absoluteIndex,
  boardLayoutOf,
  geometryColor,
  isOnCommon,
} from "@/lib/ludo/board";
import { getLegalMoves } from "@/lib/ludo/engine";
import { analyzeTrackCell, contestSide } from "@/lib/ludo/contests";
import { destinations, positionTokens } from "@/lib/ludo/presentation";
import { APPEARANCE, type BoardTheme, type TokenSkin } from "@/lib/ludo/theme";
import type { Color, GameState } from "@/lib/ludo/types";
import type { RankCat } from "@/lib/ludo/cat-effects";

interface Props {
  state: GameState;
  selectableTokenIds: string[];
  activeColor: Color;
  onSelect: (tokenId: string) => void;
  celebrate?: { color: Color; id: number } | null;
  rankEffects?: Partial<Record<Color, RankCat>> | undefined;
  onRankLoaded?: ((color: Color, session: number) => void) | undefined;
  theme?: BoardTheme;
  tokenSkin?: TokenSkin;
}

// Local dice-face/roll UI updates don't change board state or legal guidance.
export const MemoizedLudoBoard = memo(
  LudoBoard,
  (a, b) =>
    a.state === b.state &&
    a.activeColor === b.activeColor &&
    a.onSelect === b.onSelect &&
    a.celebrate === b.celebrate &&
    a.rankEffects === b.rankEffects &&
    a.onRankLoaded === b.onRankLoaded &&
    a.theme === b.theme &&
    a.tokenSkin === b.tokenSkin,
);

export function LudoBoard({
  state,
  activeColor,
  onSelect,
  celebrate,
  rankEffects,
  onRankLoaded,
  theme = APPEARANCE.board,
  tokenSkin = APPEARANCE.token,
}: Props) {
  const layout = useMemo(() => boardLayoutOf(state.gameConfig), [state.gameConfig]);
  const moves = useMemo(
    () =>
      state.phase === "select" && state.activeModal === "NONE"
        ? getLegalMoves(state, state.rewardMove ? 6 : (state.turn.diceValue ?? 0), state.rewardMove)
        : [],
    [state],
  );
  const selectable = new Set(moves.map((m) => m.tokenId));
  const guidance = guidanceEnabled(state.settings);
  const previews = useMemo(
    () => (guidance ? destinations(state, moves) : []),
    [state, guidance, moves],
  );
  const positioned = useMemo(
    () => positionTokens(state.tokens, state.pending, layout),
    [state.tokens, state.pending, layout],
  );
  const stacks = new Map(
    positioned.filter((item) => item.count > 1).map((item) => [item.key, item]),
  );
  const stackAnalysis = new Map(
    Array.from(stacks, ([key, item]) => {
      if (!isOnCommon(item.token)) return [key, null] as const;
      const square = absoluteIndex(item.token.color, item.token.steps, layout);
      return [key, analyzeTrackCell(state, square)] as const;
    }),
  );

  return (
    <div className="royal-board-group">
      <div className={theme.className} data-board-theme={theme.id} aria-label="Ludo board">
        <div className="royal-grid">
          <BoardArtwork layout={layout} />
          {COLOR_ORDER.map((color) => (
            <div
              key={color}
              className="royal-zone-state"
              aria-hidden
              data-active={activeColor === color}
              data-unused={!state.gameConfig.activeColors.includes(color)}
              style={{
                ...cellStyle(BASE_ORIGIN[geometryColor(color, layout)], 6),
                ...colorStyle(color),
              }}
            />
          ))}
          {previews.map((preview) => (
            <div
              key={`${preview.tokenId}-${preview.alternative}`}
              className="royal-destination"
              data-alternative={preview.alternative}
              aria-hidden
              style={cellStyle(preview.cell)}
            />
          ))}
          {Array.from(stacks, ([key, item]) => {
            const analysis = stackAnalysis.get(key);
            const contested = Boolean(analysis?.contest && analysis.attackers.length > 0);
            if (!contested)
              return (
                <div
                  key={key}
                  className="royal-stack-outline"
                  data-protected={Boolean(analysis?.safe)}
                  aria-hidden
                  style={cellStyle(item.cell)}
                />
              );
            const label = `Contested stack: ${analysis!.defenders.length} defending, ${analysis!.attackers.length} attacking`;
            return (
              <div
                key={key}
                className="royal-contest-outline"
                role="img"
                aria-label={label}
                style={cellStyle(item.cell)}
              >
                <span className="royal-contest-pips" data-role="defender">
                  {analysis!.defenders.map((token) => (
                    <i key={token.id} style={colorStyle(token.color)} />
                  ))}
                </span>
                <span className="royal-contest-pips" data-role="attacker">
                  {analysis!.attackers.map((token) => (
                    <i key={token.id} style={colorStyle(token.color)} />
                  ))}
                </span>
              </div>
            );
          })}
          {positioned.map((item) => {
            const { token, slot } = item;
            const legal = selectable.has(token.id);
            const square = isOnCommon(token) ? absoluteIndex(token.color, token.steps, layout) : -1;
            const safe = SAFE_SQUARES.has(square);
            const analysis = stackAnalysis.get(item.key);
            const role = analysis?.contest
              ? contestSide(state, token.color) === analysis.contest.defenderSide
                ? "defender"
                : "challenger"
              : null;
            const moving = state.phase === "moving" && state.pending?.tokenId === token.id;
            const visual =
              token.state === "finished"
                ? "home"
                : moving
                  ? "moving"
                  : legal
                    ? "selectable"
                    : safe
                      ? "safe"
                      : "idle";
            return (
              <BoardPiece
                key={token.id}
                item={item}
                legal={legal}
                moving={moving}
                settling={moving && state.pending?.finishStage === "settle"}
                visual={visual}
                skin={tokenSkin}
                onSelect={onSelect}
                label={`${token.color} piece ${slot + 1}${token.state === "finished" ? ", finished" : role ? `, contest ${role}` : safe ? ", protected" : ""}${legal ? ", can move" : ""}`}
              />
            );
          })}
          <BoardEffects
            key={state.createdAt}
            matchId={state.createdAt}
            layout={layout}
            captures={state.captureEvents ?? (state.lastCapture ? [state.lastCapture] : [])}
            celebrate={celebrate ?? null}
            rankEffects={rankEffects}
            onRankLoaded={onRankLoaded}
          />
        </div>
      </div>
      {guidance && moves.length > 0 && (
        <div className="royal-move-picker" role="group" aria-label="Choose a legal piece to move">
          {moves.map((move) => {
            const item = positioned.find((p) => p.token.id === move.tokenId)!;
            return (
              <button
                key={move.tokenId}
                type="button"
                onClick={() => onSelect(move.tokenId)}
                aria-label={`Move ${item.token.color} piece ${item.slot + 1}`}
              >
                <Token color={item.token.color} skin={tokenSkin} className="h-8 w-8" />
              </button>
            );
          })}
        </div>
      )}
      {previews.some((p) => p.alternative) && (
        <p className="royal-route-legend">Dashed square: optional Second Lap destination</p>
      )}
    </div>
  );
}
