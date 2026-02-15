import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeneratedApp } from "@shared/schema";

interface AppPreviewProps {
  app: GeneratedApp;
  onClose: () => void;
}

export function AppPreview({ app, onClose }: AppPreviewProps) {
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" data-testid="app-preview-fullscreen">
      <div className="flex items-center justify-between gap-2 p-3 border-b bg-card">
        <h2 className="font-medium text-sm truncate" data-testid="text-preview-title">
          {app.title}
        </h2>
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-preview">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <iframe
          src={`/api/apps/${app.id}/serve`}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
          title={app.title}
        />
      </div>
    </div>
  );
}
