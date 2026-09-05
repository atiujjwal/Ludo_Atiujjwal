import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ChevronLeft, Info, Dices, Repeat, Swords, Sparkles } from "lucide-react";

import { Token } from "@/components/ludo/Token";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COLOR_LABEL, COLOR_ORDER, OPPOSITE_COLOR } from "@/lib/ludo/board";
import { MODE_COLORS, DEFAULT_HOUSE_RULES, TEAMS, sanitizeNickname } from "@/lib/ludo/engine";
import { PALETTE } from "@/lib/ludo/palette";
import { useGame } from "@/lib/ludo/store";
import { playSfx, unlockAudio } from "@/lib/ludo/audio";
import type { Color, HouseRules, Mode } from "@/lib/ludo/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "New Game Setup — Ludo Offline" },
      {
        name: "description",
        content:
          "Choose 2, 3, 4 player or 2v2 teams, claim your colour, switch on house rules like Exit on 1 and Cut Reward, and name each player.",
      },
      { property: "og:title", content: "New Game Setup — Ludo Offline" },
      {
        property: "og:description",
        content: "Pick a mode, claim colours, toggle house rules, and start a game of Ludo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SetupScreen,
});

const MODES: { id: Mode; label: string; detail: string; seats: number }[] = [
  { id: "2P", label: "2 Players", detail: "Head to head", seats: 2 },
  { id: "3P", label: "3 Players", detail: "Three-way race", seats: 3 },
  { id: "4P", label: "4 Players", detail: "The full board", seats: 4 },
  { id: "2V2", label: "2 vs 2", detail: "Teams of two", seats: 4 },
];

const RULE_ICON = { exitOnOne: Dices, secondLap: Repeat, cutReward: Swords, threeSixesVariant: Sparkles };

export const HOUSE_RULE_COPY: {
  key: keyof HouseRules;
  title: string;
  short: string;
  text: string;
}[] = [
  {
    key: "exitOnOne",
    title: "Exit on 1",
    short: "A 1 also brings a piece out.",
    text: "Normally only a 6 releases a piece from its yard. With this on, a roll of 1 works too, so games start faster.",
  },
  {
    key: "secondLap",
    title: "Second Lap",
    short: "Choose to loop the board once more.",
    text: "When a piece reaches the square before its home lane, you can send it round the board again instead of going in — one more chance to cut somebody.",
  },
  {
    key: "cutReward",
    title: "Cut Reward",
    short: "Cutting earns you a bonus.",
    text: "Cut an opponent and pick a reward: bring out a new piece, jump a piece 6 spaces, or roll again.",
  },
  {
    key: "threeSixesVariant",
    title: "Three 6s Variant",
    short: "The third six still counts as a move.",
    text: "Roll three 6s in a row and the third plays as a normal move instead of losing your turn — unless it cuts someone or gets a piece home, in which case you roll again.",
  },
];

function ModeDiagram({ mode }: { mode: Mode }) {
  const colors = MODE_COLORS[mode];
  return (
    <div className="grid h-10 w-10 shrink-0 grid-cols-2 grid-rows-2 gap-1 rounded-xl bg-[var(--board)] p-1 shadow-inner">
      {COLOR_ORDER.map((c) => (
        <span
          key={c}
          className={cn("rounded-md", !colors.includes(c) && "opacity-15")}
          style={{
            background:
              mode === "2V2"
                ? `linear-gradient(135deg, ${PALETTE[c].light}, ${PALETTE[c].base})`
                : PALETTE[c].base,
            outline: mode === "2V2" && TEAMS[c] === "A" ? "1.5px solid white" : undefined,
          }}
        />
      ))}
    </div>
  );
}

