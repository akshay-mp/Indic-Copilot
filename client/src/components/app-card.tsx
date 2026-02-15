import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Maximize2, Trash2, Calendar } from "lucide-react";
import type { GeneratedApp } from "@shared/schema";
import { getLanguageName } from "@/lib/languages";

interface AppCardProps {
  app: GeneratedApp;
  onOpen: (app: GeneratedApp) => void;
  onDelete: (id: number) => void;
}

export function AppCard({ app, onOpen, onDelete }: AppCardProps) {
  return (
    <Card
      className="group relative overflow-visible hover-elevate cursor-pointer"
      data-testid={`card-app-${app.id}`}
    >
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3
              className="font-medium text-sm truncate"
              data-testid={`text-app-title-${app.id}`}
            >
              {app.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {app.description}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {getLanguageName(app.language).split(" (")[0]}
          </Badge>
        </div>
        <div className="aspect-video bg-muted rounded-md overflow-hidden border border-border">
          <iframe
            srcDoc={app.htmlContent}
            className="w-full h-full pointer-events-none"
            sandbox="allow-scripts"
            title={app.title}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(app.createdAt).toLocaleDateString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(app.id);
              }}
              data-testid={`button-delete-app-${app.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onOpen(app)}
              data-testid={`button-open-app-${app.id}`}
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
