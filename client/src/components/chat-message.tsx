import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  onSpeak?: (text: string) => void;
  isSpeaking?: boolean;
}

export function ChatMessage({ role, content, onSpeak, isSpeaking }: ChatMessageProps) {
  const isUser = role === "user";

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
