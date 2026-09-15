import { useSyncExternalStore } from "react";
import {
  applyOfflineUpdate,
  offlineDetailsServerSnapshot,
  offlineDetailsSnapshot,
  registerOfflineSupport,
  subscribeOffline,
} from "@/lib/ludo/register-sw";

export function OfflineStatus() {
  const { status, ready, completed, total, error } = useSyncExternalStore(
    subscribeOffline,
    offlineDetailsSnapshot,
    offlineDetailsServerSnapshot,
  );
  if (status === "idle") return null;
  return (
    <div className="royal-offline-status" role="status" aria-live="polite">
      {status === "preparing" &&
        `${ready ? "Downloading update" : "Preparing offline play"}${total ? ` — ${Math.floor((completed / total) * 100)}%` : "…"}. You can start now.`}
      {status === "ready" && "Ready to play offline"}
      {status === "error" && (
        <>
          {ready
            ? "Your offline game is ready; update preparation failed."
            : (error ?? "Offline preparation interrupted.")}{" "}
          <button onClick={() => void registerOfflineSupport()}>Retry</button>
        </>
      )}
      {(status === "update" || status === "deferred") && (
        <>
          {status === "deferred"
            ? "Finish or leave games in other tabs before updating."
            : "A new version is ready. Refresh outside play to apply it."}
          <button onClick={applyOfflineUpdate}>Refresh to update</button>
        </>
      )}
    </div>
  );
}
