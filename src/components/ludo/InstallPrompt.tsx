import { useEffect, useState } from "react";
import { Download, MoreVertical, Plus, Share2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { OfflineStatus } from "./OfflineStatus";

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
        className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[var(--ludo-blue-dark)] text-sm font-black text-white transition-transform active:translate-y-0.5"
        style={{
          background: "linear-gradient(160deg, #31517d, var(--ludo-blue-dark))",
          boxShadow: "0 5px 0 0 var(--ludo-blue-dark), 0 12px 22px -14px var(--ludo-blue-dark)",
        }}
        aria-label="Install Ludo on this phone"
      >
        <Download className="h-5 w-5 transition-transform group-active:translate-y-0.5" />
        Install on your phone
      </button>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[2rem] border-border bg-card p-6 shadow-[var(--elev-3)] [&>button:last-child]:min-h-11 [&>button:last-child]:min-w-11">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-card shadow-[var(--elev-2)]">
            <img src="/logo.png" alt="" className="h-14 w-14 rounded-xl" />
          </div>
          <div className="text-center">
            <DialogTitle className="font-display text-2xl text-[var(--ink)]">
              Add Ludo to your Home Screen
            </DialogTitle>
            <DialogDescription className="mt-1 font-semibold">
              Launch faster and keep playing offline.
            </DialogDescription>
          </div>

          <ol className="mt-1 space-y-3">
            {(isIOS
              ? [
                  { icon: Share2, text: "Tap the Share button in your browser." },
                  { icon: Plus, text: "Choose “Add to Home Screen”." },
                  { icon: Download, text: "Tap Add to install Ludo." },
                ]
              : [
                  { icon: MoreVertical, text: "Open your browser menu." },
                  { icon: Plus, text: "Choose “Install app” or “Add to Home screen”." },
                  { icon: Download, text: "Confirm Install." },
                ]
            ).map(({ icon: Icon, text }, index) => (
              <li
                key={text}
                className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-[var(--elev-1)]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ludo-blue-soft)] font-black text-[var(--ludo-blue-light)]">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm font-bold text-[var(--ink)]">{text}</span>
                <Icon className="h-5 w-5 shrink-0 text-[var(--ludo-blue)]" />
              </li>
            ))}
          </ol>
          <OfflineStatus />
        </DialogContent>
      </Dialog>
    </>
  );
}
