import { useEffect, useRef, useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import { ThemeProvider, useTheme } from "next-themes";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { CRMProvider, useCRMContext } from "@/contexts/CRMContext";
import { useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SignInScreen } from "@/components/SignInScreen";
import { Button } from "@/components/ui/button";
import { AppThemeProvider, useAppTheme } from "@/contexts/AppThemeContext";
import type { AppTheme } from "@/contexts/AppThemeContext";
import { CommandPalette } from "@/components/CommandPalette";
import { AddCompanyDialog } from "@/components/AddCompanyDialog";
import { AddTaskWithContactDialog } from "@/components/AddTaskWithContactDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FirstTaskBanner } from "@/components/FirstTaskBanner";
import CloudSync from "@/components/CloudSync";
import FollowUpToday from "./pages/FollowUpToday";
import LandingHome from "./pages/LandingHome";
import Companies from "./pages/Companies";
import CompanyDetail from "./pages/CompanyDetail";
import CallMode from "./pages/CallMode";
import Pipeline from "./pages/Pipeline";
import Projects from "./pages/Projects";
import Eisenhower from "./pages/Eisenhower";
import Resources from "./pages/Resources";
import ProductDev from "./pages/ProductDev";
import BusinessModel from "./pages/BusinessModel";
import ContactDetail from "./pages/ContactDetail";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Brain from "./pages/Brain";

const queryClient = new QueryClient();
const APP_ENTRY_BANNER_KEY = "simplecrm_app_entry_banner_seen";
const THEME_MODE_KEY_PREFIX = "simplecrm_theme_mode_";

const getStoredThemeMode = (appTheme: AppTheme): "light" | "dark" | null => {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(`${THEME_MODE_KEY_PREFIX}${appTheme}`);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
};

const setStoredThemeMode = (appTheme: AppTheme, mode: "light" | "dark") => {
  try {
    localStorage.setItem(`${THEME_MODE_KEY_PREFIX}${appTheme}`, mode);
  } catch {
    // ignore storage errors
  }
};

/** Old person links (/contacts/:id) open the person's company. */
function ContactRedirect() {
  const { id } = useParams<{ id: string }>();
  const { contacts } = useCRMContext();
  const contact = contacts.find((item) => item.id === id);
  if (contact?.companyId) return <Navigate to={`/companies/${contact.companyId}`} replace />;
  return contact ? <ContactDetail /> : <Navigate to="/companies" replace />;
}

function LoadingScreen() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label="Loading" />
    </div>
  );
}

