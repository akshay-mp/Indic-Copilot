import { useEffect, useCallback, useRef } from "react";
import { ParticleSphere } from "@/components/particle-sphere";
import { LanguageSelector } from "@/components/language-selector";
import { X, Mic, MicOff } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

interface VoiceOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  isListening: boolean;
  isSpeaking: boolean;
  isSupported: boolean;
  userSpeaking: boolean;
  audioLevel: number;
  vadReady: boolean;
  interimTranscript: string;
  isStreaming: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onStopSpeaking: () => void;
  language: string;
  onLanguageChange: (lang: string) => void;
}

export function VoiceOverlay({
  isOpen,
  onClose,
  isListening,
  isSpeaking,
  isSupported,
  userSpeaking,
  audioLevel,
  vadReady,
  interimTranscript,
  isStreaming,
  onStartListening,
  onStopListening,
  onStopSpeaking,
  language,
  onLanguageChange,
}: VoiceOverlayProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const startListeningRef = useRef(onStartListening);
  const isListeningRef = useRef(isListening);
  const isSpeakingRef = useRef(isSpeaking);
  const isStreamingRef = useRef(isStreaming);

  useEffect(() => {
    startListeningRef.current = onStartListening;
    isListeningRef.current = isListening;
    isSpeakingRef.current = isSpeaking;
    isStreamingRef.current = isStreaming;
  }, [onStartListening, isListening, isSpeaking, isStreaming]);

  useEffect(() => {
    if (isOpen && !isListeningRef.current && !isSpeakingRef.current && !isStreamingRef.current) {
      const timer = setTimeout(() => {
        startListeningRef.current();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isListening) onStopListening();
    if (isSpeaking) onStopSpeaking();
    onClose();
  }, [isListening, isSpeaking, onStopListening, onStopSpeaking, onClose]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) handleClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  let sphereState: "idle" | "listening" | "userSpeaking" | "thinking" | "speaking" = "idle";
  if (isStreaming) sphereState = "thinking";
  else if (isSpeaking) sphereState = "speaking";
  else if (userSpeaking) sphereState = "userSpeaking";
  else if (isListening) sphereState = "listening";

  let statusText = "Say something...";
  if (isStreaming) statusText = "Thinking...";
  else if (isSpeaking) statusText = "Speaking...";
  else if (userSpeaking) statusText = interimTranscript || "Listening...";
  else if (isListening && interimTranscript) statusText = interimTranscript;
  else if (isListening && !vadReady) statusText = "Initializing...";
  else if (isListening) statusText = "Say something...";

  const statusColor = isSpeaking
    ? isDark ? "text-purple-400" : "text-purple-600"
    : isStreaming
    ? isDark ? "text-blue-400" : "text-blue-600"
    : userSpeaking
    ? isDark ? "text-emerald-400" : "text-emerald-600"
    : isListening
    ? isDark ? "text-teal-400" : "text-teal-600"
    : "text-muted-foreground";

  return (
    <div
      className="flex flex-col items-center justify-between h-full w-full border-l bg-background"
      data-testid="voice-overlay"
    >
      <div className="flex items-center justify-end w-full p-3">
        <LanguageSelector
          value={language}
          onChange={onLanguageChange}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <ParticleSphere
          state={sphereState}
          audioLevel={audioLevel}
          size={220}
          isDark={isDark}
        />

        <p
          className={cn(
            "text-base font-light tracking-wide transition-colors duration-300 max-w-[220px] text-center px-4",
            statusColor,
            (userSpeaking || (isListening && interimTranscript)) && "text-sm"
          )}
          data-testid="text-voice-status"
        >
          {statusText}
        </p>
      </div>

      <div className="flex items-center gap-5 pb-8">
        <button
          onClick={handleClose}
          className={cn(
            "w-12 h-12 rounded-full border flex items-center justify-center transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isDark
              ? "border-gray-700 text-gray-400 bg-gray-900/50"
              : "border-gray-300 text-gray-500 bg-gray-100/80"
          )}
          data-testid="button-voice-close"
        >
          <X className="w-5 h-5" />
        </button>

        <button
          onClick={() => {
            if (isSpeaking) {
              onStopSpeaking();
            } else if (isListening) {
              onStopListening();
            } else {
              onStartListening();
            }
          }}
          disabled={!isSupported}
          className={cn(
            "w-12 h-12 rounded-full border flex items-center justify-center transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isListening && !isSpeaking
              ? isDark
                ? "border-teal-500/50 text-teal-400 bg-teal-500/10"
                : "border-teal-500/50 text-teal-600 bg-teal-500/10"
              : isSpeaking
              ? isDark
                ? "border-purple-500/50 text-purple-400 bg-purple-500/10"
                : "border-purple-500/50 text-purple-600 bg-purple-500/10"
              : isDark
              ? "border-gray-700 text-gray-400 bg-gray-900/50"
              : "border-gray-300 text-gray-500 bg-gray-100/80",
            userSpeaking && (isDark
              ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10 ring-2 ring-emerald-500/30"
              : "border-emerald-500/50 text-emerald-600 bg-emerald-500/10 ring-2 ring-emerald-500/30"),
            !isSupported && "opacity-50 cursor-not-allowed"
          )}
          data-testid="button-voice-mic"
        >
          {isListening ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
