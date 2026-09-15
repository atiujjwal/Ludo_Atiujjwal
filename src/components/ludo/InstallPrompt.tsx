import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { Download } from "lucide-react";

import {
  offlineDetailsSnapshot,
  offlineDetailsServerSnapshot,
  subscribeOffline,
  registerOfflineSupport,
  requestPersistentStorage,
} from "@/lib/ludo/register-sw";
const InstallHelp = lazy(() => import("./InstallHelp"));

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type MobilePlatform = "android" | "ios" | null;

function mobilePlatform(): MobilePlatform {
  if (typeof navigator === "undefined") return null;

  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (ios) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return null;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;

  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function InstallButton() {
  const { ready } = useSyncExternalStore(
    subscribeOffline,
    offlineDetailsSnapshot,
    offlineDetailsServerSnapshot,
  );
  const [platform, setPlatform] = useState<MobilePlatform>(null);
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !import.meta.env.PROD || window.self !== window.top) {
      return;
    }

    if (new URL(window.location.href).searchParams.get("sw") === "off") return;

    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const detectedPlatform = mobilePlatform();
    setPlatform(detectedPlatform);
    setAvailable(detectedPlatform !== null);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredPrompt);
      setAvailable(true);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowHelp(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    void requestPersistentStorage();
    if (!ready) {
      setShowHelp(true);
      void registerOfflineSupport();
      return;
    }
    if (platform === "ios" || !deferredPrompt) {
      setShowHelp(true);
      return;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
    } catch {
      setShowHelp(true);
    } finally {
      setDeferredPrompt(null);
    }
  };

  if (!available || installed) return null;

  const isIOS = platform === "ios";

  return (
    <>
      <button
        type="button"
        onClick={() => void handleInstall()}
        className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[var(--ludo-blue-dark)] text-sm font-black text-[var(--on-color)] transition-transform active:translate-y-0.5"
        style={{
          background: "var(--install-surface)",
          boxShadow: "0 5px 0 0 var(--ludo-blue-dark), 0 12px 22px -14px var(--ludo-blue-dark)",
        }}
        aria-label="Install Ludo on this phone"
      >
        <Download className="h-5 w-5 transition-transform group-active:translate-y-0.5" />
        {ready ? "Install now" : "Install on your phone"}
      </button>

      {showHelp && (
        <Suspense fallback={<p role="status">Opening offline preparation…</p>}>
          <InstallHelp
            ready={ready}
            isIOS={isIOS}
            canPrompt={!!deferredPrompt && !isIOS}
            onInstall={() => void handleInstall()}
            onClose={() => setShowHelp(false)}
          />
        </Suspense>
      )}
    </>
  );
}
