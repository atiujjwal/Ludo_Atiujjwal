export type OfflineStatus = "idle" | "preparing" | "ready" | "error" | "update" | "deferred";
export interface OfflineDetails {
  status: OfflineStatus;
  ready: boolean;
  completed: number;
  total: number;
  error?: string;
}
const initial: OfflineDetails = { status: "idle", ready: false, completed: 0, total: 0 };
let details = initial;
let registration: ServiceWorkerRegistration | undefined;
let pending: Promise<void> | undefined;
let refreshRequested = false;
let listenersInstalled = false;
const listeners = new Set<() => void>();
export const offlineSnapshot = () => details.status;
export const offlineServerSnapshot = (): OfflineStatus => "idle";
export const offlineDetailsSnapshot = () => details;
export const offlineDetailsServerSnapshot = () => initial;
export const subscribeOffline = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function publish(status: OfflineStatus, changes: Partial<OfflineDetails> = {}) {
  details = { ...details, status, ...changes };
  listeners.forEach((listener) => listener());
}
type CacheReply = { type: string; ready?: boolean; completed?: number; total?: number };
function ask(worker: ServiceWorker, type = "CHECK_OFFLINE"): Promise<CacheReply> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(
      () => {
        channel.port1.close();
        resolve({ type: "CACHE_ERROR" });
      },
      type === "PREPARE_OFFLINE" ? 180000 : 2500,
    );
    channel.port1.onmessage = (event: MessageEvent<CacheReply>) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data);
    };
    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      channel.port1.close();
      resolve({ type: "CACHE_ERROR" });
    }
  });
}
async function refreshStatus() {
  const active = registration?.active;
  const waiting = registration?.waiting;
  const reply = active ? await ask(active) : undefined;
  const ready = reply?.ready === true;
  const changes = { ready, completed: reply?.completed ?? 0, total: reply?.total ?? 0 };
  if (waiting && (await ask(waiting)).ready) publish("update", changes);
  else if (registration?.installing) publish("preparing", changes);
  else if (ready) publish("ready", changes);
  else
    publish("error", {
      ...changes,
      error: "Offline files are incomplete. Reconnect and retry; your saved game is unchanged.",
    });
}
/** Cache work never gates application startup, starting or resuming a game. */
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
    const existing = await navigator.serviceWorker.getRegistration("/");
    const ownRegistration =
      existing &&
      (existing.active?.scriptURL ??
        existing.waiting?.scriptURL ??
        existing.installing?.scriptURL) === new URL("/sw.js", location.origin).href
        ? existing
        : undefined;
    // Existing installs verify their local shell first. Neither uncertain
    // navigator.onLine nor a slow update request can stall offline readiness.
    registration =
      ownRegistration ??
      (await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }));
    const watchInstall = () => {
      const worker = registration?.installing;
      if (!worker) return;
      publish("preparing");
      worker.addEventListener("statechange", () => {
        if (["installed", "activated", "redundant"].includes(worker.state)) void refreshStatus();
      });
    };
    registration.onupdatefound = watchInstall;
    watchInstall();
    if (!listenersInstalled) {
      listenersInstalled = true;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        void refreshStatus();
        if (refreshRequested && !/^\/game\/?$/.test(location.pathname)) location.reload();
      });
      navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
        if (event.data?.type === "CHECK_GAME_ACTIVITY") {
          const entry = performance
            .getEntriesByType("resource")
            .map((resource) => new URL(resource.name).pathname)
            .find((path) => /^\/assets\/index-[^/]+\.js$/.test(path));
          event.ports[0]?.postMessage({ active: /^\/game\/?$/.test(location.pathname), entry });
        } else if (event.data?.type === "UPDATE_DEFERRED") {
          refreshRequested = false;
          publish("deferred");
        } else if (event.data?.type === "CACHE_PROGRESS") {
          publish(details.ready ? details.status : "preparing", {
            completed: event.data.completed,
            total: event.data.total,
          });
        } else if (event.data?.type === "CACHE_STATUS") {
          void refreshStatus();
        } else if (event.data?.type === "CACHE_ERROR") {
          publish("error", {
            error:
              event.data.error ??
              "Offline files are missing or could not be stored. Reconnect and retry.",
          });
          void refreshStatus();
        }
      });
      window.addEventListener("online", () => {
        if (!details.ready) void registerOfflineSupport();
      });
    }
    await refreshStatus();
    if (ownRegistration && navigator.onLine && !/^\/game\/?$/.test(location.pathname)) {
      void ownRegistration.update().catch(() => {
        /* the verified installed shell remains usable */
      });
    }
    if (
      !details.ready &&
      registration.active &&
      !registration.installing &&
      !registration.waiting &&
      navigator.onLine
    ) {
      publish("preparing");
      await ask(registration.active, "PREPARE_OFFLINE");
      await refreshStatus();
    }
  } catch {
    publish("error", {
      error: "Offline preparation failed. Check connection and available storage, then retry.",
    });
  }
}
/** Call from the install gesture; denial isn't fatal, but eviction remains possible. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* browser-managed storage */
  }
}
export function applyOfflineUpdate() {
  if (!registration?.waiting || /^\/game\/?$/.test(location.pathname)) return;
  refreshRequested = true;
  registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
}
