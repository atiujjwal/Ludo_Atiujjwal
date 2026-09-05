import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, BookOpen, Settings2, RotateCcw } from "lucide-react";

import { Token } from "@/components/ludo/Token";
import { hasSave } from "@/lib/ludo/persistence";
import { unlockAudio, playSfx } from "@/lib/ludo/audio";
import { COLOR_ORDER } from "@/lib/ludo/board";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ludo Offline — Pass-and-Play Board Game" },
      {
        name: "description",
        content:
          "A colourful offline Ludo game for 2–4 players on one device. Blockades, house rules, saved games, no accounts, no internet needed.",
      },
      { property: "og:title", content: "Ludo Offline — Pass-and-Play Board Game" },
      {
        property: "og:description",
        content:
          "Play Ludo with friends on one phone. Real blockade rules, four house rules, 2v2 teams, works completely offline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomeMenu,
});

function HomeMenu() {
  const [resumable, setResumable] = useState(false);

  useEffect(() => {
    setResumable(hasSave());
  }, []);

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-10 overflow-hidden px-6 py-12">
      {/* Decorative board motif */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(var(--ink) 1px, transparent 1px), linear-gradient(90deg, var(--ink) 1px, transparent 1px)",
          backgroundSize: "2.5rem 2.5rem",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 top-16 h-32 w-32 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle at 35% 30%, var(--ludo-yellow-light), var(--ludo-yellow-dark))" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-12 bottom-24 h-40 w-40 rounded-full opacity-15"
        style={{ background: "radial-gradient(circle at 35% 30%, var(--ludo-blue-light), var(--ludo-blue-dark))" }}
      />

      <header className="relative text-center">
        <div className="mx-auto mb-6 grid h-28 w-28 animate-[ludo-float-logo_5s_ease-in-out_infinite] grid-cols-2 grid-rows-2 gap-2 rounded-[1.6rem] bg-white p-3 shadow-[var(--elev-3)]">
          {COLOR_ORDER.map((c) => (
            <Token key={c} color={c} className="h-full w-full" glyph={false} />
          ))}
        </div>
        <h1
          className="font-display text-6xl tracking-tight"
          style={{
            color: "var(--ink)",
            textShadow: "0 3px 0 rgba(255,255,255,0.9), 0 6px 14px rgba(60,40,15,0.25)",
          }}
        >
          Ludo
        </h1>
        <p className="mt-2 font-semibold text-muted-foreground">
          Pass-and-play on one device. No accounts, works offline.
        </p>
      </header>

      <nav className="relative space-y-3">
        <Link
          to="/setup"
          onClick={() => {
            unlockAudio();
            playSfx("uiTap");
          }}
          className="block"
        >
          <span
            className="relative flex h-20 w-full items-center justify-center gap-3 overflow-hidden rounded-3xl text-2xl font-black text-white transition-transform active:translate-y-1"
            style={{
              background: "linear-gradient(160deg, var(--ludo-red-light), var(--ludo-red) 55%, var(--ludo-red-dark))",
              boxShadow: "0 8px 0 0 var(--ludo-red-dark), 0 20px 34px -16px var(--ludo-red-dark)",
            }}
          >
            <Play className="h-7 w-7 fill-current" />
            Play
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-14 -skew-x-12 bg-white/25 animate-[ludo-sheen_3.6s_ease-in-out_infinite]"
            />
          </span>
        </Link>

        {resumable && (
          <Link to="/game" onClick={() => unlockAudio()} className="block">
            <span className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[var(--ludo-green)] bg-white text-base font-bold text-[var(--ludo-green-dark)] shadow-[var(--elev-1)] transition-transform active:translate-y-0.5">
              <RotateCcw className="h-5 w-5" />
              Continue your game
            </span>
          </Link>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link to="/rules" className="block">
            <span className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-black/10 bg-white text-sm font-bold shadow-[var(--elev-1)] transition-transform active:translate-y-0.5">
              <BookOpen className="h-5 w-5" />
              How to play
            </span>
          </Link>
          <Link to="/settings" className="block">
            <span className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-black/10 bg-white text-sm font-bold shadow-[var(--elev-1)] transition-transform active:translate-y-0.5">
              <Settings2 className="h-5 w-5" />
              Settings
            </span>
          </Link>
        </div>
      </nav>
    </main>
  );
}
