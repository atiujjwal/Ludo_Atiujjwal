import { Download, MoreVertical, Plus, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { OfflineStatus } from "./OfflineStatus";

export default function InstallHelp({
  ready,
  isIOS,
  canPrompt,
  onInstall,
  onClose,
}: {
  ready: boolean;
  isIOS: boolean;
  canPrompt: boolean;
  onInstall: () => void;
  onClose: () => void;
}) {
  const steps = isIOS
    ? [
        { icon: Share2, text: "Tap the Share button in your browser." },
        { icon: Plus, text: "Choose “Add to Home Screen”." },
        { icon: Download, text: "Tap Add to install Ludo." },
      ]
    : [
        { icon: MoreVertical, text: "Open your browser menu." },
        { icon: Plus, text: "Choose “Install app” or “Add to Home screen”." },
        { icon: Download, text: "Confirm Install." },
      ];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[2rem] border-border bg-card p-6 shadow-[var(--elev-3)] [&>button:last-child]:min-h-11 [&>button:last-child]:min-w-11">
        <img src="/logo.jpeg" alt="" className="mx-auto h-14 w-14 rounded-xl" />
        <div className="text-center">
          <DialogTitle className="font-display text-2xl">
            {ready ? "Add Ludo to your Home Screen" : "Preparing your offline game"}
          </DialogTitle>
          <DialogDescription className="mt-1 font-semibold">
            {ready
              ? "Offline files are verified. Install and keep playing anywhere."
              : "You can close this window and play while files download. Come back to install when ready."}
          </DialogDescription>
        </div>
        {ready &&
          (canPrompt ? (
            <button
              className="min-h-11 rounded-2xl bg-primary px-4 font-bold text-primary-foreground"
              onClick={onInstall}
            >
              Install now
            </button>
          ) : (
            <ol className="mt-1 space-y-3">
              {steps.map(({ icon: Icon, text }, index) => (
                <li
                  key={text}
                  className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-[var(--elev-1)]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ludo-blue-soft)] font-black text-[var(--ludo-blue-light)]">
                    {index + 1}
                  </span>
                  <span className="flex-1 text-sm font-bold">{text}</span>
                  <Icon className="h-5 w-5 shrink-0 text-[var(--ludo-blue)]" />
                </li>
              ))}
            </ol>
          ))}
        <OfflineStatus />
      </DialogContent>
    </Dialog>
  );
}
