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
  mode?: "app" | "marketing";
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
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <FollowUpToday />
      </main>
      <MobileBottomNav />
    </div>
  );
}

export function LandingMorph({ onComplete, mode = "app" }: LandingMorphProps) {
  const reducedMotion = useReducedMotion();
  const [isInteractive, setIsInteractive] = useState(false);
  const completedRef = useRef(false);
  const morphDistanceRef = useRef(1200);
  const enableAppTransition = mode === "app";
  const sectionHeightClass = enableAppTransition ? "h-[240vh]" : "h-[160vh]";

  const { scrollY } = useScroll();

  useEffect(() => {
    const updateDistance = () => {
      morphDistanceRef.current = window.innerHeight * 1.05;
    };
    updateDistance();
    window.addEventListener("resize", updateDistance);
    return () => window.removeEventListener("resize", updateDistance);
  }, []);

  // Drive the morph from *page scroll* so it reacts immediately on the first scroll tick.
  const baseProgress = useTransform(scrollY, (v) =>
    clamp(v / Math.max(1, morphDistanceRef.current), 0, 1),
  );
  // Fast early ramp for "instant" growth; tweak exponent lower for more immediacy.
  const fastProgress = useTransform(baseProgress, (v) => clamp(Math.pow(v, 0.6) * 1.15, 0, 1));
  // Smooth premium ease-out; tweak power for snappier or softer feel.
  const eased = useTransform(fastProgress, (v) => 1 - Math.pow(1 - v, 2.2));
  const easedSpring = useSpring(eased, { stiffness: 280, damping: 26, mass: 0.24 });

  // Front-load the scale so growth is visible immediately.
  const scale = useTransform(easedSpring, [0, 0.4, 1], [0.78, 1, 1.3]);
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
    if (!enableAppTransition || completedRef.current) return;
    const complete = latest >= 0.99;
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
    <section className={`relative ${sectionHeightClass}`}>
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
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </motion.div>
            {!isInteractive && (
              <div className="pointer-events-none select-none">
                <FollowUpToday />
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>

      {enableAppTransition &&
        isInteractive &&
        createPortal(
          <div className="fixed inset-0 z-50 w-screen h-screen">
            <FullAppFrame />
          </div>,
          document.body,
        )}
      {!enableAppTransition && (
        <div className="relative h-[40vh]">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.45)_60%,_hsl(var(--background))_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--accent)/0.6)_0%,_transparent_70%)] blur-3xl opacity-80" />
        </div>
      )}
    </section>
  );
}
