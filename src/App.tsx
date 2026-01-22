import { useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { CRMProvider } from "@/contexts/CRMContext";
import { CommandPalette } from "@/components/CommandPalette";
import { AddContactDialog } from "@/components/AddContactDialog";
import { AddTaskWithContactDialog } from "@/components/AddTaskWithContactDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import FollowUpToday from "./pages/FollowUpToday";
import Contacts from "./pages/Contacts";
import Pipeline from "./pages/Pipeline";
import Planning from "./pages/Planning";
import Reminders from "./pages/Reminders";
import ContactDetail from "./pages/ContactDetail";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);

  return (
    <>
      <CommandPalette 
        onAddContact={() => setAddContactOpen(true)} 
        onAddTask={() => setAddTaskOpen(true)}
      />
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <main className="flex-1 overflow-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
            <header className="h-14 border-b border-border flex items-center justify-between px-4">
              <SidebarTrigger className="h-9 w-9 ml-2 hidden md:inline-flex" />
              <ThemeToggle />
            </header>
            <Routes>
              <Route path="/" element={<FollowUpToday />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/contacts/:id" element={<ContactDetail />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/planning" element={<Planning />} />
              <Route path="/reminders" element={<Reminders />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </SidebarProvider>
      <MobileBottomNav />
      {/* Hidden dialogs for command palette */}
      <AddContactDialog open={addContactOpen} onOpenChange={setAddContactOpen} triggerless />
      <AddTaskWithContactDialog open={addTaskOpen} onOpenChange={setAddTaskOpen} triggerless />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
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
