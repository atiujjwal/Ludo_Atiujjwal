import type { Settings } from "./types";

export const PREFERENCES_KEY = "ludo:preferences:v1";
export interface LocalPreferences {
  soundOn: boolean;
  hapticsOn: boolean;
  musicOn: boolean;
  boardTheme: "royal";
  tokenSkin: "royal";
  diceSkin: "royal";
}
export function preferencesOf(settings: Settings): LocalPreferences {
  return {
    soundOn: settings.soundOn,
    hapticsOn: settings.hapticsOn,
    musicOn: Boolean(settings.musicOn),
    boardTheme: "royal",
    tokenSkin: "royal",
    diceSkin: "royal",
  };
}
let storageError: string | null = null;
const listeners = new Set<() => void>();
export const storageSnapshot = () => storageError;
export const storageServerSnapshot = () => null;
export const subscribeStorage = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function reportStorageFailure() {
  if (storageError) return;
  storageError =
    "Progress or preferences could not be saved on this device. Keep the app open and check browser storage.";
  listeners.forEach((listener) => listener());
}
export function loadPreferences(settings: Settings): LocalPreferences {
  const fallback = preferencesOf(settings);
  if (typeof window === "undefined") return fallback;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? "null");
    if (!value || typeof value !== "object") return fallback;
    const stored = value as Partial<LocalPreferences>;
    return {
      ...fallback,
      soundOn: typeof stored.soundOn === "boolean" ? stored.soundOn : fallback.soundOn,
      hapticsOn: typeof stored.hapticsOn === "boolean" ? stored.hapticsOn : fallback.hapticsOn,
      musicOn: typeof stored.musicOn === "boolean" ? stored.musicOn : fallback.musicOn,
    };
  } catch {
    reportStorageFailure();
    return fallback;
  }
}
export function savePreferences(settings: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferencesOf(settings)));
  } catch {
    reportStorageFailure();
  }
}
