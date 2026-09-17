import { useEffect, useId, useRef, useState } from "react";
import { Dices, Info, LogOut, MoveRight } from "lucide-react";
import { controllingColor, getLegalMoves } from "@/lib/ludo/engine";
import { colorStyle } from "@/lib/ludo/board-style";
import { playSfx } from "@/lib/ludo/audio";
import type { Action } from "@/lib/ludo/store";
import type { GameState } from "@/lib/ludo/types";

/** Required choice in document flow, never a board-covering modal. */
export function CutRewardPanel({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: React.Dispatch<Action>;
}) {
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  const [details, setDetails] = useState<string | null>(null);
  const active = state.activeModal === "CUT_REWARD";
  useEffect(() => {
    if (active)
      panel.current
        ?.querySelector<HTMLButtonElement>(".royal-bonus-action:not(:disabled)")
        ?.focus({ preventScroll: true });
    else setDetails(null);
  }, [active]);
  if (!active) return null;

  const options = [
    {
      key: "release",
      label: "Release",
      name: "Bring out a token",
      icon: LogOut,
      action: "CUT_RELEASE" as const,
      sound: "tokenRelease" as const,
      enabled: getLegalMoves(state, 6).some((move) => move.kind === "release"),
      explanation: "Bring a token out of its yard, then take your already-earned extra roll.",
      unavailable: "No yard token has a legal release right now.",
    },
    {
      key: "move",
      label: "Move 6",
      name: "Jump a token 6 spaces",
      icon: MoveRight,
      action: "CUT_MOVE6" as const,
      sound: "modalClose" as const,
      enabled: getLegalMoves(state, 6, true).length > 0,
      explanation:
        "Move a legal token six spaces, choosing one on the board if needed. Your earned extra roll follows; this move is not another dice roll.",
      unavailable: "No token can legally move six spaces right now.",
    },
    {
      key: "roll",
      label: "Roll",
      name: "Roll again",
      icon: Dices,
      action: "CUT_EXTRA_ROLL" as const,
      sound: "modalClose" as const,
      enabled: true,
      explanation:
        "Take your already-earned extra roll now, without releasing or moving a token first. This uses the same extra roll, not a second one.",
      unavailable: "",
    },
  ];
  const selected = options.find((option) => option.key === details);
  return (
    <section
      ref={panel}
      className="royal-bonus-panel"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-earned`}
      style={colorStyle(controllingColor(state))}
    >
      <header className="royal-bonus-heading">
        <h2 id={`${id}-title`}>Nice cut! Pick your bonus</h2>
        <p id={`${id}-earned`}>Extra roll already earned</p>
      </header>
      <div className="royal-bonus-options">
        {options.map((option) => (
          <div
            className="royal-bonus-option"
            key={option.key}
            data-info-open={details === option.key}
          >
            <button
              type="button"
              className="royal-bonus-action"
              aria-label={option.name}
              aria-describedby={`${id}-earned`}
              disabled={!option.enabled}
              onClick={() => {
                playSfx(option.sound);
                dispatch({ type: option.action });
              }}
            >
              <option.icon aria-hidden="true" />
              <span>{option.label}</span>
            </button>
            <button
              type="button"
              className="royal-bonus-info"
              aria-label={`Info: ${option.name}`}
              aria-expanded={details === option.key}
              aria-controls={`${id}-details`}
              onClick={() => setDetails(details === option.key ? null : option.key)}
            >
              <Info aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <div id={`${id}-details`} className="royal-bonus-details" hidden={!selected}>
        {selected && (
          <>
            <strong>{selected.name}</strong>
            <p>{selected.explanation}</p>
            {!selected.enabled && <p className="royal-bonus-unavailable">{selected.unavailable}</p>}
          </>
        )}
      </div>
    </section>
  );
}
