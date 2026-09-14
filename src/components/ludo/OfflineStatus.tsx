import { useSyncExternalStore } from "react";
import {
  applyOfflineUpdate,
  offlineServerSnapshot,
  offlineSnapshot,
  registerOfflineSupport,
  subscribeOffline,
} from "@/lib/ludo/register-sw";

export function OfflineStatus() {
  const status = useSyncExternalStore(subscribeOffline, offlineSnapshot, offlineServerSnapshot);
  if (status === "idle") return null;
  return (
    <div className="royal-offline-status" role="status" aria-live="polite">
      {status === "preparing" && "Preparing offline play… You can start now."}
      {status === "ready" && "Ready to play offline"}
      {status === "error" && (
        <>
          Offline preparation interrupted.{" "}
          <button onClick={() => void registerOfflineSupport()}>Retry</button>
        </>
      )}
      {(status === "update" || status === "deferred") && (
        <>
          {status === "deferred"
            ? "Finish or leave games in other tabs before updating."
            : "A new version is ready."}
          <button onClick={applyOfflineUpdate}>Refresh to update</button>
        </>
      )}
    </div>
  );
}
