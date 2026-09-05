/**
 * Registers the offline service worker only in the real published app.
 * Never in dev, an iframe, or a Lovable preview host — stale caches there
 * would serve deleted chunks after an edit.
 */
function blockedHost(hostname: string): boolean {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

export async function registerOfflineSupport(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const inIframe = window.self !== window.top;
  const swOff = new URL(window.location.href).searchParams.get("sw") === "off";
  const refuse =
    !import.meta.env.PROD || inIframe || swOff || blockedHost(window.location.hostname);

  if (refuse) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((r) => (r.active?.scriptURL ?? "").endsWith("/sw.js"))
          .map((r) => r.unregister()),
      );
    } catch {
      /* ignore */
    }
    return;
  }

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    /* offline support is optional */
  }
}
