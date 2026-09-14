import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const template = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const routes = ["/", "/setup", "/game", "/rules", "/settings"];
const navigation = Object.fromEntries(
  routes.map((route) => [route, "/offline/" + (route.slice(1) || "index") + ".html"]),
);
const assets = [...Object.values(navigation), "/assets/game-new.js", "/logo.png"];

function worker(options: { fail?: boolean; windows?: string[] } = {}) {
  const stores = new Map<string, Map<string, Response>>();
  stores.set("ludo-shell-old", new Map([["/assets/game-old.js", new Response("old bundle")]]));
  const keyOf = (request: Request | string) =>
    new URL(typeof request === "string" ? request : request.url, "https://ludo.test").pathname;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      addAll: async (requests: Request[]) => {
        if (options.fail) throw new Error("download interrupted");
        requests.forEach((request) => store.set(keyOf(request), new Response(keyOf(request))));
      },
      match: async (request: Request | string) => store.get(keyOf(request))?.clone(),
    };
  };
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const skipWaiting = vi.fn(async () => {});
  const fetchMock = vi.fn(async () => new Response("network"));
  runInNewContext(
    template
      .replace("__BUILD_REVISION__", "new")
      .replace(
        "const PRECACHE = []; // __PRECACHE__",
        "const PRECACHE = " + JSON.stringify(assets) + ";",
      )
      .replace(
        "const NAVIGATION = {}; // __NAVIGATION__",
        "const NAVIGATION = " + JSON.stringify(navigation) + ";",
      ),
    {
      self: {
        location: { origin: "https://ludo.test" },
        addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) =>
          handlers.set(name, handler),
        skipWaiting,
        clients: {
          claim: vi.fn(async () => {}),
          matchAll: async () => (options.windows ?? []).map((url) => ({ url })),
        },
      },
      caches: {
        open,
        keys: async () => [...stores.keys()],
        delete: async (name: string) => stores.delete(name),
        match: async (request: Request | string) =>
          [...stores.values()]
            .map((store) => store.get(keyOf(request)))
            .find(Boolean)
            ?.clone(),
      },
      URL,
      Request: class extends Request {
        constructor(url: string, init: RequestInit) {
          super(new URL(url, "https://ludo.test"), init);
        }
      },
      fetch: fetchMock,
    },
  );
  function send(type: string, extra: Record<string, unknown> = {}) {
    let promise: Promise<unknown> | undefined;
    handlers.get(type)!({
      ...extra,
      waitUntil: (p: Promise<unknown>) => {
        promise = p;
      },
      respondWith: (p: Promise<unknown>) => {
        promise = p;
      },
    });
    return promise;
  }
  function request(path: string, mode = "navigate") {
    return send("fetch", { request: { url: "https://ludo.test" + path, method: "GET", mode } }) as
      Promise<Response> | undefined;
  }
  return { stores, skipWaiting, fetchMock, send, request };
}

describe("revisioned offline shell", () => {
  it("prepares every playable route and its browser assets before reporting installed", async () => {
    const w = worker();
    await w.send("install");
    expect(w.stores.get("ludo-shell-new")?.size).toBe(assets.length);
    for (const route of routes)
      expect(await (await w.request(route))?.text()).toBe(navigation[route]);
    expect(w.fetchMock).not.toHaveBeenCalled();
    expect(w.skipWaiting).not.toHaveBeenCalled();
  });
  it("keeps the previous working cache when preparation is interrupted", async () => {
    const w = worker({ fail: true });
    await expect(w.send("install")).rejects.toThrow("download interrupted");
    expect(w.stores.has("ludo-shell-new")).toBe(false);
    expect(w.stores.has("ludo-shell-old")).toBe(true);
  });
  it("retains prior bundles for already open tabs after activation", async () => {
    const w = worker();
    await w.send("install");
    await w.send("activate");
    expect(await (await w.request("/assets/game-old.js", "cors"))?.text()).toBe("old bundle");
    expect(w.fetchMock).not.toHaveBeenCalled();
  });
  it("never activates an update while a game tab is open", async () => {
    const w = worker({ windows: ["https://ludo.test/", "https://ludo.test/game/?resume=1"] });
    const postMessage = vi.fn();
    await w.send("message", { data: { type: "ACTIVATE_UPDATE" }, source: { postMessage } });
    expect(w.skipWaiting).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: "UPDATE_DEFERRED" });
  });
  it("accepts an explicit refresh outside play", async () => {
    const w = worker({ windows: ["https://ludo.test/", "https://ludo.test/settings"] });
    await w.send("message", { data: { type: "ACTIVATE_UPDATE" } });
    expect(w.skipWaiting).toHaveBeenCalledOnce();
  });
  it("bypasses sw=off, APIs and unknown routes instead of hiding real 404s", async () => {
    const w = worker();
    await w.send("install");
    expect(w.request("/game?sw=off")).toBeUndefined();
    expect(w.request("/missing-page")).toBeUndefined();
    expect(w.request("/api/example", "cors")).toBeUndefined();
    expect(await (await w.request("/game/?resume=1"))?.text()).toBe(navigation["/game"]);
  });
});
