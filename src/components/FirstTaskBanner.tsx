import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type FirstTaskBannerProps = {
  onDismiss: () => void;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  icon?: string;
  autoCloseMs?: number;
};

export function FirstTaskBanner({
  onDismiss,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  icon = "🌿",
  autoCloseMs,
}: FirstTaskBannerProps) {
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const close = useCallback(() => {
    if (closeTimeoutRef.current !== null) return;
    setIsClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      onDismiss();
    }, 260);
  }, [onDismiss]);

  useEffect(() => {
    if (!autoCloseMs) return;
    const timer = window.setTimeout(() => {
      close();
    }, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, close]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="fixed inset-x-0 z-50 pointer-events-none flex justify-center px-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+12px)] md:bottom-6 md:pl-[var(--sidebar-width)] md:pr-6">
      <div
        className={`pointer-events-auto relative w-full max-w-3xl overflow-hidden rounded-3xl border border-primary/30 bg-[linear-gradient(135deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.6)_60%,_hsl(var(--background))_100%)] px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur transition-all duration-300 md:px-7 md:py-5 ${
          isClosing ? "translate-y-3 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 -bottom-10 h-44 w-44 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="flex items-start gap-3 md:gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-xl">
            {icon}
          </div>
          <div className="flex-1">
            <p className="text-base md:text-lg font-semibold text-foreground leading-snug">{title}</p>
            {(description || actionLabel) && (
              <div className="mt-1 text-sm md:text-base text-muted-foreground">
                {description && <span>{description}</span>}
                {actionLabel && (
                  <>
                    {description ? " " : null}
                    {actionHref ? (
                      <a
                        href={actionHref}
                        onClick={onAction}
                        className="inline-flex items-center font-semibold text-primary hover:text-primary/80 transition-colors"
                      >
                        {actionLabel}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={onAction}
                        className="inline-flex items-center font-semibold text-primary hover:text-primary/80 transition-colors"
                      >
                        {actionLabel}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={close}
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
