/**
 * Tiny synthesized SFX engine. No audio files are shipped: each event is a short
 * Web Audio blip, keyed by the same event names an mp3 manifest would use, so
 * real samples can replace this later without touching call sites.
 */
export type SfxName =
  | "diceRoll"
  | "diceLand"
  | "tokenRelease"
  | "tokenHop"
  | "tokenCut"
  | "tokenHome"
  | "modalOpen"
  | "modalClose"
  | "turnChange"
  | "skipTurn"
  | "uiTap"
  | "gameWin"
  | "errorBuzz";

interface Note {
  freq: number;
  dur: number;
  type?: OscillatorType;
  delay?: number;
  gain?: number;
}

const RECIPES: Record<SfxName, Note[]> = {
  diceRoll: [
    { freq: 180, dur: 0.05, type: "square", gain: 0.05 },
    { freq: 240, dur: 0.05, type: "square", delay: 0.08, gain: 0.05 },
    { freq: 200, dur: 0.05, type: "square", delay: 0.16, gain: 0.05 },
    { freq: 260, dur: 0.05, type: "square", delay: 0.24, gain: 0.05 },
  ],
  diceLand: [{ freq: 520, dur: 0.12, gain: 0.09 }],
  tokenRelease: [
    { freq: 440, dur: 0.09 },
    { freq: 660, dur: 0.12, delay: 0.08 },
  ],
  tokenHop: [{ freq: 620, dur: 0.05, gain: 0.05 }],
  tokenCut: [
    { freq: 300, dur: 0.1, type: "sawtooth", gain: 0.07 },
    { freq: 150, dur: 0.18, type: "sawtooth", delay: 0.08, gain: 0.07 },
  ],
  tokenHome: [
    { freq: 660, dur: 0.1 },
    { freq: 880, dur: 0.1, delay: 0.09 },
    { freq: 1100, dur: 0.16, delay: 0.18 },
  ],
  modalOpen: [{ freq: 700, dur: 0.09, gain: 0.06 }],
  modalClose: [{ freq: 420, dur: 0.09, gain: 0.06 }],
  turnChange: [{ freq: 520, dur: 0.08, gain: 0.06 }],
  skipTurn: [{ freq: 260, dur: 0.16, type: "triangle", gain: 0.06 }],
  uiTap: [{ freq: 760, dur: 0.04, gain: 0.05 }],
  gameWin: [
    { freq: 523, dur: 0.14 },
    { freq: 659, dur: 0.14, delay: 0.13 },
    { freq: 784, dur: 0.14, delay: 0.26 },
    { freq: 1047, dur: 0.3, delay: 0.39 },
  ],
  errorBuzz: [{ freq: 120, dur: 0.16, type: "sawtooth", gain: 0.06 }],
};

let ctx: AudioContext | null = null;
let enabled = true;
let hapticsEnabled = true;

export function configureAudio(sound: boolean, haptics: boolean): void {
  enabled = sound;
  hapticsEnabled = haptics;
}

/** Must run inside a user gesture (iOS requirement). */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    void ctx.resume();
  } catch {
    ctx = null;
  }
}

function playSynth(name: SfxName): void {
  if (!enabled || typeof window === "undefined") return;
  if (!ctx) unlockAudio();
  if (!ctx || ctx.state === "suspended") return;
  const audio = ctx;
  for (const note of RECIPES[name]) {
    const start = audio.currentTime + (note.delay ?? 0);
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = note.type ?? "sine";
    osc.frequency.setValueAtTime(note.freq, start);
    const peak = note.gain ?? 0.08;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + note.dur + 0.02);
  }
}

/**
 * Optional sample layer. Drop matching files into /public/audio to upgrade the
 * sound design; anything missing silently falls back to the synth above.
 */
const FILES: Record<SfxName, string> = {
  diceRoll: "dice_roll.mp3",
  diceLand: "dice_land.mp3",
  tokenRelease: "token_move.mp3",
  tokenHop: "token_move.mp3",
  tokenCut: "token_capture.mp3",
  tokenHome: "token_win.mp3",
  modalOpen: "rule_reward.mp3",
  modalClose: "ui_click.mp3",
  turnChange: "extra_turn.mp3",
  skipTurn: "invalid_move.mp3",
  uiTap: "token_select.mp3",
  gameWin: "match_win.mp3",
  errorBuzz: "invalid_move.mp3",
};

const VOLUME: Partial<Record<SfxName, number>> = {
  tokenHop: 0.35,
  uiTap: 0.4,
  diceRoll: 0.6,
};

type SampleState = "unknown" | "ready" | "missing";
const samples = new Map<string, { el: HTMLAudioElement; status: SampleState }>();

function sample(name: SfxName): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  const file = FILES[name];
  let entry = samples.get(file);
  if (!entry) {
    const el = new Audio(`/audio/${file}`);
    el.preload = "auto";
    entry = { el, status: "unknown" };
    el.addEventListener("canplaythrough", () => {
      entry!.status = "ready";
    });
    el.addEventListener("error", () => {
      entry!.status = "missing";
    });
    samples.set(file, entry);
  }
  return entry.status === "ready" ? entry.el : null;
}

/** Play a named cue: real sample when available, synthesized blip otherwise. */
export function playSfx(name: SfxName): void {
  if (!enabled || typeof window === "undefined") return;
  const el = sample(name);
  if (el) {
    try {
      const node = el.cloneNode(true) as HTMLAudioElement;
      node.volume = VOLUME[name] ?? 0.8;
      void node.play().catch(() => playSynth(name));
      return;
    } catch {
      /* fall through to synth */
    }
  }
  playSynth(name);
}

/* ---------- Background music: a soft, slow synthesized loop ---------- */
const MUSIC_BAR: Note[] = [
  { freq: 262, dur: 1.6, type: "sine", gain: 0.025 },
  { freq: 330, dur: 1.4, type: "sine", delay: 0.8, gain: 0.02 },
  { freq: 392, dur: 1.4, type: "sine", delay: 1.6, gain: 0.02 },
  { freq: 349, dur: 1.8, type: "sine", delay: 2.4, gain: 0.018 },
];

let musicTimer: number | null = null;

function playMusicBar(): void {
  if (!ctx || ctx.state === "suspended") return;
  const audio = ctx;
  for (const note of MUSIC_BAR) {
    const start = audio.currentTime + (note.delay ?? 0);
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = note.type ?? "sine";
    osc.frequency.setValueAtTime(note.freq, start);
    const peak = note.gain ?? 0.02;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + note.dur + 0.05);
  }
}

/** Start or stop the looping background music. Silent until audio is unlocked. */
export function setMusicEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  if (musicTimer !== null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  if (!on) return;
  unlockAudio();
  playMusicBar();
  musicTimer = window.setInterval(playMusicBar, 4200);
}

export function vibrate(pattern: number | number[]): void {
  if (!hapticsEnabled || typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
