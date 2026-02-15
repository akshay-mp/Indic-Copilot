import { useState, useCallback, useRef, useEffect } from "react";

interface UseVoiceOptions {
  language: string;
  onResult?: (text: string) => void;
  onInterimResult?: (text: string) => void;
  onAutoSend?: (text: string) => void;
  continuous?: boolean;
  vadEnabled?: boolean;
  silenceTimeout?: number;
}

interface UseVoiceReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string, lang?: string) => void;
  isSpeaking: boolean;
  stopSpeaking: () => void;
  audioLevel: number;
}

const SILENCE_AUDIO_THRESHOLD = 0.05;

export function useVoice({
  language,
  onResult,
  onInterimResult,
  onAutoSend,
  continuous = true,
  vadEnabled = true,
  silenceTimeout = 2000,
}: UseVoiceOptions): UseVoiceReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpeechRef = useRef(false);
  const accumulatedTextRef = useRef("");
  const isActiveRef = useRef(false);
  const onAutoSendRef = useRef(onAutoSend);
  const onResultRef = useRef(onResult);
  const onInterimResultRef = useRef(onInterimResult);

  useEffect(() => {
    onAutoSendRef.current = onAutoSend;
    onResultRef.current = onResult;
    onInterimResultRef.current = onInterimResult;
  }, [onAutoSend, onResult, onInterimResult]);

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const cleanupAudio = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const flushAndStop = useCallback(() => {
    if (!isActiveRef.current) return;
    isActiveRef.current = false;
    clearSilenceTimer();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    const finalText = accumulatedTextRef.current.trim();
    accumulatedTextRef.current = "";
    hasSpeechRef.current = false;
    cleanupAudio();
    setIsListening(false);
    setInterimTranscript("");

    if (finalText && onAutoSendRef.current) {
      onAutoSendRef.current(finalText);
    }
  }, [clearSilenceTimer, cleanupAudio]);

  const stopListening = useCallback(() => {
    flushAndStop();
  }, [flushAndStop]);

  const startAudioMonitoring = useCallback(async () => {
    if (audioContextRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isActiveRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkLevel = () => {
        if (!analyserRef.current || !isActiveRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(avg / 80, 1);
        setAudioLevel(normalized);

        if (hasSpeechRef.current && accumulatedTextRef.current.trim()) {
          if (normalized < SILENCE_AUDIO_THRESHOLD) {
            if (!silenceTimerRef.current) {
              silenceTimerRef.current = setTimeout(() => {
                if (isActiveRef.current && hasSpeechRef.current && accumulatedTextRef.current.trim()) {
                  flushAndStop();
                }
              }, silenceTimeout);
            }
          } else {
            clearSilenceTimer();
          }
        }

        animFrameRef.current = requestAnimationFrame(checkLevel);
      };
      checkLevel();
    } catch (err) {
      console.warn("Could not start audio monitoring for VAD:", err);
    }
  }, [silenceTimeout, flushAndStop, clearSilenceTimer]);

  const startListening = useCallback(() => {
    if (!isSupported || isActiveRef.current) return;
    isActiveRef.current = true;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = language;
    recognition.interimResults = true;
    recognition.continuous = continuous;
    recognition.maxAlternatives = 1;

    accumulatedTextRef.current = "";
    hasSpeechRef.current = false;

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript("");
      setInterimTranscript("");
    };

    recognition.onresult = (event: any) => {
      if (!isActiveRef.current) return;

      let allFinal = "";
      let currentInterim = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          allFinal += result[0].transcript;
        } else {
          currentInterim += result[0].transcript;
        }
      }

      if (allFinal) {
        accumulatedTextRef.current = allFinal;
        hasSpeechRef.current = true;
        setTranscript(allFinal);
        onResultRef.current?.(allFinal);
      }

      if (currentInterim) {
        hasSpeechRef.current = true;
        setInterimTranscript(currentInterim);
        onInterimResultRef.current?.(currentInterim);
      } else {
        setInterimTranscript("");
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      console.error("Speech recognition error:", event.error);
      isActiveRef.current = false;
      accumulatedTextRef.current = "";
      hasSpeechRef.current = false;
      clearSilenceTimer();
      cleanupAudio();
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognition.onend = () => {
      if (!isActiveRef.current) return;

      if (continuous) {
        try {
          recognition.start();
        } catch {
          isActiveRef.current = false;
          cleanupAudio();
          clearSilenceTimer();
          setIsListening(false);
        }
      } else {
        flushAndStop();
      }
    };

    recognitionRef.current = recognition;

    if (vadEnabled) {
      startAudioMonitoring();
    }

    try {
      recognition.start();
    } catch {
      isActiveRef.current = false;
    }
  }, [isSupported, language, continuous, vadEnabled, clearSilenceTimer, startAudioMonitoring, cleanupAudio, flushAndStop]);

  const speak = useCallback(
    (text: string, lang?: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang || language;
      utterance.rate = 0.9;
      utterance.pitch = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      synthRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [language]
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      clearSilenceTimer();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      cleanupAudio();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [clearSilenceTimer, cleanupAudio]);

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    speak,
    isSpeaking,
    stopSpeaking,
    audioLevel,
  };
}
