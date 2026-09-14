import { Token, type TokenVisualState } from "./Token";
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
