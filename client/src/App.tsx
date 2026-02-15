import { useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import Builder from "@/pages/builder";
import Dashboard from "@/pages/dashboard";
import AuthPage from "@/pages/auth";
import SharedAppPage from "@/pages/shared-app";
import { Loader2 } from "lucide-react";

function getSharedId(): string | null {
  const match = window.location.pathname.match(/^\/shared\/([^/]+)/);
  return match ? match[1] : null;
}

function AppContent() {
  const sharedId = getSharedId();

  if (sharedId) {
    return <SharedAppPage shareId={sharedId} />;
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();
  const [activePage, setActivePage] = useState("builder");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

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
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
