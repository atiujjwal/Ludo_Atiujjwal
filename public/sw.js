/* Replaced with content-derived revisions by scripts/build-offline.mjs. */
const VERSION = "__BUILD_REVISION__";
const PRECACHE = []; // __PRECACHE__
const NAVIGATION = {}; // __NAVIGATION__
const CACHE_NAME = "ludo-shell-" + VERSION;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        // addAll is atomic: an interrupted or failed preparation cannot replace a working shell.
        await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
      } catch (error) {
        await caches.delete(CACHE_NAME);
        throw error;
      }
    })(),
  );
  // First installs activate normally. Updates wait for a deliberate refresh.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Retain the previous shell for older tabs' lazy-loaded bundles.
      const keys = (await caches.keys()).filter(
        (key) => key.startsWith("ludo-shell-") && key !== CACHE_NAME,
      );
      await Promise.all(keys.slice(0, -1).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "ACTIVATE_UPDATE") return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((client) => /^\/game\/?$/.test(new URL(client.url).pathname))) {
        event.source?.postMessage({ type: "UPDATE_DEFERRED" });
        return;
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.searchParams.get("sw") === "off" ||
    url.pathname.startsWith("/api/")
  )
    return;
  const route = url.pathname.replace(/\/$/, "") || "/";
  if (request.mode === "navigate" && NAVIGATION[route]) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        // Static, account-free routes are generated together with their exact bundles.
        return (await cache.match(NAVIGATION[route])) || fetch(request);
      })(),
    );
  } else if (
    request.mode !== "navigate" &&
    (PRECACHE.includes(url.pathname) || url.pathname.startsWith("/assets/"))
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(request)) || (await caches.match(request)) || fetch(request);
      })(),
    );
  }
  // Unknown routes retain the server's real 404, not the home page.
});
