import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useGame } from "@/lib/ludo/store";
import { clearSave } from "@/lib/ludo/persistence";
import { guidanceEnabled } from "@/lib/ludo/guidance";
import { playSfx } from "@/lib/ludo/audio";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAppTheme } from "@/lib/app-theme-context";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Ludo Offline" },
      {
        name: "description",
        content: "Turn game sounds and vibration on or off, and clear your saved Ludo game.",
      },
      { property: "og:title", content: "Settings — Ludo Offline" },
      { property: "og:description", content: "Sound, vibration and saved-game options." },
    ],
  }),
  component: SettingsScreen,
});

function SettingsScreen() {
  const { theme } = useAppTheme();
  const { state, dispatch } = useGame();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl">Settings</h1>
        <Link to="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Back
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex min-h-[3.5rem] items-center justify-between rounded-2xl bg-card px-4 shadow-sm">
          <span className="font-semibold">
            Appearance{" "}
            <span className="text-sm text-muted-foreground">
              — {theme === "light" ? "Light" : "Dark"}
            </span>
          </span>
          <ThemeToggle />
        </div>
        <label className="flex min-h-[3.5rem] items-center justify-between rounded-2xl bg-card px-4 shadow-sm">
          <span className="font-semibold">Sound effects</span>
          <Switch
            checked={mounted ? state.settings.soundOn : true}
            onCheckedChange={() => {
              dispatch({ type: "TOGGLE_SETTING", key: "soundOn" });
              playSfx("uiTap");
            }}
          />
        </label>
        <label className="flex min-h-[3.5rem] items-center justify-between rounded-2xl bg-card px-4 shadow-sm">
          <span className="font-semibold">Vibration</span>
          <Switch
            checked={mounted ? state.settings.hapticsOn : true}
            onCheckedChange={() => dispatch({ type: "TOGGLE_SETTING", key: "hapticsOn" })}
          />
        </label>
        <label className="flex min-h-[3.5rem] items-center justify-between rounded-2xl bg-card px-4 shadow-sm">
          <span className="font-semibold">Background music</span>
          <Switch
            checked={mounted ? Boolean(state.settings.musicOn) : false}
            onCheckedChange={() => {
              dispatch({ type: "TOGGLE_SETTING", key: "musicOn" });
              playSfx("uiTap");
            }}
          />
        </label>
        <label className="flex min-h-[3.5rem] items-center justify-between rounded-2xl bg-card px-4 shadow-sm">
          <span className="font-semibold">Move suggestions</span>
          <Switch
            checked={mounted ? guidanceEnabled(state.settings) : false}
            onCheckedChange={() => dispatch({ type: "TOGGLE_SETTING", key: "showMoveSuggestions" })}
          />
        </label>
      </div>

      <Button
        variant="destructive"
        className="mt-8 h-12 w-full rounded-2xl"
        onClick={() => {
          clearSave();
          toast("Saved game cleared.");
          void navigate({ to: "/" });
        }}
      >
        Reset saved game
      </Button>
    </main>
  );
}
