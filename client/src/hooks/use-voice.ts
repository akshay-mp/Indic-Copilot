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
  const startRecognitionRef = useRef<() => void>(() => {});

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

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const handler = () => { window.speechSynthesis.getVoices(); };
      window.speechSynthesis.addEventListener("voiceschanged", handler);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", handler);
    }
  }, []);

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

  const doAutoSend = useCallback((restartAfter: boolean) => {
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

      if (restartAfter && isActiveRef.current) {
        setTimeout(() => {
          if (isActiveRef.current) {
            startRecognitionRef.current();
          }
        }, 500);
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
          doAutoSend(true);
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

  startRecognitionRef.current = startRecognition;

  const handleSpeechEnd = useCallback(() => {
    if (speechEndTimerRef.current) {
      clearTimeout(speechEndTimerRef.current);
    }

    speechEndTimerRef.current = setTimeout(() => {
      speechEndTimerRef.current = null;

      if (isActiveRef.current && hasSpeechRef.current) {
        doAutoSend(continuous);
      }
    }, 800);
  }, [continuous, doAutoSend]);

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
    setTranscript("");
    setInterimTranscript("");
    setIsListening(true);
    setVadReady(false);

    try {
      const { MicVAD } = await import("@ricky0123/vad-web");

      const vad = await MicVAD.new({
        model: "v5" as any,
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

  const findVoice = useCallback((targetLang: string): SpeechSynthesisVoice | null => {
    if (typeof window === "undefined" || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    const langPrefix = targetLang.split("-")[0].toLowerCase();

    let exact = voices.find(v => v.lang.toLowerCase() === targetLang.toLowerCase());
    if (exact) return exact;

    let prefixMatch = voices.find(v => v.lang.toLowerCase().startsWith(langPrefix));
    if (prefixMatch) return prefixMatch;

    let googleMatch = voices.find(v =>
      v.name.toLowerCase().includes("google") && v.lang.toLowerCase().startsWith(langPrefix)
    );
    if (googleMatch) return googleMatch;

    return null;
  }, []);

  const doSpeak = useCallback((text: string, targetLang: string) => {
    if (vadRef.current && isActiveRef.current) {
      try { vadRef.current.pause(); } catch {}
    }
    stopRecognition();
    clearTimers();

    let resumed = false;
    const resumeListening = () => {
      if (resumed) return;
      resumed = true;
      setIsSpeaking(false);
      if (vadRef.current && isActiveRef.current) {
        try { vadRef.current.start(); } catch {}
        startRecognitionRef.current();
      } else if (isActiveRef.current) {
        startRecognitionRef.current();
      }
      onSpeakEndRef.current?.();
    };

    const minSpeakDurationMs = 1500;
    const resumeAfterDelay = (startTime: number) => {
      const elapsed = Date.now() - startTime;
      if (elapsed < minSpeakDurationMs) {
        setTimeout(resumeListening, minSpeakDurationMs - elapsed);
      } else {
        resumeListening();
      }
    };

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = targetLang;
    utterance.rate = 0.9;
    utterance.pitch = 1;

    const voice = findVoice(targetLang);
    if (voice) {
      utterance.voice = voice;
      console.log("TTS using voice:", voice.name, "for lang:", targetLang);
    } else {
      console.log("TTS no voice found for:", targetLang, "- will try with lang tag only");
    }

    const speakStartTime = Date.now();

    utterance.onstart = () => {
      console.log("TTS started speaking in", targetLang);
      setIsSpeaking(true);
    };
    utterance.onend = () => {
      const duration = Date.now() - speakStartTime;
      console.log("TTS finished speaking, duration:", duration, "ms");
      if (duration < 200) {
        console.warn("TTS completed too quickly (", duration, "ms) - voice likely unavailable for", targetLang);
        setIsSpeaking(false);
        setTimeout(resumeListening, 3000);
      } else {
        resumeAfterDelay(speakStartTime);
      }
    };
    utterance.onerror = (e) => {
      console.warn("TTS error:", e.error, "for lang:", targetLang);
      setIsSpeaking(false);
      setTimeout(resumeListening, 2000);
    };

    synthRef.current = utterance;
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);

    setTimeout(() => {
      if (!resumed && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        console.warn("TTS safety timeout — resuming listening for", targetLang);
        resumeListening();
      }
    }, 30000);
  }, [findVoice, stopRecognition, clearTimers]);

  const speak = useCallback(
    (text: string, lang?: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      window.speechSynthesis.cancel();

      const targetLang = lang || language;
      console.log("TTS speak called with lang:", targetLang, "text length:", text.length);

      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) {
        const handler = () => {
          window.speechSynthesis.removeEventListener("voiceschanged", handler);
          doSpeak(text, targetLang);
        };
        window.speechSynthesis.addEventListener("voiceschanged", handler);
        setTimeout(() => {
          window.speechSynthesis.removeEventListener("voiceschanged", handler);
          doSpeak(text, targetLang);
        }, 1000);
      } else {
        doSpeak(text, targetLang);
      }
    },
    [language, doSpeak]
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      if (vadRef.current && isActiveRef.current) {
        try { vadRef.current.start(); } catch {}
        startRecognitionRef.current();
      } else if (isActiveRef.current) {
        startRecognitionRef.current();
      }
      onSpeakEndRef.current?.();
    }
  }, []);

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
