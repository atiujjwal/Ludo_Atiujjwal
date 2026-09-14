export type OfflineStatus = "idle" | "preparing" | "ready" | "error" | "update" | "deferred";
let status: OfflineStatus = "idle";
let registration: ServiceWorkerRegistration | undefined;
let pending: Promise<void> | undefined;
let refreshRequested = false;
let listenersInstalled = false;
const listeners = new Set<() => void>();
export const offlineSnapshot = () => status;
export const offlineServerSnapshot = (): OfflineStatus => "idle";
export const subscribeOffline = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function publish(next: OfflineStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

/** Optional offline preparation never gates starting or resuming a game. */
export function registerOfflineSupport(): Promise<void> {
  if (pending) return pending;
  pending = prepare().finally(() => {
    pending = undefined;
  });
  return pending;
}
async function prepare() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const swOff = new URL(window.location.href).searchParams.get("sw") === "off";
  if (!import.meta.env.PROD || window.self !== window.top || swOff) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(
      registrations
        .filter(
          (r) =>
            (r.active?.scriptURL ?? r.waiting?.scriptURL ?? r.installing?.scriptURL) ===
            new URL("/sw.js", location.origin).href,
        )
        .map((r) => r.unregister()),
    );
    return;
  }
  publish("preparing");
  try {
    registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    const refreshStatus = () =>
      publish(
        registration?.waiting
          ? "update"
          : registration?.installing
            ? "preparing"
            : registration?.active
              ? "ready"
              : "preparing",
      );
    const watchInstall = () => {
      const worker = registration?.installing;
      if (!worker) return;
      publish("preparing");
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" || worker.state === "activated") refreshStatus();
        else if (worker.state === "redundant") publish("error");
      });
    };
    registration.onupdatefound = watchInstall;
    watchInstall();
    refreshStatus();
    if (listenersInstalled) return;
    listenersInstalled = true;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      refreshStatus();
      // Never reload automatically, including when another tab accepts an update.
      if (refreshRequested && !/^\/game\/?$/.test(location.pathname)) location.reload();
    });
    navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
      if (event.data?.type === "UPDATE_DEFERRED") {
        refreshRequested = false;
        publish("deferred");
      }
    });
  } catch {
    publish("error");
  }
}
export function applyOfflineUpdate() {
  if (!registration?.waiting || /^\/game\/?$/.test(location.pathname)) return;
  refreshRequested = true;
  registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
}
