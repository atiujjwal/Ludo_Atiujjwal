import { useSyncExternalStore } from "react";
import {
  storageSnapshot,
  storageServerSnapshot,
  subscribeStorage,
} from "@/lib/ludo/local-preferences";

export function StorageWarning() {
  const message = useSyncExternalStore(subscribeStorage, storageSnapshot, storageServerSnapshot);
  return message ? (
    <div
      role="status"
      className="royal-offline-status fixed inset-x-3 top-2 z-50 mx-auto max-w-md rounded-xl border border-border bg-card p-3 text-sm text-foreground"
    >
      {message}
    </div>
  ) : null;
}
