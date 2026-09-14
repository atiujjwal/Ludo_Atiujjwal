import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, BookOpen, Settings2, RotateCcw } from "lucide-react";

import { InstallButton } from "@/components/ludo/InstallPrompt";
import { OfflineStatus } from "@/components/ludo/OfflineStatus";
import { RoyalMotif } from "@/components/ludo/BoardArtwork";
import { hasSave } from "@/lib/ludo/persistence";
import { unlockAudio, playSfx } from "@/lib/ludo/audio";

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
        style={{
          background:
            "radial-gradient(circle at 35% 30%, var(--ludo-yellow-light), var(--ludo-yellow-dark))",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-12 bottom-24 h-40 w-40 rounded-full opacity-15"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, var(--ludo-blue-light), var(--ludo-blue-dark))",
        }}
      />

      <header className="relative text-center">
        <p className="royal-eyebrow mb-5">A royal Indian pastime</p>
        <img
          src="/logo.png"
          alt="atiUjjwal Ludo Game"
          className="mx-auto mb-6 h-28 w-28 rounded-[1.6rem] shadow-[var(--elev-3)]"
        />
        <h1 className="royal-menu-title font-display text-6xl tracking-tight">Ludo</h1>
        <div className="mx-auto mt-2 h-10 w-10 text-primary" aria-hidden>
          <RoyalMotif />
        </div>
        <div className="royal-divider" aria-hidden />
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
            className="relative flex h-20 w-full items-center justify-center gap-3 overflow-hidden rounded-3xl text-2xl font-black text-[var(--on-color)] transition-transform active:translate-y-1"
            style={{
              background: "var(--play-surface)",
              boxShadow: "0 8px 0 0 var(--ludo-red-dark), 0 20px 34px -16px var(--ludo-red-dark)",
            }}
          >
            <Play className="h-7 w-7 fill-current" />
            Play
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-14 -skew-x-12 bg-card/25 hidden"
            />
          </span>
        </Link>

        {resumable && (
          <Link to="/game" onClick={() => unlockAudio()} className="block">
            <span className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[var(--ludo-green)] bg-card text-base font-bold text-[var(--ludo-green-light)] shadow-[var(--elev-1)] transition-transform active:translate-y-0.5">
              <RotateCcw className="h-5 w-5" />
              Continue your game
            </span>
          </Link>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link to="/rules" className="block">
            <span className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card text-sm font-bold shadow-[var(--elev-1)] transition-transform active:translate-y-0.5">
              <BookOpen className="h-5 w-5" />
              How to play
            </span>
          </Link>
          <Link to="/settings" className="block">
            <span className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card text-sm font-bold shadow-[var(--elev-1)] transition-transform active:translate-y-0.5">
              <Settings2 className="h-5 w-5" />
              Settings
            </span>
          </Link>
        </div>

        <InstallButton />
        <OfflineStatus />
      </nav>
    </main>
  );
}
