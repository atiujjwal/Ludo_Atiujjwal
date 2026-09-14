import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("PROD", true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function browser(path = "/", embedded = false) {
  const origin = "https://ludo.test";
  const location = { href: origin + path, origin, pathname: path.split("?")[0], reload: vi.fn() };
  const listeners = new Map<string, (event?: unknown) => void>();
  const waiting = { postMessage: vi.fn() };
  const registration = {
    active: { scriptURL: origin + "/sw.js" },
    waiting: null as typeof waiting | null,
    installing: null,
  };
  const unregister = vi.fn(async () => true);
  const unrelated = vi.fn(async () => true);
  const serviceWorker = {
    register: vi.fn(async () => registration),
    getRegistrations: vi.fn(async () => [
      { active: { scriptURL: origin + "/sw.js" }, unregister },
      { active: { scriptURL: origin + "/unrelated.js" }, unregister: unrelated },
    ]),
    addEventListener: (event: string, fn: (event?: unknown) => void) => listeners.set(event, fn),
  };
  const window = { location, self: {}, top: {} };
  if (!embedded) window.top = window.self;
  vi.stubGlobal("window", window);
  vi.stubGlobal("location", location);
  vi.stubGlobal("navigator", { serviceWorker });
  return { location, serviceWorker, registration, waiting, listeners, unregister, unrelated };
}

describe("offline registration and update UI safeguards", () => {
  it("prepares independently and does not automatically reload on activation", async () => {
    const b = browser();
    const api = await import("./register-sw");
    await api.registerOfflineSupport();
    expect(api.offlineSnapshot()).toBe("ready");
    expect(b.serviceWorker.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    b.listeners.get("controllerchange")?.();
    expect(b.location.reload).not.toHaveBeenCalled();
  });
  it("unregisters only this app with sw=off and never prepares in embedded windows", async () => {
    for (const [path, embedded] of [
      ["/?sw=off", false],
      ["/", true],
    ] as const) {
      const b = browser(path, embedded);
      const api = await import("./register-sw");
      await api.registerOfflineSupport();
      expect(b.serviceWorker.register).not.toHaveBeenCalled();
      expect(b.unregister).toHaveBeenCalledOnce();
      expect(b.unrelated).not.toHaveBeenCalled();
    }
  });
  it("refuses refresh during play but permits an explicit home-screen update", async () => {
    const b = browser("/game");
    b.registration.waiting = b.waiting;
    const api = await import("./register-sw");
    await api.registerOfflineSupport();
    expect(api.offlineSnapshot()).toBe("update");
    api.applyOfflineUpdate();
    expect(b.waiting.postMessage).not.toHaveBeenCalled();
    b.location.pathname = "/";
    api.applyOfflineUpdate();
    expect(b.waiting.postMessage).toHaveBeenCalledWith({ type: "ACTIVATE_UPDATE" });
    b.listeners.get("controllerchange")?.();
    expect(b.location.reload).toHaveBeenCalledOnce();
  });
  it("does not reload when another open game's update guard defers activation", async () => {
    const b = browser();
    b.registration.waiting = b.waiting;
    const api = await import("./register-sw");
    await api.registerOfflineSupport();
    api.applyOfflineUpdate();
    b.listeners.get("message")?.({ data: { type: "UPDATE_DEFERRED" } });
    expect(api.offlineSnapshot()).toBe("deferred");
    b.listeners.get("controllerchange")?.();
    expect(b.location.reload).not.toHaveBeenCalled();
  });
  it("reports a failed registration without stopping the app", async () => {
    const b = browser();
    b.serviceWorker.register.mockRejectedValueOnce(new Error("Network offline"));
    const api = await import("./register-sw");
    await expect(api.registerOfflineSupport()).resolves.toBeUndefined();
    expect(api.offlineSnapshot()).toBe("error");
  });
});
