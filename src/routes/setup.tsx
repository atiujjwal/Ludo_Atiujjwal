import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ChevronLeft, Info, Dices, Repeat, Swords, Sparkles } from "lucide-react";

import { Token } from "@/components/ludo/Token";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COLOR_LABEL, COLOR_ORDER } from "@/lib/ludo/board";
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

const RULE_ICON = {
  exitOnOne: Dices,
  secondLap: Repeat,
  cutReward: Swords,
  threeSixesVariant: Sparkles,
};

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
    short: "Optional bonus before your capture roll.",
    text: "Every opponent cut already earns another roll. With this on, first bring out a new piece or move a piece 6 spaces, or choose Roll again to take your earned roll immediately. These choices do not double the earned roll.",
  },
  {
    key: "threeSixesVariant",
    title: "Three 6s Variant",
    short: "The third six still counts as a move.",
    text: "Normally the third consecutive 6 skips your turn before moving. With this on, play the third 6, then end your turn unless the move cuts an opponent or reaches home. Either exception earns another roll and starts a fresh six streak.",
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
            outline: mode === "2V2" && TEAMS[c] === "A" ? "1.5px solid var(--on-color)" : undefined,
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
  const [showMoveSuggestions, setShowMoveSuggestions] = useState(false);

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
    setClaimed((c) =>
      c.includes(color) ? c.filter((x) => x !== color) : c.length < seats ? [...c, color] : c,
    );
  };

  return (
    <main className="royal-setup-screen mx-auto w-full max-w-md px-5 pt-6">
      <div className="mb-6 flex items-center gap-2">
        <Link
          to="/"
          aria-label="Back to menu"
          className="grid h-11 w-11 place-items-center rounded-full bg-card shadow-[var(--elev-1)]"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-3xl">New game</h1>
      </div>

      <section aria-labelledby="mode-heading">
        <h2
          id="mode-heading"
          className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground"
        >
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
                  "flex min-h-[5rem] items-center gap-2.5 rounded-2xl bg-card p-3 text-left transition-all duration-200",
                  on ? "-translate-y-0.5 scale-[1.02]" : "active:translate-y-0.5",
                )}
                style={{
                  boxShadow: on
                    ? "0 0 0 0.18rem var(--accent), var(--elev-2)"
                    : "var(--quiet-outline), var(--elev-1)",
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
          <h2
            id="claim-heading"
            className="mb-1 text-xs font-black uppercase tracking-widest text-muted-foreground"
          >
            Claim your colour
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Tap {seats} colours — one per player, first pick goes first.
          </p>
          <div className="flex justify-between gap-3">
            {COLOR_ORDER.map((color) => {
              const index = claimed.indexOf(color);
              const taken = index >= 0;
              const full = claimed.length >= seats && !taken;

              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => toggleColor(color)}
                  disabled={full}
                  aria-pressed={taken}
                  aria-label={`${COLOR_LABEL[color]}${taken ? ` — claimed as player ${index + 1}` : full ? " — unavailable" : ""}`}
                  className={cn(
                    "relative grid flex-1 place-items-center rounded-2xl bg-card p-2.5 transition-all duration-200",
                    taken && "-translate-y-1",
                    full && "opacity-35",
                  )}
                  style={{
                    boxShadow: taken
                      ? `0 0 0 0.16rem ${PALETTE[color].base}, var(--elev-2)`
                      : "var(--quiet-outline)",
                  }}
                >
                  <Token color={color} visual={taken ? "idle" : "ghost"} className="w-full" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="display-heading" className="mt-8">
        <h2
          id="display-heading"
          className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground"
        >
          Display options
        </h2>
        <button
          type="button"
          role="switch"
          aria-checked={showMoveSuggestions}
          aria-labelledby="suggestions-label"
          aria-describedby="suggestions-description"
          onClick={() => setShowMoveSuggestions((on) => !on)}
          className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5 text-left"
        >
          <span className="min-w-0">
            <span id="suggestions-label" className="block font-bold">
              Move suggestions
            </span>
            <span id="suggestions-description" className="block text-xs text-muted-foreground">
              Show turn tips and legal moves. Off by default.
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-sm font-bold",
              showMoveSuggestions
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground",
            )}
            aria-hidden
          >
            {showMoveSuggestions ? "On" : "Off"}
          </span>
        </button>
      </section>

      <section aria-labelledby="hr-heading" className="mt-8">
        <h2
          id="hr-heading"
          className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground"
        >
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
                  background: on ? "var(--ludo-green-soft)" : "var(--card)",
                  boxShadow: on
                    ? "0 0 0 0.14rem var(--ludo-green), var(--elev-1)"
                    : "var(--quiet-outline)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl min-[380px]:grid"
                    style={{
                      background: on ? "var(--ludo-green)" : "var(--secondary)",
                      color: on ? "var(--on-color)" : "var(--muted-foreground)",
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-black">{rule.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {rule.short}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`What is ${rule.title}?`}
                    onClick={() => setOpen((o) => ({ ...o, [rule.key]: o[rule.key] !== true }))}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent"
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
                    className="relative h-11 w-14 shrink-0 rounded-full border border-border transition-colors duration-200"
                    style={{ background: on ? "var(--ludo-green)" : "var(--secondary)" }}
                  >
                    <span
                      className="absolute top-2 grid h-6 w-6 place-items-center rounded-full bg-[var(--switch-thumb)] shadow transition-transform duration-200"
                      style={{ left: on ? "1.75rem" : "0.25rem" }}
                    >
                      {on && <Check className="h-3.5 w-3.5 text-[var(--switch-thumb-ink)]" />}
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
          <h2
            id="names-heading"
            className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground"
          >
            Names
          </h2>
          <div className="space-y-3">
            {roster.map((color, i) => (
              <label key={color} className="flex items-center gap-3">
                <span className="sr-only">
                  Player {i + 1} ({COLOR_LABEL[color]}) name
                </span>
                <Token color={color} className="h-10 w-10 shrink-0" />
                <Input
                  maxLength={12}
                  className="h-12 min-w-0 rounded-xl bg-card text-base md:text-base"
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

      <div className="royal-setup-actions bg-gradient-to-t from-background via-background to-transparent">
        <Button
          className="h-16 w-full rounded-2xl text-xl font-black"
          disabled={!ready}
          onClick={() => {
            if (!mode || !ready) return;
            unlockAudio();
            playSfx("turnChange");
            dispatch({
              type: "START",
              mode,
              houseRules: rules,
              nicknames: names,
              colors: roster,
              showMoveSuggestions,
            });
            void navigate({ to: "/game" });
          }}
        >
          {ready
            ? "Start game"
            : mode
              ? `Pick ${seats - roster.length} more colour(s)`
              : "Choose a mode"}
        </Button>
      </div>
    </main>
  );
}
