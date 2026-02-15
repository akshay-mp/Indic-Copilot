import { useState, useCallback, useRef, useEffect } from "react";

interface UseVoiceOptions {
  language: string;
  onResult?: (text: string) => void;
  onInterimResult?: (text: string) => void;
  onAutoSend?: (text: string) => void;
  onSpeakEnd?: () => void;
  continuous?: boolean;
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
  vadReady: boolean;
  userSpeaking: boolean;
}

export function useVoice({
  language,
  onResult,
  onInterimResult,
  onAutoSend,
  onSpeakEnd,
  continuous = true,
}: UseVoiceOptions): UseVoiceReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [vadReady, setVadReady] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);

  const vadRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isActiveRef = useRef(false);
  const accumulatedTextRef = useRef("");
  const hasSpeechRef = useRef(false);
  const speechEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioLevelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vadLoadedRef = useRef(false);

  const onAutoSendRef = useRef(onAutoSend);
  const onResultRef = useRef(onResult);
  const onInterimResultRef = useRef(onInterimResult);
  const onSpeakEndRef = useRef(onSpeakEnd);
  const languageRef = useRef(language);

  useEffect(() => {
    onAutoSendRef.current = onAutoSend;
    onResultRef.current = onResult;
    onInterimResultRef.current = onInterimResult;
    onSpeakEndRef.current = onSpeakEnd;
  }, [onAutoSend, onResult, onInterimResult, onSpeakEnd]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const clearTimers = useCallback(() => {
    if (speechEndTimerRef.current) {
      clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const doAutoSend = useCallback(() => {
    const finalText = accumulatedTextRef.current.trim();
    if (finalText && hasSpeechRef.current) {
      accumulatedTextRef.current = "";
      hasSpeechRef.current = false;
      setTranscript("");
      setInterimTranscript("");
      setUserSpeaking(false);
      setAudioLevel(0.05);

      stopRecognition();

      if (onAutoSendRef.current) {
        onAutoSendRef.current(finalText);
      }
    }
  }, [stopRecognition]);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (hasSpeechRef.current && isActiveRef.current) {
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        if (isActiveRef.current && hasSpeechRef.current) {
          doAutoSend();
        }
      }, 1500);
    }
  }, [doAutoSend]);

  const startRecognition = useCallback(() => {
    if (!isSupported) return;
    stopRecognition();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = languageRef.current;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

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
        setUserSpeaking(true);
        setAudioLevel(0.7);
        onInterimResultRef.current?.(currentInterim);
        resetSilenceTimer();
      } else if (hasSpeechRef.current) {
        setInterimTranscript("");
        resetSilenceTimer();
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.error("Speech recognition error:", event.error);
    };

    recognition.onend = () => {
      if (isActiveRef.current) {
        try {
          const r = new SpeechRecognition();
          r.lang = languageRef.current;
          r.interimResults = true;
          r.continuous = true;
          r.maxAlternatives = 1;
          r.onresult = recognition.onresult;
          r.onerror = recognition.onerror;
          r.onend = recognition.onend;
          recognitionRef.current = r;
          r.start();
        } catch {}
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
    }
  }, [isSupported, stopRecognition, resetSilenceTimer]);

  const handleSpeechEnd = useCallback(() => {
    if (speechEndTimerRef.current) {
      clearTimeout(speechEndTimerRef.current);
    }

    speechEndTimerRef.current = setTimeout(() => {
      speechEndTimerRef.current = null;

      if (isActiveRef.current && hasSpeechRef.current) {
        doAutoSend();

        if (continuous) {
          setTimeout(() => {
            if (isActiveRef.current) {
              startRecognition();
            }
          }, 300);
        }
      }
    }, 800);
  }, [continuous, doAutoSend, startRecognition]);

  const stopListening = useCallback(() => {
    isActiveRef.current = false;
    clearTimers();
    stopRecognition();

    if (vadRef.current) {
      try {
        vadRef.current.pause();
        vadRef.current.destroy();
      } catch {}
      vadRef.current = null;
    }

    const finalText = accumulatedTextRef.current.trim();
    accumulatedTextRef.current = "";
    hasSpeechRef.current = false;

    setIsListening(false);
    setUserSpeaking(false);
    setAudioLevel(0);
    setInterimTranscript("");
    setVadReady(false);

    if (finalText && onAutoSendRef.current) {
      onAutoSendRef.current(finalText);
    }
  }, [clearTimers, stopRecognition]);

  const startListening = useCallback(async () => {
    if (isActiveRef.current) return;
    isActiveRef.current = true;
    accumulatedTextRef.current = "";
    hasSpeechRef.current = false;
    vadLoadedRef.current = false;
    setTranscript("");
    setInterimTranscript("");
    setIsListening(true);
    setVadReady(false);

    try {
      const { MicVAD } = await import("@ricky0123/vad-web");

      const vad = await MicVAD.new({
        model: "v5",
        baseAssetPath: "/",
        onnxWASMBasePath: "/",
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.3,
        redemptionMs: 500,
        preSpeechPadMs: 200,
        minSpeechMs: 250,
        onSpeechStart: () => {
          setUserSpeaking(true);
          setAudioLevel(0.7);
          if (speechEndTimerRef.current) {
            clearTimeout(speechEndTimerRef.current);
            speechEndTimerRef.current = null;
          }
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        },
        onSpeechEnd: () => {
          setUserSpeaking(false);
          setAudioLevel(0.1);
          handleSpeechEnd();
        },
        onVADMisfire: () => {
          setUserSpeaking(false);
          setAudioLevel(0);
        },
      });

      if (!isActiveRef.current) {
        vad.destroy();
        return;
      }

      vadRef.current = vad;
      vad.start();
      vadLoadedRef.current = true;
      setVadReady(true);

      startRecognition();

      audioLevelIntervalRef.current = setInterval(() => {
        if (!isActiveRef.current) return;
        setAudioLevel((prev) => {
          const target = 0.05;
          return prev + (target - prev) * 0.3;
        });
      }, 200);
    } catch (err) {
      console.warn("Silero VAD not available, using fallback silence detection:", err);
      vadLoadedRef.current = false;

      if (!isActiveRef.current) return;

      setVadReady(true);
      startRecognition();

      audioLevelIntervalRef.current = setInterval(() => {
        if (!isActiveRef.current) return;
        setAudioLevel((prev) => {
          const target = 0.05;
          return prev + (target - prev) * 0.3;
        });
      }, 200);
    }
  }, [isSupported, startRecognition, handleSpeechEnd]);

  const speak = useCallback(
    (text: string, lang?: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      window.speechSynthesis.cancel();

      if (vadRef.current && isActiveRef.current) {
        try { vadRef.current.pause(); } catch {}
      }
      stopRecognition();
      clearTimers();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang || language;
      utterance.rate = 0.9;
      utterance.pitch = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        if (vadRef.current && isActiveRef.current) {
          try { vadRef.current.start(); } catch {}
          startRecognition();
        } else if (isActiveRef.current) {
          startRecognition();
        }
        onSpeakEndRef.current?.();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        if (vadRef.current && isActiveRef.current) {
          try { vadRef.current.start(); } catch {}
          startRecognition();
        } else if (isActiveRef.current) {
          startRecognition();
        }
        onSpeakEndRef.current?.();
      };

      synthRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [language, stopRecognition, startRecognition, clearTimers]
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      if (vadRef.current && isActiveRef.current) {
        try { vadRef.current.start(); } catch {}
        startRecognition();
      } else if (isActiveRef.current) {
        startRecognition();
      }
      onSpeakEndRef.current?.();
    }
  }, [startRecognition]);

  useEffect(() => {
    if (isActiveRef.current && recognitionRef.current) {
      const currentLang = recognitionRef.current.lang;
      if (currentLang !== language) {
        stopRecognition();
        setTimeout(() => {
          if (isActiveRef.current) {
            startRecognition();
          }
        }, 200);
      }
    }
  }, [language, stopRecognition, startRecognition]);

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      clearTimers();
      stopRecognition();
      if (vadRef.current) {
        try {
          vadRef.current.pause();
          vadRef.current.destroy();
        } catch {}
        vadRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [clearTimers, stopRecognition]);

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
    vadReady,
    userSpeaking,
  };
}
