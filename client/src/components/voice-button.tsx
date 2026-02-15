import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceButtonProps {
  isListening: boolean;
  isSpeaking: boolean;
  isSupported: boolean;
  onToggleListening: () => void;
  onStopSpeaking: () => void;
  size?: "default" | "lg";
}

export function VoiceButton({
  isListening,
  isSpeaking,
  isSupported,
  onToggleListening,
  onStopSpeaking,
  size = "default",
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

  return (
    <Button
      size="icon"
      variant={isListening ? "default" : "outline"}
      onClick={onToggleListening}
      disabled={!isSupported}
      className={cn(
        "relative transition-all",
        size === "lg" && "w-14 h-14",
        isListening && "ring-4 ring-primary/30"
      )}
      data-testid="button-voice"
    >
      {isListening ? (
        <MicOff className={cn("w-5 h-5", size === "lg" && "w-6 h-6")} />
      ) : (
        <Mic className={cn("w-5 h-5", size === "lg" && "w-6 h-6")} />
      )}
      {isListening && (
        <>
          <span className="absolute inset-0 rounded-md animate-ping bg-primary/20" style={{ animationDuration: "1.5s" }} />
        </>
      )}
    </Button>
  );
}
