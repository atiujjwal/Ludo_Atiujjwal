import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());
it("unlocks ordinary game audio without requesting crying audio", async () => {
  vi.resetModules();
  const resume = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("window", {
    AudioContext: class {
      resume = resume;
    },
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { unlockAudio, configureAudio } = await import("./audio");
  configureAudio(true, true);
  unlockAudio();
  expect(resume).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});
it("never constructs audio elements for absent sample files", async () => {
  vi.resetModules();
  const Audio = vi.fn();
  vi.stubGlobal("Audio", Audio);
  vi.stubGlobal("window", {});
  const { playSfx } = await import("./audio");
  for (const name of ["diceRoll", "tokenCut", "tokenHop", "gameWin"] as const) playSfx(name);
  expect(Audio).not.toHaveBeenCalled();
});
