import { useEffect, useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { CRMProvider, useCRMContext } from "@/contexts/CRMContext";
import { CommandPalette } from "@/components/CommandPalette";
import { AddContactDialog } from "@/components/AddContactDialog";
import { AddTaskWithContactDialog } from "@/components/AddTaskWithContactDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FirstTaskBanner } from "@/components/FirstTaskBanner";
import FollowUpToday from "./pages/FollowUpToday";
import LandingHome from "./pages/LandingHome";
import Contacts from "./pages/Contacts";
import Pipeline from "./pages/Pipeline";
import Planning from "./pages/Planning";
import Resources from "./pages/Resources";
import ContactDetail from "./pages/ContactDetail";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const {
    showFirstTaskBanner,
    dismissFirstTaskBanner,
    firstActionSeen,
    firstActionNudgeDismissed,
    dismissFirstActionNudge,
  } = useCRMContext();
  const [showLearnMoreNudge, setShowLearnMoreNudge] = useState(false);
  const hasUsed = (() => {
    try {
      return localStorage.getItem("simplecrm_has_used") === "1";
    } catch {
      return false;
    }
  })();
  const marketingParam = new URLSearchParams(location.search).get("marketing") === "1";
  const isMarketing = location.pathname === "/marketing" || (location.pathname === "/" && marketingParam);
  const isLanding = isMarketing || (location.pathname === "/" && !hasUsed);
  const mobileTitle = (() => {
    const path = location.pathname;
    if (path === "/app" || path === "/") return "Tasks";
    if (path.startsWith("/contacts/")) return "Contact";
    if (path.startsWith("/contacts")) return "Contacts";
    if (path.startsWith("/pipeline")) return "Pipeline";
    if (path.startsWith("/planning")) return "Plan";
    if (path.startsWith("/resources")) return "Resources";
    if (path.startsWith("/settings")) return "Settings";
    return "Figtree";
  })();

  useEffect(() => {
    if (isLanding || firstActionSeen || firstActionNudgeDismissed) {
      setShowLearnMoreNudge(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShowLearnMoreNudge(true);
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [firstActionNudgeDismissed, firstActionSeen, isLanding]);

  return (
    <>
      <CommandPalette 
        onAddContact={() => setAddContactOpen(true)} 
        onAddTask={() => setAddTaskOpen(true)}
      />
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          {!isLanding && <AppSidebar />}
          <main className={`flex-1 overflow-auto ${isLanding ? '' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0'}`}>
            {!isLanding && (
              <header className="h-14 border-b border-border flex items-center px-4 gap-3">
                <SidebarTrigger className="h-9 w-9 ml-2 hidden md:inline-flex" />
                <div className="sm:hidden flex-1">
                  <span className="text-sm font-semibold text-foreground">{mobileTitle}</span>
                </div>
                <div className="ml-auto">
                  <ThemeToggle />
                </div>
              </header>
            )}
            <Routes>
              <Route path="/" element={<LandingHome />} />
              <Route path="/marketing" element={<LandingHome />} />
              <Route path="/app" element={<FollowUpToday />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/contacts/:id" element={<ContactDetail />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/planning" element={<Planning />} />
              <Route path="/resources" element={<Resources />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </SidebarProvider>
      {!isLanding && <MobileBottomNav />}
      {/* Hidden dialogs for command palette */}
      <AddContactDialog open={addContactOpen} onOpenChange={setAddContactOpen} triggerless />
      <AddTaskWithContactDialog open={addTaskOpen} onOpenChange={setAddTaskOpen} triggerless />
      {!isLanding && showFirstTaskBanner && (
        <FirstTaskBanner
          onDismiss={dismissFirstTaskBanner}
          title="✅ Nice – first task done."
          description="Everything is saved on your device."
          actionLabel="Add your next contact →"
          onAction={() => setAddContactOpen(true)}
          autoCloseMs={8000}
        />
      )}
      {!isLanding && !showFirstTaskBanner && showLearnMoreNudge && (
        <FirstTaskBanner
          onDismiss={() => {
            dismissFirstActionNudge();
            setShowLearnMoreNudge(false);
          }}
          title="Need more context before you start?"
          description="See how Figtree works, pricing, and privacy."
          actionLabel="Learn more →"
          onAction={() => {
            dismissFirstActionNudge();
            setShowLearnMoreNudge(false);
            navigate("/marketing");
          }}
          icon="ℹ️"
          autoCloseMs={8000}
        />
      )}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <CRMProvider>
            <AppContent />
          </CRMProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
