import { Mic, MicOff, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceButtonProps {
  isListening: boolean;
  isSpeaking: boolean;
  isSupported: boolean;
  onToggleListening: () => void;
  onStopSpeaking: () => void;
  audioLevel?: number;
  size?: "default" | "lg";
  userSpeaking?: boolean;
}

export function VoiceButton({
  isListening,
  isSpeaking,
  isSupported,
  onToggleListening,
  onStopSpeaking,
  audioLevel = 0,
  size = "default",
  userSpeaking = false,
}: VoiceButtonProps) {
  if (isSpeaking) {
    return (
      <Button
        size="icon"
        variant="outline"
        onClick={onStopSpeaking}
        className={cn(
          "relative",
          size === "lg" && "w-14 h-14"
        )}
        data-testid="button-stop-speaking"
      >
        <VolumeX className={cn("w-5 h-5", size === "lg" && "w-6 h-6")} />
        <span className="absolute inset-0 rounded-md animate-pulse bg-primary/10" />
      </Button>
    );
  }

  const ringScale = isListening ? 1 + audioLevel * 0.5 : 1;

  return (
    <Button
      size="icon"
      variant={isListening ? "default" : "outline"}
      onClick={onToggleListening}
      disabled={!isSupported}
      className={cn(
        "relative transition-all",
        size === "lg" && "w-14 h-14",
        isListening && !userSpeaking && "ring-4 ring-primary/20",
        isListening && userSpeaking && "ring-4 ring-green-500/40"
      )}
      data-testid="button-voice"
    >
      {isListening ? (
        <MicOff className={cn("w-5 h-5", size === "lg" && "w-6 h-6")} />
      ) : (
        <Mic className={cn("w-5 h-5", size === "lg" && "w-6 h-6")} />
      )}
      {isListening && userSpeaking && (
        <span
          className="absolute inset-0 rounded-md bg-green-500/20 transition-transform duration-150"
          style={{ transform: `scale(${ringScale})` }}
        />
      )}
      {isListening && !userSpeaking && (
        <span className="absolute inset-0 rounded-md bg-primary/10 animate-pulse" />
      )}
    </Button>
  );
}
