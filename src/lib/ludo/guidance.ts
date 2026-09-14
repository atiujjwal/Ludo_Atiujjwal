import type { Settings } from "./types";

/** Explicit new preferences win over the legacy notification switch. */
export function guidanceEnabled(settings: Settings): boolean {
  return settings.showMoveSuggestions ?? settings.notificationsOn ?? false;
}

export function normalizeGuidance(settings: Settings): Settings {
  const enabled = guidanceEnabled(settings);
  return { ...settings, showMoveSuggestions: enabled, notificationsOn: enabled };
}

export const GAME_GUIDANCE_TOAST_ID = "ludo-game-guidance";

/** Own only game guidance; never dismiss errors, offline warnings or other toasts. */
export function createGuidanceNotices(
  initialMessageId: number,
  sink: { show: (message: string) => void; dismiss: () => void; sound: () => void },
) {
  let lastMessageId = initialMessageId;
  return {
    update(messageId: number, message: string | null, enabled: boolean) {
      const fresh = messageId !== lastMessageId;
      lastMessageId = messageId; // Consume events even while muted.
      if (!enabled) sink.dismiss();
      else if (fresh && message) {
        sink.show(message);
        sink.sound();
      }
    },
    dispose: () => sink.dismiss(),
  };
}
