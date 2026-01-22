import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import FollowUpToday from "@/pages/FollowUpToday";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileBottomNav } from "@/components/MobileBottomNav";

type LandingMorphProps = {
  onComplete?: () => void;
};

const HAS_USED_KEY = "simplecrm_has_used";
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function FullAppFrame() {
  return (
    <div className="min-h-svh flex w-full bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-4">
          <SidebarTrigger className="h-9 w-9 ml-2 hidden md:inline-flex" />
          <ThemeToggle />
        </header>
        <FollowUpToday />
      </main>
      <MobileBottomNav />
    </div>
  );
}

export function LandingMorph({ onComplete }: LandingMorphProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();
  const [isInteractive, setIsInteractive] = useState(false);
  const completedRef = useRef(false);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const fastProgress = useTransform(scrollYProgress, (v) => clamp(v * 1.5, 0, 1));
  // Snappy easing: eased = 1 - (1 - fastProgress)^3
  const eased = useTransform(fastProgress, (v) => 1 - Math.pow(1 - v, 3));
  const easedSpring = useSpring(eased, { stiffness: 220, damping: 28, mass: 0.3 });

  const scale = useTransform(easedSpring, [0, 0.6, 1], [0.75, 1, 1.25]);
  const radius = useTransform(easedSpring, [0, 1], [24, 0]);
  const chromeOpacity = useTransform(easedSpring, [0, 0.8, 1], [1, 0.4, 0]);
  const shadow = useTransform(
    easedSpring,
    [0, 0.7, 1],
    [
      "0 24px 70px rgba(0,0,0,0.18)",
      "0 12px 36px rgba(0,0,0,0.12)",
      "0 0 0 rgba(0,0,0,0)",
    ],
  );

  useMotionValueEvent(fastProgress, "change", (latest) => {
    if (completedRef.current) return;
    const complete = latest > 0.92;
    if (complete) {
      completedRef.current = true;
      setIsInteractive(true);
      try {
        localStorage.setItem(HAS_USED_KEY, "1");
      } catch {
        // ignore storage errors
      }
      onComplete?.();
    }
  });

  const staticPreviewStyles = useMemo(
    () =>
      reducedMotion
        ? {
            width: "min(1200px, 90vw)",
            scale: 1,
            borderRadius: 24,
            boxShadow: "0 18px 50px rgba(0,0,0,0.14)",
            opacity: 1,
          }
        : null,
    [reducedMotion],
  );

  return (
    <section ref={sectionRef} className="relative h-[240vh]">
      <div className="sticky top-0 h-svh flex items-center justify-center">
        <motion.div
          className="w-full flex justify-center"
          style={reducedMotion ? undefined : { scale: scale }}
        >
          <motion.div
            className="bg-card border border-border overflow-hidden"
            style={
              reducedMotion
                ? staticPreviewStyles ?? undefined
                : {
                    width: "min(1200px, 90vw)",
                    borderRadius: radius,
                    boxShadow: shadow,
                    opacity: isInteractive ? 0 : 1,
                  }
            }
          >
            <motion.div
              className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/40"
              style={reducedMotion ? undefined : { opacity: chromeOpacity }}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-accent/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
            </motion.div>
            {!isInteractive && (
              <div className="pointer-events-none select-none">
                <FollowUpToday />
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>

      {isInteractive &&
        createPortal(
          <div className="fixed inset-0 z-50 w-screen h-screen">
            <FullAppFrame />
          </div>,
          document.body,
        )}
    </section>
  );
}
