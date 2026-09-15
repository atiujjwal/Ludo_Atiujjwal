import { Token, type TokenVisualState } from "./Token";
import { memo } from "react";
import type { positionTokens } from "@/lib/ludo/presentation";
import type { TokenSkin } from "@/lib/ludo/theme";

interface Props {
  item: ReturnType<typeof positionTokens>[number];
  legal: boolean;
  moving: boolean;
  settling?: boolean;
  visual: TokenVisualState;
  label: string;
  skin: TokenSkin;
  onSelect: (id: string) => void;
}

export function BoardPiece({
  item,
  legal,
  moving,
  settling = false,
  visual,
  label,
  skin,
  onSelect,
}: Props) {
  const { token, cell, offset } = item;
  return (
    <div
      className="royal-piece-position"
      data-token-id={token.id}
      data-interactive={legal}
      data-moving={moving}
      style={{ transform: `translate(${cell.col * 100}%, ${cell.row * 100}%)` }}
    >
      <button
        type="button"
        className="royal-piece-hit"
        disabled={!legal}
        data-legal={legal}
        data-stacked={item.count > 1}
        data-settling={settling}
        style={{
          left: 0,
          top: 0,
          transform: `translate(${offset.x * 100}%, ${offset.y * 100}%)`,
          width: `${offset.width * 100}%`,
          height: `${offset.height * 100}%`,
        }}
        onClick={() => onSelect(token.id)}
        aria-label={label}
      >
        <Token color={token.color} visual={visual} skin={skin} className="h-full w-full" />
      </button>
    </div>
  );
}

// Reducer snapshots clone tokens, so object identity alone isn't a useful memo
// key. Compare only presentation fields; stationary counters don't rerender on hops.
export const MemoizedBoardPiece = memo(
  BoardPiece,
  (a, b) =>
    a.item.token.id === b.item.token.id &&
    a.item.token.color === b.item.token.color &&
    a.item.cell.col === b.item.cell.col &&
    a.item.cell.row === b.item.cell.row &&
    a.item.count === b.item.count &&
    a.item.offset.x === b.item.offset.x &&
    a.item.offset.y === b.item.offset.y &&
    a.item.offset.width === b.item.offset.width &&
    a.item.offset.height === b.item.offset.height &&
    a.legal === b.legal &&
    a.moving === b.moving &&
    a.settling === b.settling &&
    a.visual === b.visual &&
    a.label === b.label &&
    a.skin === b.skin &&
    a.onSelect === b.onSelect,
);
