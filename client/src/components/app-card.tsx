import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Maximize2, Trash2, Calendar, Share2, Copy, Check, ExternalLink } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import type { GeneratedApp } from "@shared/schema";
import { getLanguageName } from "@/lib/languages";
import { useToast } from "@/hooks/use-toast";

interface AppCardProps {
  app: GeneratedApp;
  onOpen: (app: GeneratedApp) => void;
  onDelete: (id: number) => void;
}

export function AppCard({ app, onOpen, onDelete }: AppCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareId, setShareId] = useState<string | null>(app.shareId || null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const shareMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/apps/${app.id}/share`);
      return res.json();
    },
    onSuccess: (data: { shareId: string }) => {
      setShareId(data.shareId);
      queryClient.invalidateQueries({ queryKey: ["/api/apps"] });
    },
  });

  const unshareMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/apps/${app.id}/share`);
    },
    onSuccess: () => {
      setShareId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/apps"] });
      toast({ title: "Sharing disabled" });
    },
  });

  const handleShare = () => {
    if (shareId) {
      setShowShareDialog(true);
    } else {
      shareMutation.mutate(undefined, {
        onSuccess: () => setShowShareDialog(true),
      });
    }
  };

  const shareUrl = shareId ? `${window.location.origin}/shared/${shareId}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link copied" });
  };

  const shareWhatsApp = () => {
    const text = `Check out "${app.title}" - built with Indian!\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <>
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
                  handleShare();
                }}
                data-testid={`button-share-app-${app.id}`}
              >
                <Share2 className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
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

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-delete-confirm-title">Delete App</AlertDialogTitle>
            <AlertDialogDescription data-testid="text-delete-confirm-description">
              Are you sure you want to delete "{app.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(app.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="text-share-title">Share "{app.title}"</DialogTitle>
            <DialogDescription>
              Anyone with this link can view and use your app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="flex-1"
                data-testid="input-share-url"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={copyLink}
                data-testid="button-copy-link"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={shareWhatsApp}
                data-testid="button-share-whatsapp"
              >
                <SiWhatsapp className="w-4 h-4 mr-2" />
                Share on WhatsApp
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.open(shareUrl, "_blank")}
                data-testid="button-open-shared"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open App
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-full text-destructive"
              onClick={() => {
                unshareMutation.mutate();
                setShowShareDialog(false);
              }}
              data-testid="button-disable-sharing"
            >
              Disable Sharing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
