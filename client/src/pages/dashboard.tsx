import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AppCard } from "@/components/app-card";
import { AppPreview } from "@/components/app-preview";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { LayoutGrid, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { GeneratedApp } from "@shared/schema";

interface DashboardProps {
  onNewApp: () => void;
}

export default function Dashboard({ onNewApp }: DashboardProps) {
  const [previewApp, setPreviewApp] = useState<GeneratedApp | null>(null);
  const { toast } = useToast();

  const { data: apps, isLoading } = useQuery<GeneratedApp[]>({
    queryKey: ["/api/apps"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/apps/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/apps"] });
      toast({ title: "App deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete app", variant: "destructive" });
    },
  });

  if (previewApp) {
    return <AppPreview app={previewApp} onClose={() => setPreviewApp(null)} />;
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="dashboard-page">
      <div className="p-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <LayoutGrid className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold" data-testid="text-dashboard-title">My Apps</h1>
              <p className="text-sm text-muted-foreground">
                {apps?.length || 0} app{(apps?.length || 0) !== 1 ? "s" : ""} created
              </p>
            </div>
          </div>
          <Button onClick={onNewApp} data-testid="button-new-app">
            <Sparkles className="w-4 h-4 mr-2" />
            Build New App
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-2/3 mb-3" />
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="aspect-video w-full rounded-md mb-3" />
                <Skeleton className="h-3 w-1/3" />
              </Card>
            ))}
          </div>
        ) : apps && apps.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onOpen={setPreviewApp}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <LayoutGrid className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium mb-1">No apps yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Start building your first app using voice commands in your preferred language.
            </p>
            <Button onClick={onNewApp} data-testid="button-build-first-app">
              <Sparkles className="w-4 h-4 mr-2" />
              Build Your First App
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
