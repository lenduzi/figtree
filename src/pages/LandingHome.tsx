import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LandingMorph } from "@/components/LandingMorph";
import { Button } from "@/components/ui/button";

const HAS_USED_KEY = "simplecrm_has_used";

const markHasUsed = () => {
  try {
    localStorage.setItem(HAS_USED_KEY, "1");
  } catch {
    // ignore storage errors
  }
};

export default function LandingHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMarketing = useMemo(
    () => new URLSearchParams(location.search).get("marketing") === "1",
    [location.search],
  );

  useEffect(() => {
    if (isMarketing) return;
    try {
      if (localStorage.getItem(HAS_USED_KEY) === "1") {
        navigate("/app", { replace: true });
      }
    } catch {
      // ignore storage errors
    }
  }, [isMarketing, navigate]);

  const handleComplete = () => {
    markHasUsed();
    navigate("/app", { replace: true });
  };

  return (
    <div>
      <section className="bg-background">
        <div className="relative px-6 lg:px-8 xl:px-10 pt-20 lg:pt-24 xl:pt-28 pb-16 lg:pb-20 max-w-4xl lg:max-w-5xl 2xl:max-w-6xl mx-auto text-center">
          <div className="relative z-10">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Figtree CRM</p>
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground mt-3">
              A lightweight CRM for your solo startup
            </h1>
            <p className="text-muted-foreground lg:text-lg mt-3 mx-auto max-w-2xl">
              Track follow-ups, move deals through your pipeline, and keep every relationship in one place.
            </p>
            {isMarketing && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" onClick={() => navigate("/app")}>
                  Enter CRM
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#pricing">See pricing</a>
                </Button>
              </div>
            )}
          </div>
          <img
            src="/landing-logo.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 -translate-y-12 w-[190px] opacity-80 drop-shadow-[0_26px_60px_rgba(59,130,246,0.18)] sm:-translate-y-14 sm:w-[250px] md:-translate-y-18 md:w-[340px] lg:-translate-y-14 lg:w-[410px]"
          />
        </div>
      </section>
      <LandingMorph
        onComplete={isMarketing ? undefined : handleComplete}
        mode={isMarketing ? "marketing" : "app"}
      />

      {isMarketing && (
        <>
          <section className="relative -mt-16 pt-24 pb-20 overflow-hidden bg-[radial-gradient(circle_at_top,_hsl(var(--accent))_0%,_hsl(var(--background))_65%)]">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-x-0 -top-20 h-24 bg-[linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.45)_100%)] blur-2xl opacity-80" />
              <div className="absolute right-0 top-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute left-10 bottom-10 h-56 w-56 rounded-full bg-emerald-300/10 blur-3xl" />
            </div>
            <div className="relative px-6 lg:px-8 xl:px-10 max-w-5xl 2xl:max-w-6xl mx-auto grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] font-mono text-muted-foreground">
                  Built for solo operators
                </p>
                <h2 className="mt-4 text-3xl lg:text-4xl font-semibold font-serif text-foreground">
                  A calm place to manage real relationships.
                </h2>
                <p className="mt-4 text-muted-foreground lg:text-lg">
                  Figtree keeps your day focused on follow-ups, not busywork. You get a clean
                  pipeline, a daily list, and zero data anxiety.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button onClick={() => navigate("/app")}>Open the app</Button>
                  <Button variant="ghost" asChild>
                    <a href="#pricing">Jump to pricing</a>
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  {
                    title: "Local-first by default",
                    detail: "All data lives in your browser. No accounts, no sync surprises.",
                  },
                  {
                    title: "Follow-up radar",
                    detail: "Know who needs attention today and move deals forward fast.",
                  },
                  {
                    title: "Lightweight, not limiting",
                    detail: "Just enough structure to keep you consistent without overhead.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-border/70 bg-card/80 px-5 py-4 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="relative -mt-8 pt-20 pb-20 bg-[linear-gradient(180deg,_hsl(var(--accent)/0.2)_0%,_hsl(var(--background))_45%)]">
            <div className="absolute inset-x-0 -top-16 h-16 pointer-events-none bg-[linear-gradient(180deg,_hsl(var(--accent)/0.45)_0%,_transparent_100%)] blur-2xl opacity-70" />
            <div className="relative px-6 lg:px-8 xl:px-10 max-w-5xl 2xl:max-w-6xl mx-auto">
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.3em] font-mono text-muted-foreground">
                  How it works
                </p>
                <h2 className="mt-4 text-3xl lg:text-4xl font-semibold font-serif text-foreground">
                  A daily rhythm you can keep.
                </h2>
              </div>
              <div className="mt-10 grid gap-6 md:grid-cols-3">
                {[
                  {
                    step: "01",
                    title: "Capture",
                    detail: "Add a contact the moment you meet them. Notes stay attached.",
                  },
                  {
                    step: "02",
                    title: "Plan",
                    detail: "Drop follow-ups into your timeline and auto-surface them.",
                  },
                  {
                    step: "03",
                    title: "Advance",
                    detail: "Move deals through your pipeline with confidence.",
                  },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="rounded-2xl border border-border/70 bg-secondary/30 px-5 py-6"
                  >
                    <p className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
                      {item.step}
                    </p>
                    <h3 className="mt-3 text-lg font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section
            id="pricing"
            className="relative -mt-8 pt-20 pb-24 bg-[linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.55)_100%)]"
          >
            <div className="absolute inset-x-0 -top-20 h-20 pointer-events-none bg-[linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.35)_100%)] blur-2xl opacity-70" />
            <div className="relative px-6 lg:px-8 xl:px-10 max-w-5xl 2xl:max-w-6xl mx-auto">
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.3em] font-mono text-muted-foreground">
                  Pricing
                </p>
                <h2 className="mt-4 text-3xl lg:text-4xl font-semibold font-serif text-foreground">
                  Free to start, upgrades when you grow.
                </h2>
              </div>
              <div className="mt-10 grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-card/90 p-6 shadow-md">
                  <p className="text-sm font-mono uppercase tracking-[0.3em] text-muted-foreground">
                    Free
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-foreground">$0</p>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    <li>Local-only storage</li>
                    <li>Pipeline + follow-up tracking</li>
                    <li>Unlimited contacts and tasks</li>
                  </ul>
                  <Button className="mt-6 w-full" onClick={() => navigate("/app")}>
                    Use Figtree
                  </Button>
                </div>
                <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6 shadow-md">
                  <p className="text-sm font-mono uppercase tracking-[0.3em] text-primary">
                    Pro
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-foreground">Upgrade</p>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    <li>Automation and reminders</li>
                    <li>Smart follow-up suggestions</li>
                    <li>Team sharing (coming soon)</li>
                  </ul>
                  <Button variant="outline" className="mt-6 w-full" type="button">
                    Join the waitlist
                  </Button>
                </div>
              </div>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Your data stays on your device until you choose otherwise.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
