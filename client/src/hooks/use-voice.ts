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
  const startRecognitionRef = useRef<() => void>(() => { });

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
      } catch { }
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
        } catch { }
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
      } catch { }
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

  const prepareForSpeaking = useCallback(() => {
    if (vadRef.current && isActiveRef.current) {
      try { vadRef.current.pause(); } catch { }
    }
    stopRecognition();
    clearTimers();
  }, [stopRecognition, clearTimers]);

  const resumeAfterSpeaking = useCallback(() => {
    setIsSpeaking(false);
    if (vadRef.current && isActiveRef.current) {
      try { vadRef.current.start(); } catch { }
      startRecognitionRef.current();
    } else if (isActiveRef.current) {
      startRecognitionRef.current();
    }
    onSpeakEndRef.current?.();
  }, []);

  const sarvamAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakingGuardRef = useRef(false);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch(() => { });
    }
    return audioContextRef.current;
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => { });
      }
      const silent = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
      silent.volume = 0;
      silent.play().then(() => silent.pause()).catch(() => { });
    };
    document.addEventListener("click", unlockAudio, { once: false });
    document.addEventListener("touchstart", unlockAudio, { once: false });
    return () => {
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
    };
  }, [getAudioContext]);

  const streamAbortRef = useRef<AbortController | null>(null);

  const speakWithSarvamStream = useCallback(async (text: string, targetLang: string): Promise<boolean> => {
    try {
      console.log("Sarvam TTS Stream: requesting streaming audio for lang:", targetLang);
      const controller = new AbortController();
      streamAbortRef.current = controller;

      const response = await fetch("/api/tts-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: targetLang }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.warn("Sarvam TTS Stream: request failed:", err.error || response.status);
        streamAbortRef.current = null;
        return false;
      }

      if (!response.body) {
        console.warn("Sarvam TTS Stream: no response body (ReadableStream not supported)");
        streamAbortRef.current = null;
        return false;
      }

      // Read SSE events and accumulate audio chunks
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const audioChunks: Uint8Array[] = [];
      let totalBytes = 0;
      let playbackStarted = false;
      let currentSource: AudioBufferSourceNode | null = null;
      let sseBuffer = "";

      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // Helper: decode accumulated chunks and start playback
      const startPlayback = async (): Promise<boolean> => {
        if (audioChunks.length === 0) return false;

        // Combine all chunks into one buffer
        const combined = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of audioChunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        try {
          const audioBuffer = await ctx.decodeAudioData(combined.buffer.slice(0));
          return new Promise<boolean>((resolve) => {
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            currentSource = source;
            sarvamAudioRef.current = { pause: () => { try { source.stop(); } catch { } } } as any;
            source.onended = () => {
              console.log("Sarvam TTS Stream: playback finished, duration:", audioBuffer.duration.toFixed(1), "s");
              currentSource = null;
              sarvamAudioRef.current = null;
              resolve(true);
            };
            source.start(0);
            console.log("Sarvam TTS Stream: playback started, duration:", audioBuffer.duration.toFixed(1), "s");
          });
        } catch (decodeErr) {
          console.warn("Sarvam TTS Stream: decode failed, trying HTMLAudioElement", decodeErr);
          // Fallback to HTMLAudioElement with blob
          const audioBlob = new Blob(audioChunks as any[], { type: "audio/mp3" });
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          sarvamAudioRef.current = audio;

          return new Promise<boolean>((resolve) => {
            audio.onended = () => {
              console.log("Sarvam TTS Stream: HTMLAudioElement playback finished");
              URL.revokeObjectURL(audioUrl);
              sarvamAudioRef.current = null;
              resolve(true);
            };
            audio.onerror = () => {
              URL.revokeObjectURL(audioUrl);
              sarvamAudioRef.current = null;
              resolve(false);
            };
            audio.play().catch(() => {
              URL.revokeObjectURL(audioUrl);
              sarvamAudioRef.current = null;
              resolve(false);
            });
          });
        }
      };

      // Read the SSE stream
      let streamDone = false;
      let hasError = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) {
          streamDone = true;
          break;
        }

        sseBuffer += decoder.decode(value, { stream: true });

        // Parse SSE events from the buffer
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.substring(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.audio) {
              // Decode base64 audio chunk
              const binaryStr = atob(event.audio);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              audioChunks.push(bytes);
              totalBytes += bytes.length;
              console.log("Sarvam TTS Stream: chunk received,", bytes.length, "bytes, total:", totalBytes);
            }

            if (event.done) {
              console.log("Sarvam TTS Stream: all chunks received, total:", totalBytes, "bytes in", audioChunks.length, "chunks");
              streamDone = true;
              break;
            }

            if (event.error) {
              console.warn("Sarvam TTS Stream: server error:", event.error);
              hasError = true;
              streamDone = true;
              break;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      streamAbortRef.current = null;

      if (hasError || audioChunks.length === 0) {
        return false;
      }

      // Start playback with all accumulated audio
      return await startPlayback();

    } catch (e: any) {
      if (e.name === "AbortError") {
        console.log("Sarvam TTS Stream: aborted by user");
        return true; // Don't fall back on intentional abort
      }
      console.warn("Sarvam TTS Stream: error", e);
      streamAbortRef.current = null;
      return false;
    }
  }, [getAudioContext]);

  // Keep the old REST TTS as a fallback
  const speakWithSarvamRest = useCallback(async (text: string, targetLang: string): Promise<boolean> => {
    try {
      console.log("Sarvam TTS REST fallback: requesting audio for lang:", targetLang);
      const controller = new AbortController();
      const clientTimeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: targetLang }),
        signal: controller.signal,
      });
      clearTimeout(clientTimeout);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.warn("Sarvam TTS REST failed:", err.error || response.status);
        return false;
      }

      const contentType = response.headers.get("content-type") || "unknown";
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        console.warn("Sarvam TTS REST: empty audio response");
        return false;
      }
      console.log("Sarvam TTS REST: received", arrayBuffer.byteLength, "bytes, content-type:", contentType);

      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      try {
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        return new Promise<boolean>((resolve) => {
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.onended = () => {
            console.log("Sarvam TTS REST: playback finished via Web Audio API");
            resolve(true);
          };
          source.start(0);
          console.log("Sarvam TTS REST: playing audio via Web Audio API, duration:", audioBuffer.duration.toFixed(1), "s");
          sarvamAudioRef.current = { pause: () => { try { source.stop(); } catch { } } } as any;
        });
      } catch (decodeErr) {
        console.warn("Sarvam TTS REST: Web Audio decode failed, trying HTMLAudioElement", decodeErr);
        const audioBlob = new Blob([arrayBuffer], { type: "audio/wav" });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        sarvamAudioRef.current = audio;

        return new Promise<boolean>((resolve) => {
          audio.onended = () => {
            console.log("Sarvam TTS REST: playback finished via HTMLAudioElement");
            URL.revokeObjectURL(audioUrl);
            sarvamAudioRef.current = null;
            resolve(true);
          };
          audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            sarvamAudioRef.current = null;
            resolve(false);
          };
          audio.play().catch((e) => {
            console.warn("Sarvam TTS REST: HTMLAudioElement play() also failed", e);
            URL.revokeObjectURL(audioUrl);
            sarvamAudioRef.current = null;
            resolve(false);
          });
        });
      }
    } catch (e) {
      console.warn("Sarvam TTS REST: network error", e);
      return false;
    }
  }, [getAudioContext]);

  const speakWithBrowser = useCallback((text: string, targetLang: string, onDone: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setTimeout(onDone, 2000);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = targetLang;
    utterance.rate = 0.9;
    utterance.pitch = 1;

    const voice = findVoice(targetLang);
    if (voice) {
      utterance.voice = voice;
      console.log("Browser TTS using voice:", voice.name, "for lang:", targetLang);
    }

    const speakStartTime = Date.now();

    utterance.onend = () => {
      const duration = Date.now() - speakStartTime;
      if (duration < 200) {
        console.warn("Browser TTS completed instantly - no voice for", targetLang);
        setTimeout(onDone, 3000);
      } else {
        onDone();
      }
    };
    utterance.onerror = () => {
      setTimeout(onDone, 2000);
    };

    synthRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);

    setTimeout(() => {
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        setTimeout(onDone, 3000);
      }
    }, 500);
  }, [findVoice]);

  const speak = useCallback(
    async (text: string, lang?: string) => {
      if (speakingGuardRef.current) {
        console.log("TTS speak: already speaking, ignoring duplicate call");
        return;
      }
      speakingGuardRef.current = true;

      const targetLang = lang || language;
      console.log("TTS speak called with lang:", targetLang, "text length:", text.length);

      // Pause VAD and recognition while speaking
      prepareForSpeaking();
      setIsSpeaking(true);

      // Try streaming first
      const streamSuccess = await speakWithSarvamStream(text, targetLang);

      if (streamSuccess) {
        speakingGuardRef.current = false;
        // Resume VAD and recognition after speaking ends
        resumeAfterSpeaking();
        return;
      }

      // Fallback to REST TTS
      console.log("Streaming TTS failed, falling back to REST TTS for:", targetLang);
      const restSuccess = await speakWithSarvamRest(text, targetLang);

      if (restSuccess) {
        speakingGuardRef.current = false;
        resumeAfterSpeaking();
        return;
      }

      // Final fallback: browser TTS
      console.log("Falling back to browser TTS for:", targetLang);
      speakWithBrowser(text, targetLang, () => {
        speakingGuardRef.current = false;
        resumeAfterSpeaking();
      });
    },
    [language, prepareForSpeaking, speakWithSarvamStream, speakWithSarvamRest, speakWithBrowser, resumeAfterSpeaking]
  );

  const stopSpeaking = useCallback(() => {
    speakingGuardRef.current = false;
    // Abort any in-progress streaming fetch
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    if (sarvamAudioRef.current) {
      sarvamAudioRef.current.pause();
      sarvamAudioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    // Resume VAD and recognition
    resumeAfterSpeaking();
  }, [resumeAfterSpeaking]);

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
        } catch { }
        vadRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (sarvamAudioRef.current) {
        sarvamAudioRef.current.pause();
        sarvamAudioRef.current = null;
      }
      if (streamAbortRef.current) {
        streamAbortRef.current.abort();
        streamAbortRef.current = null;
      }
      speakingGuardRef.current = false;
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => { });
        audioContextRef.current = null;
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
