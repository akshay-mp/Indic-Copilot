import { useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import Builder from "@/pages/builder";
import Dashboard from "@/pages/dashboard";

function AppContent() {
  const [activePage, setActivePage] = useState("builder");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);

  const handleNavigate = (page: string) => {
    setActivePage(page);
    if (page !== "builder") {
      setActiveConversationId(null);
    }
  };

  const handleSelectConversation = (id: number) => {
    setActivePage("builder");
    setActiveConversationId(id);
  };

  const handleNewConversation = () => {
    setActivePage("builder");
    setActiveConversationId(null);
  };

  const handleConversationCreated = (id: number) => {
    setActiveConversationId(id);
  };

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar
          activePage={activePage}
          activeConversationId={activeConversationId}
          onNavigate={handleNavigate}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
        />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-2 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-hidden">
            {activePage === "builder" && (
              <Builder
                conversationId={activeConversationId}
                onConversationCreated={handleConversationCreated}
                onNavigateToDashboard={() => handleNavigate("dashboard")}
              />
            )}
            {activePage === "dashboard" && (
              <Dashboard onNewApp={handleNewConversation} />
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
