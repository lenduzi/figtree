import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LandingMorph } from "@/components/LandingMorph";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CalendarCheck, Cloud, Kanban, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import figtreeLogo from "@/assets/figtree-logo.png";

const HAS_USED_KEY = "simplecrm_has_used";
const FEEDBACK_EMAIL = "lennhahn@gmail.com";

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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackContact, setFeedbackContact] = useState("");
  const [feedbackName, setFeedbackName] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

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

  const feedbackBody = useMemo(() => {
    const lines = [];
    if (feedbackMessage.trim()) {
      lines.push(`Feedback: ${feedbackMessage.trim()}`);
    }
    if (feedbackName.trim()) {
      lines.push(`Name: ${feedbackName.trim()}`);
    }
    if (feedbackContact.trim()) {
      lines.push(`Contact: ${feedbackContact.trim()}`);
    }
    return lines.join("\n");
  }, [feedbackContact, feedbackMessage, feedbackName]);

  const feedbackMailto = useMemo(() => {
    const subject = encodeURIComponent("Figtree feedback");
    const body = encodeURIComponent(
      feedbackBody || "Feedback: (write your request here)\nContact: (optional)",
    );
    return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
  }, [feedbackBody]);

  const handleSendFeedback = () => {
    if (!feedbackMessage.trim()) return;
    window.location.href = feedbackMailto;
  };

  const handleCopyFeedback = async () => {
    if (!feedbackBody.trim() || !navigator?.clipboard?.writeText) {
      setCopyStatus("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(feedbackBody);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = window.setTimeout(() => {
      setCopyStatus("idle");
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  return (
    <div>
      <section className="relative bg-background">
        <div className="relative px-6 lg:px-8 xl:px-10 pt-16 lg:pt-20 xl:pt-24 pb-16 lg:pb-20 max-w-5xl 2xl:max-w-6xl mx-auto">
          <div className={`relative z-10 ${isMarketing ? "text-center" : "text-center"}`}>
            <div className={isMarketing ? "max-w-5xl mx-auto" : ""}>
              <h1 className="text-3xl lg:text-5xl font-semibold text-foreground">
                A lightweight CRM for your solo startup
              </h1>
              <p className={`mt-6 text-muted-foreground lg:text-lg ${isMarketing ? "mx-auto max-w-2xl" : "mx-auto max-w-2xl"}`}>
                I wanted a simple CRM that was free, so I built Figtree. You can use it for free too.
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
              {isMarketing && (
                <p className="mt-4 text-xs text-muted-foreground">
                  No signup ♡ Absolutely free ♡ Start immediately
                </p>
              )}
            </div>
            {isMarketing && (
              <div className="mt-10 lg:mt-12 flex justify-center">
                <div className="relative w-full max-w-3xl">
                  <img
                    src="/favicon.png"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-10 -top-12 w-24 opacity-35 blur-[1px]"
                  />
                  <img
                    src="/landing-logo.png"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-16 -bottom-14 w-48 opacity-25"
                  />
                  <Card className="relative z-10 w-full overflow-hidden border-border/60 bg-card/95 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/40">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4 text-left">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Follow-Up Today</p>
                          <p className="text-xs text-muted-foreground">1 action item needs attention</p>
                        </div>
                        <Badge variant="secondary">Today</Badge>
                      </div>
                      <div className="mt-4 space-y-3 text-left">
                        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">Send intro to Kaya</p>
                            <p className="text-xs text-muted-foreground">Seed • Due today</p>
                          </div>
                          <span className="h-3 w-3 rounded-full border border-muted-foreground/50" />
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background px-3 py-2">
                          <p className="text-sm font-medium text-foreground">Pipeline snapshot</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="outline">Lead · 4</Badge>
                            <Badge variant="outline">Call · 2</Badge>
                            <Badge variant="outline">Close · 1</Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
          {!isMarketing && (
            <img
              src="/landing-logo.png"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 -translate-y-12 w-[190px] opacity-80 drop-shadow-[0_26px_60px_rgba(59,130,246,0.18)] sm:-translate-y-14 sm:w-[250px] md:-translate-y-18 md:w-[340px] lg:-translate-y-14 lg:w-[410px]"
            />
          )}
        </div>
        {isMarketing && (
          <div className="pointer-events-none absolute inset-x-0 -bottom-10 h-20 bg-[linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.35)_100%)] blur-2xl opacity-80" />
        )}
      </section>
      {!isMarketing && <LandingMorph onComplete={handleComplete} mode="app" />}

      {isMarketing && (
        <>
          <section className="relative -mt-10 pt-24 pb-28 overflow-hidden bg-[radial-gradient(circle_at_top,_hsl(var(--accent))_0%,_hsl(var(--background))_65%)]">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-x-0 -top-20 h-24 bg-[linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.35)_100%)] blur-2xl opacity-80" />
              <div className="absolute right-0 top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute left-12 bottom-12 h-48 w-48 rounded-full bg-emerald-300/10 blur-3xl" />
              <div className="absolute inset-x-0 -bottom-12 h-16 bg-[linear-gradient(180deg,_hsl(var(--accent)/0.25)_0%,_hsl(var(--background))_100%)] blur-2xl opacity-80" />
            </div>
            <div className="relative px-6 lg:px-8 xl:px-10 max-w-5xl 2xl:max-w-6xl mx-auto">
              <div className="max-w-2xl">
                <h2 className="text-3xl lg:text-4xl font-semibold text-foreground">
                  Stay consistent without the admin tax.
                </h2>
                <p className="mt-3 text-muted-foreground lg:text-lg">
                  Figtree is built for daily follow-ups. It keeps the workflow light while making sure nothing slips.
                </p>
              </div>
              <div className="mt-10 grid gap-6 md:grid-cols-2">
                {[
                  {
                    title: "Never miss a follow-up",
                    detail: "A daily list that surfaces exactly who needs attention.",
                    icon: CalendarCheck,
                  },
                  {
                    title: "Know what matters today",
                    detail: "Quick Actions (⌘K) gets you to the right record fast.",
                    icon: Sparkles,
                  },
                  {
                    title: "Move deals forward",
                    detail: "A lightweight pipeline that stays out of your way.",
                    icon: Kanban,
                  },
                  {
                    title: "Zero setup, zero admin",
                    detail: "No accounts, no complex fields, no busywork.",
                    icon: ShieldCheck,
                  },
                ].map((item) => (
                  <Card key={item.title} className="border-border/60 bg-card/90">
                    <CardContent className="flex items-start gap-4 p-6">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary/70 text-foreground">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section className="relative py-20 bg-background">
            <div className="pointer-events-none absolute inset-x-0 -top-10 h-16 bg-[linear-gradient(180deg,_hsl(var(--accent)/0.35)_0%,_transparent_100%)] blur-2xl opacity-70" />
            <div className="px-6 lg:px-8 xl:px-10 max-w-4xl mx-auto">
              <Card className="rounded-[28px] border-border/60 bg-card/95 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                <CardContent className="p-10 md:p-12">
                  <div className="flex flex-col gap-5 md:flex-row md:items-start">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={figtreeLogo} alt="Figtree" />
                      <AvatarFallback>F</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-base md:text-lg text-foreground leading-relaxed">
                        I needed a lightweight CRM that stores my contact data and reminds me of To Dos. Building Figtree cost me nothing, so I want you to have it for free, too. Got a feature request? Tell me and I’ll build it :)
                      </p>
                      <p className="mt-3 text-sm text-muted-foreground">— Lenny, Chief Figtree Officer</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="relative py-20 bg-background">
            <div className="pointer-events-none absolute inset-x-0 -top-10 h-16 bg-[linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.3)_100%)] blur-2xl opacity-70" />
            <div className="px-6 lg:px-8 xl:px-10 max-w-5xl 2xl:max-w-6xl mx-auto">
              <Card className="border-primary/25 bg-primary/5">
                <CardContent className="p-10">
                  <div className="flex flex-col gap-2">
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        Local-first by default.
                      </p>
                      <p className="text-muted-foreground">
                        Your data stays on your device unless you decide otherwise.
                      </p>
                    </div>
                  </div>
                  <Separator className="my-8" />
                  <div className="grid gap-4 md:grid-cols-3 text-sm text-muted-foreground">
                    <div>
                      <p className="font-semibold text-foreground">Private</p>
                      <p>No accounts. No surprise syncs.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Export anytime</p>
                      <p>You own your data and can back it up.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Upgrade only if you want</p>
                      <p>One-time unlock for cloud backup when ready.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section
            id="pricing"
            className="relative -mt-8 pt-24 pb-28 bg-[linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.55)_100%)]"
          >
            <div className="absolute inset-x-0 -top-20 h-20 pointer-events-none bg-[linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.35)_100%)] blur-2xl opacity-70" />
            <div className="absolute inset-x-0 -bottom-12 h-16 pointer-events-none bg-[linear-gradient(180deg,_hsl(var(--accent)/0.35)_0%,_hsl(var(--background))_100%)] blur-2xl opacity-70" />
            <div className="relative px-6 lg:px-8 xl:px-10 max-w-5xl 2xl:max-w-6xl mx-auto">
              <div className="text-center">
                <h2 className="text-3xl lg:text-4xl font-semibold text-foreground">
                  Free for local use. Upgrade once for backup.
                </h2>
              </div>
              <div className="mt-10 grid gap-6 lg:grid-cols-2">
                <Card className="border-border/70 bg-card/95">
                  <CardHeader>
                    <CardTitle className="text-2xl">Free</CardTitle>
                    <CardDescription>Local-only CRM, zero setup.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-semibold text-foreground">€0</p>
                    <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                      <li>No account required</li>
                      <li>Works offline</li>
                      <li>Export anytime</li>
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full" onClick={() => navigate("/app")}>
                      Use Figtree
                    </Button>
                  </CardFooter>
                </Card>
                <Card className="border-primary/40 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-2xl">Lifetime Backup</CardTitle>
                    <CardDescription>One-time purchase, forever access.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-semibold text-foreground">€19</p>
                    <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Cloud className="h-4 w-4 text-primary" />
                        Cloud backup when available
                      </li>
                      <li>One-time payment (no subscription)</li>
                      <li>Priority feedback access</li>
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button variant="outline" className="w-full" type="button">
                      Upgrade when ready
                    </Button>
                  </CardFooter>
                </Card>
              </div>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Local-first by default. Upgrade only if you want cloud backup.
              </p>
            </div>
          </section>

          <section id="feedback" className="relative py-24 bg-background">
            <div className="pointer-events-none absolute inset-x-0 -top-10 h-16 bg-[linear-gradient(180deg,_hsl(var(--accent)/0.3)_0%,_transparent_100%)] blur-2xl opacity-70" />
            <div className="px-6 lg:px-8 xl:px-10 max-w-5xl 2xl:max-w-6xl mx-auto">
              <Card className="border-border/60 bg-[linear-gradient(120deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.5)_100%)]">
                <CardContent className="p-10 md:p-12">
                  <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                    <div className="max-w-xl">
                      <h3 className="text-2xl font-semibold text-foreground">
                        I love feedback! Tell me what you need.
                      </h3>
                      <p className="mt-2 text-muted-foreground">
                        Feature requests, workflow ideas, love letters – I read every note.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button onClick={() => setFeedbackOpen(true)}>
                        <MessageCircle className="h-4 w-4" />
                        Share feedback
                      </Button>
                      <Button variant="outline" asChild>
                        <a href={feedbackMailto}>Email me</a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="relative pb-28 bg-background">
            <div className="pointer-events-none absolute inset-x-0 -top-10 h-16 bg-[linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(var(--accent)/0.2)_100%)] blur-2xl opacity-70" />
            <div className="px-6 lg:px-8 xl:px-10 max-w-5xl 2xl:max-w-6xl mx-auto">
              <div className="text-center">
                <h2 className="text-3xl font-semibold text-foreground">Quick answers</h2>
              </div>
              <Accordion type="single" collapsible className="mt-8">
                <AccordionItem value="data">
                  <AccordionTrigger>Where is my data stored?</AccordionTrigger>
                  <AccordionContent>
                    Everything lives in your browser by default. No account, no server storage until you
                    upgrade for cloud backup.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="backup">
                  <AccordionTrigger>What if I clear my browser data?</AccordionTrigger>
                  <AccordionContent>
                    Clearing browser data will remove your local CRM data. Use the export/import option
                    regularly if you want a backup.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="upgrade">
                  <AccordionTrigger>What does the €19 upgrade unlock?</AccordionTrigger>
                  <AccordionContent>
                    One-time access to cloud backup (when available), plus priority feedback access. It’s a
                    one-time purchase, not a subscription.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="figtree">
                  <AccordionTrigger>Wth is a Figtree?</AccordionTrigger>
                  <AccordionContent>
                    It’s the name of the font used here — got the inspo from it.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </section>

          <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Share feedback</DialogTitle>
                <DialogDescription>
                  Tell me what you need. I read every message and follow up when I can.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="feedback-message">What should I build next?</Label>
                  <Textarea
                    id="feedback-message"
                    value={feedbackMessage}
                    onChange={(event) => setFeedbackMessage(event.target.value)}
                    placeholder="Feature request, workflow pain, or a quick thought..."
                    className="min-h-[140px]"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="feedback-name">Name (optional)</Label>
                  <Input
                    id="feedback-name"
                    value={feedbackName}
                    onChange={(event) => setFeedbackName(event.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="feedback-contact">Best way to reach you (optional)</Label>
                  <Input
                    id="feedback-contact"
                    value={feedbackContact}
                    onChange={(event) => setFeedbackContact(event.target.value)}
                    placeholder="Email or phone"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" type="button" onClick={handleCopyFeedback}>
                  {copyStatus === "copied" ? "Copied" : "Copy message"}
                </Button>
                <Button onClick={handleSendFeedback} disabled={!feedbackMessage.trim()}>
                  Send via email
                </Button>
              </DialogFooter>
              {copyStatus === "failed" && (
                <p className="text-xs text-muted-foreground">
                  Copy failed — you can still send via email or manually copy from the text above.
                </p>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
