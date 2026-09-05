import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const DISMISS_KEY = "ludo:install-dismissed";
const DISMISS_DAYS = 7;

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

function isPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as unknown as { standalone?: boolean };
  return nav.standalone === true;
}

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (Number.isNaN(at)) return false;
    const ms = DISMISS_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - at < ms;
  } catch {
    return false;
  }
}

function dismiss() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage may be blocked */
  }
}

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (blockedHost(window.location.hostname)) return;
    if (isStandalone()) return;
    if (!isPhone()) return;
    if (isDismissed()) return;

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    setIos(isIOS);

    if (isIOS) {
      setVisible(true);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as DeferredPrompt);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (ios || !deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      /* prompt may fail or be cancelled */
    } finally {
      setDeferredPrompt(null);
      setVisible(false);
      dismiss();
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    dismiss();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-12 z-50 px-4">
      <div className="mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-card p-3 shadow-lg ring-1 ring-border">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {ios ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Play offline on your phone</p>
          <p className="text-xs text-muted-foreground leading-tight">
            {ios
              ? "Tap Share, then 'Add to Home Screen'."
              : "Add Ludo to your home screen for offline play."}
          </p>
        </div>
        {!ios && (
          <Button size="sm" className="shrink-0 rounded-xl" onClick={handleInstall}>
            Add
          </Button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
