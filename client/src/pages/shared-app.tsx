import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Maximize2, Minimize2, ArrowLeft } from "lucide-react";

interface SharedAppPageProps {
  shareId: string;
}

export default function SharedAppPage({ shareId }: SharedAppPageProps) {
  const [app, setApp] = useState<{ id: number; title: string; description: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    fetch(`/api/shared/${shareId}`)
      .then((r) => {
        if (!r.ok) throw new Error("App not found");
        return r.json();
      })
      .then(setApp)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [shareId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <h1 className="text-xl font-semibold">App not found</h1>
        <p className="text-muted-foreground">This shared app may have been removed or the link is invalid.</p>
        <Button variant="outline" onClick={() => (window.location.href = "/")} data-testid="button-go-home">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go to Indian
        </Button>
      </div>
    );
  }

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <div className="absolute top-2 right-2 z-10">
          <Button size="icon" variant="outline" onClick={() => setFullscreen(false)} data-testid="button-exit-fullscreen">
            <Minimize2 className="w-4 h-4" />
          </Button>
        </div>
        <iframe
          src={`/api/shared/${shareId}/serve`}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-forms allow-same-origin"
          title={app.title}
          data-testid="iframe-shared-app"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between gap-2 p-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="font-semibold text-sm truncate" data-testid="text-shared-app-title">{app.title}</h1>
          <span className="text-xs text-muted-foreground">via Indian</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => setFullscreen(true)} data-testid="button-fullscreen">
            <Maximize2 className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = "/")} data-testid="button-try-copilot">
            Try Indian
          </Button>
        </div>
      </header>
      <main className="flex-1">
        <iframe
          src={`/api/shared/${shareId}/serve`}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-forms allow-same-origin"
          title={app.title}
          data-testid="iframe-shared-app"
        />
      </main>
    </div>
  );
}
