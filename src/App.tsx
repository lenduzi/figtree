import { useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CRMProvider } from "@/contexts/CRMContext";
import { CommandPalette } from "@/components/CommandPalette";
import { AddContactDialog } from "@/components/AddContactDialog";
import FollowUpToday from "./pages/FollowUpToday";
import Contacts from "./pages/Contacts";
import Pipeline from "./pages/Pipeline";
import Reminders from "./pages/Reminders";
import ContactDetail from "./pages/ContactDetail";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  const [addContactOpen, setAddContactOpen] = useState(false);

  return (
    <>
      <CommandPalette onAddContact={() => setAddContactOpen(true)} />
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <main className="flex-1 overflow-auto">
            <header className="h-14 border-b border-border flex items-center px-4 gap-2">
              <SidebarTrigger className="h-9 w-9 ml-2" />
            </header>
            <Routes>
              <Route path="/" element={<FollowUpToday />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/contacts/:id" element={<ContactDetail />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/reminders" element={<Reminders />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </SidebarProvider>
      {/* Hidden trigger for command palette */}
      <AddContactDialog open={addContactOpen} onOpenChange={setAddContactOpen} triggerless />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <CRMProvider>
          <AppContent />
        </CRMProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
