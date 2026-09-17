import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("unlocks ordinary game audio without requesting crying audio", async () => {
  const fixture = await mobileAudio();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  fixture.configureAudio(true, true);
  fixture.unlockAudio();
  expect(fixture.audio.resume).toHaveBeenCalledOnce();
  await fixture.settle();
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

async function mobileAudio(initialState = "suspended") {
  vi.resetModules();
  let settle: (() => void) | undefined;
  const parameter = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  const oscillators: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const compressor = {
    threshold: { setValueAtTime: vi.fn() },
    knee: { setValueAtTime: vi.fn() },
    ratio: { setValueAtTime: vi.fn() },
    attack: { setValueAtTime: vi.fn() },
    release: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
  };
  const audio = {
    state: initialState,
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    resume: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = () => {
            audio.state = "running";
            resolve();
          };
        }),
    ),
    suspend: vi.fn(async () => {
      audio.state = "suspended";
    }),
    createBuffer: vi.fn(() => ({})),
    createBufferSource: vi.fn(() => ({ connect: vi.fn(), start: vi.fn(), disconnect: vi.fn() })),
    createDynamicsCompressor: vi.fn(() => compressor),
    createGain: vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn((node) => node),
      disconnect: vi.fn(),
    })),
    createOscillator: vi.fn(() => {
      const node = {
        frequency: parameter,
        connect: vi.fn((node) => node),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };
      oscillators.push(node);
      return node;
    }),
  };
  const listeners = new Map<string, EventListener>();
  const document = {
    hidden: false,
    addEventListener: vi.fn((event: string, listener: EventListener) =>
      listeners.set(event, listener),
    ),
    removeEventListener: vi.fn((event: string) => listeners.delete(event)),
  };
  const constructor = vi.fn(function () {
    return audio;
  });
  vi.stubGlobal("window", { AudioContext: constructor, setInterval, clearInterval });
  vi.stubGlobal("document", document);
  vi.stubGlobal("KeyboardEvent", class {});
  vi.stubGlobal("navigator", { audioSession: { type: "auto" } });
  const api = await import("./audio");
  return {
    ...api,
    audio,
    compressor,
    document,
    listeners,
    oscillators,
    constructor,
    settle: async () => {
      settle?.();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

it("plays the first mobile cue once resume resolves, including output priming", async () => {
  const fixture = await mobileAudio();
  fixture.playSfx("diceLand");
  expect(fixture.oscillators).toHaveLength(0);
  expect(fixture.audio.createBufferSource).toHaveBeenCalledOnce();
  await fixture.settle();
  expect(fixture.oscillators).toHaveLength(1);
  expect(fixture.oscillators[0]!.start).toHaveBeenCalledOnce();
  expect((navigator as unknown as { audioSession: { type: string } }).audioSession.type).toBe(
    "playback",
  );
});

it("waits for output resume even when the context already reports running", async () => {
  const fixture = await mobileAudio();
  fixture.unlockAudio();
  fixture.audio.state = "running";
  fixture.playSfx("uiTap");
  expect(fixture.oscillators).toHaveLength(0);
  await fixture.settle();
  expect(fixture.oscillators).toHaveLength(1);
  expect(fixture.oscillators[0]!.start).toHaveBeenCalledOnce();
});

it("boosts every synth cue and requested music through one controlled output bus", async () => {
  const fixture = await mobileAudio("running");
  const dispose = fixture.installAudioGestureHandlers();
  for (const name of [
    "diceRoll",
    "diceLand",
    "tokenRelease",
    "tokenHop",
    "tokenCut",
    "tokenHome",
    "modalOpen",
    "modalClose",
    "turnChange",
    "skipTurn",
    "uiTap",
    "gameWin",
    "errorBuzz",
  ] as const)
    fixture.playSfx(name);
  fixture.setMusicEnabled(true);
  const gains = fixture.audio.createGain.mock.results.map((result) => result.value);
  const master = gains[0]!;
  expect(master.gain.setValueAtTime).toHaveBeenCalledWith(4, 0);
  expect(master.connect).toHaveBeenCalledWith(fixture.compressor);
  expect(fixture.compressor.connect).toHaveBeenCalledWith(fixture.audio.destination);
  expect(fixture.compressor.threshold.setValueAtTime).toHaveBeenCalledWith(-3, 0);
  expect(fixture.compressor.ratio.setValueAtTime).toHaveBeenCalledWith(12, 0);
  for (const gain of gains.slice(1)) expect(gain.connect).toHaveBeenCalledWith(master);
  expect(fixture.audio.createDynamicsCompressor).toHaveBeenCalledOnce();
  fixture.configureAudio(false, true);
  for (const osc of fixture.oscillators) expect(osc.stop).toHaveBeenCalled();
  dispose();
});

it("plays available samples at full app volume while still honoring mute", async () => {
  vi.stubGlobal("__LUDO_AUDIO_FILES__", ["token_move.mp3", "ui_click.mp3", "dice_roll.mp3"]);
  const nodes: { volume: number; play: ReturnType<typeof vi.fn>; ready: () => void }[] = [];
  vi.stubGlobal(
    "Audio",
    class {
      volume = 0;
      paused = true;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      ready = () => {};
      constructor() {
        nodes.push(this);
      }
      addEventListener(name: string, callback: () => void) {
        if (name === "canplaythrough") this.ready = callback;
      }
    },
  );
  const fixture = await mobileAudio("running");
  for (const name of ["tokenHop", "modalClose", "diceRoll"] as const) {
    fixture.playSfx(name);
    const node = nodes.at(-1)!;
    node.ready();
    fixture.playSfx(name);
    expect(node.volume).toBe(1);
    expect(node.play).toHaveBeenCalledOnce();
  }
  fixture.configureAudio(false, true);
  fixture.playSfx("tokenHop");
  expect(nodes[0]!.play).toHaveBeenCalledOnce();
});

it.each(["suspended", "interrupted"])(
  "recovers a %s context on the next trusted touch without recreating it",
  async (state) => {
    const fixture = await mobileAudio("running");
    const dispose = fixture.installAudioGestureHandlers();
    fixture.playSfx("diceLand");
    fixture.audio.state = state;
    fixture.listeners.get("touchend")!({ isTrusted: true } as Event);
    await fixture.settle();
    fixture.playSfx("tokenHop");
    expect(fixture.audio.resume).toHaveBeenCalledOnce();
    expect(fixture.constructor).toHaveBeenCalledOnce();
    expect(fixture.oscillators).toHaveLength(2);
    dispose();
    expect(fixture.listeners.size).toBe(0);
  },
);

it.each(["mute", "hidden", "stale"])("does not replay a pending cue after %s", async (reason) => {
  vi.useFakeTimers();
  const fixture = await mobileAudio();
  fixture.playSfx("tokenCut");
  if (reason === "mute") fixture.configureAudio(false, true);
  if (reason === "hidden") {
    fixture.document.hidden = true;
    fixture.listeners.get("visibilitychange")!(new Event("visibilitychange"));
    fixture.document.hidden = false;
  }
  if (reason === "stale") vi.advanceTimersByTime(251);
  await fixture.settle();
  expect(fixture.oscillators).toHaveLength(0);
  vi.useRealTimers();
});

it("does not unlock from synthetic events or while muted, and releases resources on unmount", async () => {
  const fixture = await mobileAudio("running");
  const dispose = fixture.installAudioGestureHandlers();
  fixture.listeners.get("click")!(new Event("click"));
  expect(fixture.constructor).not.toHaveBeenCalled();
  fixture.configureAudio(false, true);
  fixture.listeners.get("pointerdown")!({ isTrusted: true } as Event);
  expect(fixture.constructor).not.toHaveBeenCalled();
  fixture.configureAudio(true, true);
  fixture.playSfx("tokenHop");
  dispose();
  expect(fixture.oscillators[0]!.stop).toHaveBeenCalled();
  expect(fixture.audio.suspend).toHaveBeenCalledOnce();
  expect(fixture.listeners.size).toBe(0);
});
