import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User, Volume2, Code, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  onSpeak?: (text: string) => void;
  isSpeaking?: boolean;
  onViewDashboard?: () => void;
}

function isHtmlContent(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    (trimmed.includes("<html") && trimmed.includes("<body") && trimmed.includes("<head")) ||
    (trimmed.includes("<web_app>") && trimmed.includes("<file"))
  );
}

export function ChatMessage({ role, content, onSpeak, isSpeaking, onViewDashboard }: ChatMessageProps) {
  const isUser = role === "user";
  const isHtml = !isUser && isHtmlContent(content);

  if (isHtml) {
    return (
      <div className="flex gap-3 py-4 px-3 flex-row" data-testid="message-app-code">
        <Avatar className="shrink-0">
          <AvatarFallback className="bg-muted text-muted-foreground">
            <Bot className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
        <Card className="flex-1 p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Code className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">App Generated</span>
            <Badge variant="secondary">HTML</Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Your app has been built successfully!
          </p>
          {onViewDashboard && (
            <Button
              size="sm"
              variant="outline"
              onClick={onViewDashboard}
              className="gap-1"
              data-testid="button-view-dashboard"
            >
              <ExternalLink className="w-3 h-3" />
              View in Dashboard
            </Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3 py-4 px-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
      data-testid={`message-${role}`}
    >
      <Avatar className="shrink-0">
        <AvatarFallback
          className={cn(
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "flex flex-col gap-1 max-w-[80%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-md px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-card-border"
          )}
        >
          {content}
        </div>
        {!isUser && onSpeak && (
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={() => onSpeak(content)}
            data-testid="button-speak-message"
          >
            <Volume2 className={cn("w-3.5 h-3.5", isSpeaking && "text-primary")} />
          </Button>
        )}
      </div>
    </div>
  );
}
