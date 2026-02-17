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

  // AnalyserNode-based silence detection refs
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const energyMonitorPausedRef = useRef(false);
  const speechStartTimeRef = useRef<number>(0);
  const lastSpeechTimeRef = useRef<number>(0);
  const isSpeechActiveRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isActiveRef = useRef(false);
  const accumulatedTextRef = useRef("");
  const hasSpeechRef = useRef(false);
  const speechEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioLevelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);

  // Energy-based silence detection constants
  const SPEECH_THRESHOLD = 0.015;
  const SILENCE_DURATION_MS = 1200;
  const MIN_SPEECH_DURATION_MS = 300;

  const onAutoSendRef = useRef(onAutoSend);
  const onResultRef = useRef(onResult);
  const onInterimResultRef = useRef(onInterimResult);
  const onSpeakEndRef = useRef(onSpeakEnd);
  const languageRef = useRef(language);
  const startListeningExternalRef = useRef<(() => void) | null>(null);

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

  // MediaRecorder is universally supported in modern browsers
  const isSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

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

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn("Failed to stop MediaRecorder:", e);
      }
    }
    isRecordingRef.current = false;
  }, []);

  const sendAudioToSTT = useCallback(async (audioBlob: Blob) => {
    try {
      console.log("[STT Client] Sending audio to server:", audioBlob.size, "bytes");

      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");
      formData.append("language", languageRef.current);
      formData.append("mode", "transcribe");

      const response = await fetch("/api/stt", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        console.error("[STT Client] Server error:", error);
        return null;
      }

      const data = await response.json() as { transcript: string };
      console.log("[STT Client] Received transcript:", data.transcript);
      return data.transcript;
    } catch (error) {
      console.error("[STT Client] Failed to send audio:", error);
      return null;
    }
  }, []);

  const doAutoSend = useCallback((finalText: string) => {
    if (finalText && finalText.trim()) {
      accumulatedTextRef.current = "";
      hasSpeechRef.current = false;
      setTranscript("");
      setInterimTranscript("");
      setUserSpeaking(false);
      setAudioLevel(0.05);

      if (onAutoSendRef.current) {
        onAutoSendRef.current(finalText.trim());
      }
    }
  }, []);

  // Removed resetSilenceTimer - no longer needed with MediaRecorder approach

  const startRecording = useCallback(() => {
    if (!mediaStreamRef.current || isRecordingRef.current) return;

    try {
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(mediaStreamRef.current, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (audioChunksRef.current.length === 0) {
          console.warn("[STT Client] No audio chunks recorded");
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        console.log("[STT Client] Recording stopped, blob size:", audioBlob.size);

        // Send to STT API
        const transcript = await sendAudioToSTT(audioBlob);

        if (transcript) {
          accumulatedTextRef.current = transcript;
          hasSpeechRef.current = true;
          setTranscript(transcript);
          onResultRef.current?.(transcript);

          // Auto-send after getting transcript
          if (continuous && isActiveRef.current) {
            setTimeout(() => {
              doAutoSend(transcript);
            }, 800);
          }
        }

        audioChunksRef.current = [];
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      isRecordingRef.current = true;
      console.log("[STT Client] Recording started");
    } catch (e) {
      console.error("[STT Client] Failed to start recording:", e);
    }
  }, [sendAudioToSTT, continuous, doAutoSend]);

  const handleSpeechEnd = useCallback(() => {
    // Stop recording when VAD detects speech end
    stopRecording();
  }, [stopRecording]);

  const stopEnergyMonitor = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    isActiveRef.current = false;
    clearTimers();
    stopRecording();
    stopEnergyMonitor();

    // Close analyser context
    if (analyserCtxRef.current && analyserCtxRef.current.state !== "closed") {
      analyserCtxRef.current.close().catch(() => { });
      analyserCtxRef.current = null;
    }
    analyserRef.current = null;

    // Close media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    isSpeechActiveRef.current = false;
    energyMonitorPausedRef.current = false;

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
  }, [clearTimers, stopRecording, stopEnergyMonitor]);

  const startEnergyMonitor = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.fftSize);

    const monitor = () => {
      if (!isActiveRef.current || energyMonitorPausedRef.current) {
        animFrameRef.current = requestAnimationFrame(monitor);
        return;
      }

      analyser.getByteTimeDomainData(dataArray);

      // Compute RMS energy
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      // Update visual audio level
      setAudioLevel(Math.min(rms * 5, 1));

      const now = Date.now();

      if (rms > SPEECH_THRESHOLD) {
        lastSpeechTimeRef.current = now;

        if (!isSpeechActiveRef.current) {
          // Speech just started
          isSpeechActiveRef.current = true;
          speechStartTimeRef.current = now;
          console.log("[STT Client] Energy VAD: speech started, RMS:", rms.toFixed(4));
          setUserSpeaking(true);
          setAudioLevel(0.7);
          startRecording();
        }
      } else if (isSpeechActiveRef.current) {
        const silenceDuration = now - lastSpeechTimeRef.current;
        const speechDuration = now - speechStartTimeRef.current;

        if (silenceDuration >= SILENCE_DURATION_MS) {
          if (speechDuration >= MIN_SPEECH_DURATION_MS) {
            // Valid speech ended — stop recording and send to STT
            console.log("[STT Client] Energy VAD: speech ended after", speechDuration, "ms");
            isSpeechActiveRef.current = false;
            setUserSpeaking(false);
            setAudioLevel(0.1);
            handleSpeechEnd();
          } else {
            // Too short — misfire
            console.log("[STT Client] Energy VAD: misfire (only", speechDuration, "ms)");
            isSpeechActiveRef.current = false;
            setUserSpeaking(false);
            setAudioLevel(0);
            stopRecording();
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(monitor);
    };

    animFrameRef.current = requestAnimationFrame(monitor);
  }, [startRecording, handleSpeechEnd, stopRecording]);

  const startListening = useCallback(async () => {
    if (isActiveRef.current) return;
    isActiveRef.current = true;
    accumulatedTextRef.current = "";
    hasSpeechRef.current = false;
    isSpeechActiveRef.current = false;
    energyMonitorPausedRef.current = false;
    setTranscript("");
    setInterimTranscript("");
    setIsListening(true);
    setVadReady(false);

    try {
      console.log("[STT Client] Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;
      console.log("[STT Client] Microphone access granted");

      // Set up AnalyserNode for energy-based silence detection
      const audioCtx = new AudioContext();
      analyserCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      if (!isActiveRef.current) {
        audioCtx.close().catch(() => { });
        stream.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        return;
      }

      // Start energy monitoring — replaces Silero VAD
      startEnergyMonitor();
      setVadReady(true);
      console.log("[STT Client] AnalyserNode ready, listening for speech");
    } catch (err) {
      console.error("[STT Client] Failed to initialize:", err);
      isActiveRef.current = false;
      setIsListening(false);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
    }
  }, [startEnergyMonitor]);

  startListeningExternalRef.current = startListening;

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
    // Pause energy monitor so TTS audio doesn't trigger speech detection
    energyMonitorPausedRef.current = true;
    isSpeechActiveRef.current = false;
    stopRecording();
    clearTimers();
  }, [stopRecording, clearTimers]);

  const resumeAfterSpeaking = useCallback(() => {
    setIsSpeaking(false);

    if (!isActiveRef.current) {
      onSpeakEndRef.current?.();
      return;
    }

    // Resume energy monitor
    energyMonitorPausedRef.current = false;
    isSpeechActiveRef.current = false;
    console.log("[STT Client] Energy monitor resumed after speaking");

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
          let resolved = false;
          const done = (success: boolean) => {
            if (!resolved) { resolved = true; resolve(success); }
          };
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.onended = () => {
            console.log("Sarvam TTS REST: playback finished via Web Audio API");
            done(true);
          };
          source.start(0);
          const dur = audioBuffer.duration;
          console.log("Sarvam TTS REST: playing audio via Web Audio API, duration:", dur.toFixed(1), "s");
          sarvamAudioRef.current = { pause: () => { try { source.stop(); } catch { } done(false); } } as any;
          setTimeout(() => {
            console.log("Sarvam TTS REST: safety timeout after", (dur + 3).toFixed(0), "s");
            done(true);
          }, (dur + 3) * 1000);
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
      const trimmedText = (text || "").trim();
      if (!trimmedText) {
        console.log("TTS speak: empty text, skipping");
        onSpeakEndRef.current?.();
        return;
      }
      if (speakingGuardRef.current) {
        console.log("TTS speak: already speaking, ignoring duplicate call");
        return;
      }
      speakingGuardRef.current = true;

      const targetLang = lang || language;
      console.log("TTS speak called with lang:", targetLang, "text length:", trimmedText.length);

      prepareForSpeaking();
      setIsSpeaking(true);

      try {
        const streamSuccess = await speakWithSarvamStream(trimmedText, targetLang);
        if (streamSuccess) {
          speakingGuardRef.current = false;
          resumeAfterSpeaking();
          return;
        }

        console.log("Streaming TTS failed, falling back to REST TTS for:", targetLang);
        const restSuccess = await speakWithSarvamRest(trimmedText, targetLang);
        if (restSuccess) {
          speakingGuardRef.current = false;
          resumeAfterSpeaking();
          return;
        }

        console.log("Falling back to browser TTS for:", targetLang);
        speakWithBrowser(trimmedText, targetLang, () => {
          speakingGuardRef.current = false;
          resumeAfterSpeaking();
        });
      } catch (e) {
        console.warn("TTS speak error:", e);
        speakingGuardRef.current = false;
        resumeAfterSpeaking();
      }
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

  // Language is passed dynamically to /api/stt at request time, no restart needed

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      clearTimers();
      stopRecording();

      // Stop energy monitor
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      // Close analyser context
      if (analyserCtxRef.current && analyserCtxRef.current.state !== "closed") {
        analyserCtxRef.current.close().catch(() => { });
        analyserCtxRef.current = null;
      }
      analyserRef.current = null;

      // Close media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }

      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
          }
        } catch { }
        mediaRecorderRef.current = null;
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
  }, [clearTimers, stopRecording]);

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
