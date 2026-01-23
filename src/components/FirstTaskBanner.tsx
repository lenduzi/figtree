import { X } from "lucide-react";

type FirstTaskBannerProps = {
  onDismiss: () => void;
};

export function FirstTaskBanner({ onDismiss }: FirstTaskBannerProps) {
  return (
    <div className="fixed inset-x-0 z-50 flex justify-center px-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+12px)] md:bottom-6">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-primary/30 bg-[linear-gradient(135deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.6)_60%,_hsl(var(--background))_100%)] px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur md:px-7 md:py-5">
        <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 -bottom-10 h-44 w-44 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="flex items-start gap-3 md:gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-xl">
            🌿
          </div>
          <p className="text-base md:text-lg font-medium text-foreground leading-snug">
            <span className="font-semibold">Welcome to Figtree.</span> Your data stays on your device. Keep going.
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground hover:border-border"
            aria-label="Dismiss welcome banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