function SetupScreen() {
  const navigate = useNavigate();
  const { dispatch } = useGame();
  const [mode, setMode] = useState<Mode | null>(null);
  const [rules, setRules] = useState<HouseRules>({ ...DEFAULT_HOUSE_RULES });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [names, setNames] = useState<Partial<Record<Color, string>>>({});
  const [claimed, setClaimed] = useState<Color[]>([]);

  const seats = mode ? MODE_COLORS[mode].length : 0;
  const fixedColors = mode === "4P" || mode === "2V2";
  const roster: Color[] = fixedColors && mode ? MODE_COLORS[mode] : claimed;
  const ready = Boolean(mode) && roster.length === seats;

  const chooseMode = (m: Mode) => {
    playSfx("uiTap");
    setMode(m);
    setClaimed([]);
  };

  const toggleColor = (color: Color) => {
    playSfx("uiTap");
    // Two players always sit across the board from each other.
    if (mode === "2P") {
      setClaimed((c) => (c[0] === color ? [] : [color, OPPOSITE_COLOR[color]]));
      return;
    }
    setClaimed((c) =>
      c.includes(color) ? c.filter((x) => x !== color) : c.length < seats ? [...c, color] : c,
    );
  };


  return (
    <main className="mx-auto w-full max-w-md px-5 pb-28 pt-6">
      <div className="mb-6 flex items-center gap-2">
        <Link
          to="/"
          aria-label="Back to menu"
          className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-[var(--elev-1)]"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-3xl">New game</h1>
      </div>

      <section aria-labelledby="mode-heading">
        <h2 id="mode-heading" className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
          Who's playing
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {MODES.map((m) => {
            const on = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => chooseMode(m.id)}
                aria-pressed={on}
                className={cn(
                  "flex min-h-[5rem] items-center gap-2.5 rounded-2xl bg-white p-3 text-left transition-all duration-200",
                  on ? "-translate-y-0.5 scale-[1.02]" : "active:translate-y-0.5",
                )}
                style={{
                  boxShadow: on
                    ? "0 0 0 0.18rem var(--accent), var(--elev-2)"
                    : "0 0 0 1px rgba(60,40,15,0.1), var(--elev-1)",
                }}
              >
                <ModeDiagram mode={m.id} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{m.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.detail}</span>
                </span>
                {on && (
                  <Check className="ml-auto h-5 w-5 shrink-0 animate-[ludo-pop_0.25s_ease-out] text-[var(--ludo-green)]" />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {mode && !fixedColors && (
        <section aria-labelledby="claim-heading" className="mt-8">
          <h2 id="claim-heading" className="mb-1 text-xs font-black uppercase tracking-widest text-muted-foreground">
            Claim your colour
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {mode === "2P"
              ? "Tap your colour — your opponent takes the seat opposite."
              : `Tap ${seats} colours — one per player, first pick goes first.`}
          </p>
          <div className="flex justify-between gap-3">
            {COLOR_ORDER.map((color) => {
              const index = claimed.indexOf(color);
              const taken = index >= 0;
              const full = mode !== "2P" && claimed.length >= seats && !taken;

              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => toggleColor(color)}
                  disabled={full}
                  aria-pressed={taken}
                  aria-label={`${COLOR_LABEL[color]}${taken ? ` — claimed as player ${index + 1}` : full ? " — unavailable" : ""}`}
                  className={cn(
                    "relative grid flex-1 place-items-center rounded-2xl bg-white p-2.5 transition-all duration-200",
                    taken && "-translate-y-1",
                    full && "opacity-35",
                  )}
                  style={{
                    boxShadow: taken
                      ? `0 0 0 0.16rem ${PALETTE[color].base}, var(--elev-2)`
                      : "0 0 0 1px rgba(60,40,15,0.1)",
                  }}
                >
                  <Token color={color} visual={taken ? "idle" : "ghost"} className="w-full" />
                  {taken && (
                    <span
                      className="absolute -right-1 -top-1 grid h-6 w-6 animate-[ludo-pop_0.25s_ease-out] place-items-center rounded-full text-xs font-black text-white"
                      style={{ background: PALETTE[color].dark }}
                    >
                      {index + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="hr-heading" className="mt-8">
        <h2 id="hr-heading" className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
          House rules
        </h2>
        <div className="space-y-3">
          {HOUSE_RULE_COPY.map((rule) => {
            const on = rules[rule.key];
            const Icon = RULE_ICON[rule.key];
            return (
              <div
                key={rule.key}
                className="rounded-2xl p-3.5 transition-all duration-200"
                style={{
                  background: on ? "var(--ludo-green-soft)" : "white",
                  boxShadow: on
                    ? "0 0 0 0.14rem var(--ludo-green), var(--elev-1)"
                    : "0 0 0 1px rgba(60,40,15,0.1)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{
                      background: on ? "var(--ludo-green)" : "var(--secondary)",
                      color: on ? "white" : "var(--muted-foreground)",
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-black">{rule.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{rule.short}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`What is ${rule.title}?`}
                    onClick={() => setOpen((o) => ({ ...o, [rule.key]: o[rule.key] !== true }))}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-black/5"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={rule.title}
                    onClick={() => {
                      playSfx(on ? "modalClose" : "turnChange");
                      setRules((r) => ({ ...r, [rule.key]: !on }));
                    }}
                    className="relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200"
                    style={{ background: on ? "var(--ludo-green)" : "rgba(60,40,15,0.18)" }}
                  >
                    <span
                      className="absolute top-1 grid h-6 w-6 place-items-center rounded-full bg-white shadow transition-all duration-200"
                      style={{ left: on ? "1.75rem" : "0.25rem" }}
                    >
                      {on && <Check className="h-3.5 w-3.5 text-[var(--ludo-green)]" />}
                    </span>
                  </button>
                </div>
                {open[rule.key] && (
                  <p className="mt-2.5 text-sm text-muted-foreground">{rule.text}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {mode && roster.length > 0 && (
        <section aria-labelledby="names-heading" className="mt-8">
          <h2 id="names-heading" className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
            Names
          </h2>
          <div className="space-y-3">
            {roster.map((color, i) => (
              <label key={color} className="flex items-center gap-3">
                <Token color={color} className="h-10 w-10 shrink-0" />
                <Input
                  maxLength={12}
                  className="h-12 rounded-xl bg-white"
                  placeholder={`Player ${i + 1} (${COLOR_LABEL[color]})${
                    mode === "2V2" ? ` · Team ${TEAMS[color]}` : ""
                  }`}
                  value={names[color] ?? ""}
                  onChange={(e) =>
                    setNames((n) => ({ ...n, [color]: sanitizeNickname(e.target.value) }))
                  }
                />
              </label>
            ))}
          </div>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-background via-background to-transparent px-5 pb-5 pt-6">
        <Button
          className="h-16 w-full rounded-2xl text-xl font-black"
          disabled={!ready}
          onClick={() => {
            if (!mode || !ready) return;
            unlockAudio();
            playSfx("turnChange");
            dispatch({ type: "START", mode, houseRules: rules, nicknames: names, colors: roster });
            void navigate({ to: "/game" });
          }}
        >
          {ready ? "Start game" : mode ? `Pick ${seats - roster.length} more colour(s)` : "Choose a mode"}
        </Button>
      </div>
    </main>
  );
}
