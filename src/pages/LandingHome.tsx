import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LandingMorph } from "@/components/LandingMorph";

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

  useEffect(() => {
    try {
      if (localStorage.getItem(HAS_USED_KEY) === "1") {
        navigate("/app", { replace: true });
      }
    } catch {
      // ignore storage errors
    }
  }, [navigate]);

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
          </div>
          <img
            src="/landing-logo.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 -translate-y-12 w-[190px] opacity-80 drop-shadow-[0_26px_60px_rgba(59,130,246,0.18)] sm:-translate-y-14 sm:w-[250px] md:-translate-y-18 md:w-[340px] lg:-translate-y-14 lg:w-[410px]"
          />
        </div>
      </section>
      <LandingMorph onComplete={markHasUsed} />
    </div>
  );
}