function AppContent() {
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLDivElement | null>(null);
  const { appTheme } = useAppTheme();
  const { theme, setTheme } = useTheme();
  const previousAppThemeRef = useRef<AppTheme | null>(null);
  const {
    dataStatus,
    reloadData,
    showFirstTaskBanner,
    dismissFirstTaskBanner,
    firstActionSeen,
    firstActionNudgeDismissed,
    dismissFirstActionNudge,
  } = useCRMContext();
  const { session, status: authStatus } = useAuth();
  const [showLearnMoreNudge, setShowLearnMoreNudge] = useState(false);
  const [showAppEntryBanner, setShowAppEntryBanner] = useState(false);
  const hasUsed = (() => {
    try {
      return localStorage.getItem("simplecrm_has_used") === "1";
    } catch {
      return false;
    }
  })();
  const marketingParam = new URLSearchParams(location.search).get("marketing") === "1";
  const isMarketing = location.pathname === "/marketing" || (location.pathname === "/" && marketingParam);
  // Public pages render without the app shell or sign-in.
  const isLanding =
    isMarketing || location.pathname === "/privacy" || (location.pathname === "/" && !hasUsed);
  // The app itself needs a signed-in user and their data loaded from Supabase.
  const appGate = (() => {
    if (isLanding) return null;
    if (authStatus === "loading") return <LoadingScreen />;
    if (!session) return <SignInScreen />;
    if (dataStatus === "loading") return <LoadingScreen />;
    if (dataStatus === "error") {
      return (
        <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="font-medium text-foreground">Couldn't load your data.</p>
          <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button onClick={() => reloadData()}>Retry</Button>
        </div>
      );
    }
    return null;
  })();
  const showAppChrome = !isLanding && !appGate;
  const mobileTitle = (() => {
    const path = location.pathname;
    if (path === "/app" || path === "/") return "Tasks";
    if (path.startsWith("/companies/")) return "Company";
    if (path.startsWith("/companies") || path.startsWith("/contacts")) return "Companies";
    if (path.startsWith("/pipeline")) return "Pipeline";
    if (path.startsWith("/calls")) return "Call Mode";
    if (path.startsWith("/projects")) return "Projects";
    if (path.startsWith("/product-dev")) return "Product Dev";
    if (path.startsWith("/revenue")) return "Revenue";
    if (path.startsWith("/eisenhower")) return "Easy Eisenhower";
    if (path.startsWith("/resources")) return "Resources";
    if (path.startsWith("/brain")) return "Company Brain";
    if (path.startsWith("/settings")) return "Settings";
    return "Figtree";
  })();

  useEffect(() => {
    const body = document.body;
    const shouldApplyApple = appTheme === "apple" && !isLanding;
    const shouldApplySolarized = appTheme === "solarized" && !isLanding;
    if (shouldApplyApple) {
      body.classList.add("app-theme-apple");
    } else {
      body.classList.remove("app-theme-apple");
    }
    if (shouldApplySolarized) {
      body.classList.add("app-theme-solarized");
    } else {
      body.classList.remove("app-theme-solarized");
    }
  }, [appTheme, isLanding, theme]);

  useEffect(() => {
    if (isLanding) return;
    const previous = previousAppThemeRef.current;
    if (previous !== appTheme) {
      const storedMode = getStoredThemeMode(appTheme);
      if (storedMode && storedMode !== theme) {
        setTheme(storedMode);
      }
      previousAppThemeRef.current = appTheme;
    }
  }, [appTheme, isLanding, setTheme, theme]);

  useEffect(() => {
    if (isLanding) return;
    if (theme === "light" || theme === "dark") {
      setStoredThemeMode(appTheme, theme);
    }
  }, [appTheme, isLanding, theme]);

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

  useEffect(() => {
    if (isLanding) {
      setShowAppEntryBanner(false);
      return;
    }
    try {
      const hasSeen = localStorage.getItem(APP_ENTRY_BANNER_KEY) === "1";
      setShowAppEntryBanner(!hasSeen);
    } catch {
      setShowAppEntryBanner(false);
    }
  }, [isLanding]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (isLanding || location.pathname.startsWith("/eisenhower")) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [isLanding, location.pathname, location.search]);

  return (
    <>
      <CommandPalette 
        onAddContact={() => setAddContactOpen(true)} 
        onAddTask={() => setAddTaskOpen(true)}
      />
      <CloudSync />
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          {showAppChrome && <AppSidebar />}
          <main
            ref={mainRef}
            className={`flex-1 overflow-auto ${showAppChrome ? 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0' : ''}`}
          >
            {!isLanding && (
              <header className="h-14 border-b border-border flex items-center px-6 md:px-4 gap-3">
                {showAppChrome && <SidebarTrigger className="h-9 w-9 ml-2 hidden md:inline-flex" />}
                <div className="sm:hidden flex-1">
                  <span className="text-base font-semibold tracking-tight text-primary">{mobileTitle}</span>
                </div>
                <div className="ml-auto">
                  <ThemeToggle />
                </div>
              </header>
            )}
            {appGate ?? (
              <Routes>
                <Route path="/" element={<LandingHome />} />
                <Route path="/marketing" element={<LandingHome />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/app" element={<FollowUpToday />} />
                <Route path="/companies" element={<Companies />} />
                <Route path="/companies/:id" element={<CompanyDetail />} />
                <Route path="/contacts" element={<Navigate to="/companies" replace />} />
                <Route path="/contacts/:id" element={<ContactRedirect />} />
                <Route path="/pipeline" element={<Pipeline />} />
                <Route path="/calls" element={<CallMode />} />
                <Route path="/outreach" element={<Navigate to="/calls" replace />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/dream-clients" element={<Navigate to="/companies" replace />} />
                <Route path="/planning" element={<Navigate to="/companies" replace />} />
                <Route path="/product-dev" element={<ProductDev />} />
                <Route path="/revenue" element={<BusinessModel />} />
                <Route path="/business-model" element={<Navigate to="/revenue" replace />} />
                <Route path="/eisenhower" element={<Eisenhower />} />
                <Route path="/resources" element={<Resources />} />
                <Route path="/brain" element={<Brain />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            )}
          </main>
        </div>
      </SidebarProvider>
      {showAppChrome && <MobileBottomNav />}
      {/* Hidden dialogs for command palette */}
      <AddCompanyDialog open={addContactOpen} onOpenChange={setAddContactOpen} triggerless />
      <AddTaskWithContactDialog open={addTaskOpen} onOpenChange={setAddTaskOpen} triggerless />
      {showAppChrome && showFirstTaskBanner && (
        <FirstTaskBanner
          onDismiss={dismissFirstTaskBanner}
          title="✅ Nice – first task done."
          description="Everything is saved on your device."
          actionLabel="Add your next contact →"
          onAction={() => setAddContactOpen(true)}
          autoCloseMs={8000}
        />
      )}
      {showAppChrome && !showFirstTaskBanner && showLearnMoreNudge && (
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
      {showAppChrome && !showFirstTaskBanner && !showLearnMoreNudge && showAppEntryBanner && (
        <FirstTaskBanner
          onDismiss={() => {
            try {
              localStorage.setItem(APP_ENTRY_BANNER_KEY, "1");
            } catch {
              // ignore storage errors
            }
            setShowAppEntryBanner(false);
          }}
          title="You’re in the full app now."
          description="No signup, no strings attached."
          actionLabel="Add your first task →"
          onAction={() => {
            try {
              localStorage.setItem(APP_ENTRY_BANNER_KEY, "1");
            } catch {
              // ignore storage errors
            }
            setShowAppEntryBanner(false);
            setAddTaskOpen(true);
          }}
          icon="✅"
          autoCloseMs={12000}
        />
      )}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AppThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <CRMProvider>
                <AppContent />
              </CRMProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </AppThemeProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
