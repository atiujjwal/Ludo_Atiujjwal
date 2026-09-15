/* Replaced with content-derived revisions by scripts/build-offline.mjs. */
const VERSION = "__BUILD_REVISION__";
const PRECACHE = []; // __PRECACHE__
const NAVIGATION = {}; // __NAVIGATION__
const INTEGRITY = {}; // __INTEGRITY__
const CACHE_NAME = "ludo-shell-" + VERSION;
const COMPLETE = "/offline/complete-" + VERSION;
let preparation;

async function broadcast(data) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  windows.forEach((client) => client.postMessage?.({ ...data, revision: VERSION }));
}

async function verified(response, url) {
  if (!response || !response.ok || response.type === "opaque") return false;
  if (!INTEGRITY[url]) return true;
  const digest = await crypto.subtle.digest("SHA-256", await response.clone().arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return hash === INTEGRITY[url];
}

async function cacheStatus() {
  const cache = await caches.open(CACHE_NAME);
  const entries = await Promise.all(PRECACHE.map((url) => cache.match(url)));
  const completed = entries.filter((response) => response?.ok).length;
  return {
    type: "CACHE_STATUS",
    ready: completed === PRECACHE.length && !!(await cache.match(COMPLETE)),
    completed,
    total: PRECACHE.length,
  };
}

function prepareCache() {
  if (preparation) return preparation;
  preparation = (async () => {
    const cache = await caches.open(CACHE_NAME);
    let cursor = 0;
    let completed = 0;
    let failed;
    async function download() {
      while (cursor < PRECACHE.length && !failed) {
        const url = PRECACHE[cursor++];
        try {
          let response = await cache.match(url);
          if (!(await verified(response, url))) {
            // Content validation makes reuse safe even for unversioned public URLs.
            response = await caches.match(url);
            if (!(await verified(response, url))) {
              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  response = await fetch(
                    new Request(url, { cache: "reload", signal: AbortSignal.timeout(20000) }),
                  );
                  if (!(await verified(response, url)))
                    throw new Error("Invalid offline file: " + url);
                  break;
                } catch (error) {
                  if (attempt === 2) throw error;
                }
              }
            }
            await cache.put(url, response);
          }
          completed++;
          await broadcast({ type: "CACHE_PROGRESS", completed, total: PRECACHE.length });
        } catch (error) {
          failed = error;
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, download));
    if (failed) throw failed;
    await cache.put(
      COMPLETE,
      new Response(JSON.stringify({ revision: VERSION, completedAt: Date.now() })),
    );
    await broadcast(await cacheStatus());
  })().finally(() => {
    preparation = undefined;
  });
  return preparation;
}

async function clientState(client) {
  // WindowClient.url can lag SPA history navigation. Ask each actual window,
  // including windows controlled by older revisions, before replacing code.
  if (typeof MessageChannel === "undefined")
    return { active: /^\/game\/?$/.test(new URL(client.url).pathname), entry: null };
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve({ active: true, entry: null });
    }, 1500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve({ active: event.data?.active !== false, entry: event.data?.entry ?? null });
    };
    client.postMessage({ type: "CHECK_GAME_ACTIVITY" }, [channel.port2]);
  });
}

async function pruneCaches() {
  const keys = (await caches.keys()).filter(
    (key) => key.startsWith("ludo-shell-") && key !== CACHE_NAME,
  );
  if (keys.length <= 1) return;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const states = await Promise.all(windows.map(clientState));
  // Unknown/older clients keep their caches until they are closed or refreshed.
  if (states.some((state) => !state.entry)) return;
  const keep = new Set([keys[keys.length - 1]]);
  for (const key of keys) {
    const cache = await caches.open(key);
    if ((await Promise.all(states.map((state) => cache.match(state.entry)))).some(Boolean))
      keep.add(key);
  }
  await Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        // A candidate is never activated until all files have passed integrity checks.
        await prepareCache();
      } catch (error) {
        await caches.delete(CACHE_NAME);
        await broadcast({
          type: "CACHE_ERROR",
          error:
            "Offline files could not be stored. Check connection and available storage, then retry.",
        });
        throw error;
      }
    })(),
  );
  // First installs activate normally. Updates wait for a deliberate refresh.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await broadcast(await cacheStatus());
      await pruneCaches();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CHECK_OFFLINE" || event.data?.type === "PREPARE_OFFLINE") {
    event.waitUntil(
      (async () => {
        try {
          if (event.data.type === "PREPARE_OFFLINE") await prepareCache();
          const data = { ...(await cacheStatus()), revision: VERSION };
          (event.ports?.[0] ?? event.source)?.postMessage(data);
        } catch {
          (event.ports?.[0] ?? event.source)?.postMessage({
            type: "CACHE_ERROR",
            revision: VERSION,
          });
        }
      })(),
    );
    return;
  }
  if (event.data?.type !== "ACTIVATE_UPDATE") return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if ((await Promise.all(windows.map(clientState))).some((state) => state.active)) {
        event.source?.postMessage({ type: "UPDATE_DEFERRED" });
        return;
      }
      if (!(await cacheStatus()).ready) return;
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
        const cached = await cache.match(NAVIGATION[route]);
        if (cached) return cached;
        await broadcast({ type: "CACHE_ERROR" });
        try {
          return await fetch(request);
        } catch {
          return new Response(
            '<!doctype html><meta name="viewport" content="width=device-width"><title>Offline preparation needed</title><main style="font:18px system-ui;max-width:32rem;margin:15vh auto;padding:24px"><h1>Offline files are missing</h1><p>Your saved game has not been changed. Reconnect once and reopen Ludo to prepare offline play.</p><button onclick="location.reload()">Try again</button></main>',
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
  } else if (
    request.mode !== "navigate" &&
    (PRECACHE.includes(url.pathname) || url.pathname.startsWith("/assets/"))
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        // Only normalize owned cacheable assets; API queries are never discarded.
        const key = url.pathname;
        return (await cache.match(key)) || (await caches.match(key)) || fetch(request);
      })(),
    );
  }
  // Unknown routes retain the server's real 404, not the home page.
});
