import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useVoice } from "@/hooks/use-voice";
import { LanguageSelector } from "@/components/language-selector";
import { ChatMessage } from "@/components/chat-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, Sparkles, Loader2, Volume2, VolumeX, Mic } from "lucide-react";
import { VoiceOverlay } from "@/components/voice-overlay";
import { useToast } from "@/hooks/use-toast";
import type { Conversation, Message } from "@shared/schema";

interface BuilderProps {
  conversationId: number | null;
  onConversationCreated: (id: number) => void;
}

export default function Builder({ conversationId, onConversationCreated }: BuilderProps) {
  const [language, setLanguage] = useState("en-US");
  const [inputText, setInputText] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingSend, setPendingSend] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [voiceMode, setVoiceMode] = useState(false);
  const autoSpeakRef = useRef(true);
  const voiceModeRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const wasListeningBeforeSpeakRef = useRef(false);
  const voiceRef = useRef<any>(null);

  const sendMessageRef = useRef<(text: string) => void>(() => {});

  const handleVoiceResult = useCallback((text: string) => {
    setInputText(text);
  }, []);

  const handleAutoSend = useCallback((text: string) => {
    setInputText("");
    sendMessageRef.current(text);
  }, []);

  const startListeningRef = useRef<() => void>(() => {});

  const handleSpeakEnd = useCallback(() => {
    if (wasListeningBeforeSpeakRef.current) {
      wasListeningBeforeSpeakRef.current = false;
      setTimeout(() => {
        startListeningRef.current();
      }, 300);
    }
  }, []);

  const voice = useVoice({
    language,
    onResult: handleVoiceResult,
    onAutoSend: handleAutoSend,
    onSpeakEnd: handleSpeakEnd,
  });

  useEffect(() => {
    startListeningRef.current = voice.startListening;
    voiceRef.current = voice;
  }, [voice.startListening, voice]);

  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  const { data: conversation, isLoading: loadingConversation } = useQuery<Conversation & { messages: Message[] }>({
    queryKey: ["/api/conversations", conversationId],
    enabled: !!conversationId,
  });

  const messages = conversation?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    setPendingSend(true);

    let activeConvId = conversationId;

    if (!activeConvId) {
      const res = await apiRequest("POST", "/api/conversations", {
        title: text.slice(0, 50),
        language,
      });
      const newConv = await res.json();
      activeConvId = newConv.id;
      onConversationCreated(newConv.id);
    }

    setInputText("");
    setIsStreaming(true);
    setStreamingContent("");

    queryClient.setQueryData(
      ["/api/conversations", activeConvId],
      (old: any) => {
        if (!old) return { id: activeConvId, title: text.slice(0, 50), messages: [{ id: Date.now(), role: "user", content: text, conversationId: activeConvId, createdAt: new Date().toISOString() }] };
        return {
          ...old,
          messages: [...(old.messages || []), { id: Date.now(), role: "user", content: text, conversationId: activeConvId, createdAt: new Date().toISOString() }],
        };
      }
    );

    try {
      const response = await fetch(`/api/conversations/${activeConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, language }),
      });

      if (!response.ok) throw new Error("Failed to send message");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let buffer = "";
      let wasAppCreated = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  fullResponse += data.content;
                  setStreamingContent(fullResponse);
                  setPendingSend(false);
                }
                if (data.appCreated) {
                  wasAppCreated = true;
                  queryClient.invalidateQueries({ queryKey: ["/api/apps"] });
                  toast({ title: "App created!", description: "Your app has been built. Check the dashboard to view it." });
                }
                if (data.done) {
                  setStreamingContent("");
                  setIsStreaming(false);
                  queryClient.invalidateQueries({ queryKey: ["/api/conversations", activeConvId] });
                  queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });

                  if (autoSpeakRef.current && fullResponse && !wasAppCreated) {
                    const speakText = fullResponse.length > 500
                      ? fullResponse.slice(0, 500) + "..."
                      : fullResponse;
                    const v = voiceRef.current;
                    if (v) {
                      wasListeningBeforeSpeakRef.current = v.isListening || voiceModeRef.current;
                      v.speak(speakText, language);
                    }
                  }
                }
              } catch {}
            }
          }
        }
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
      setIsStreaming(false);
      setPendingSend(false);
      setStreamingContent("");
    }
  }, [conversationId, language, isStreaming, onConversationCreated, toast]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const handleSubmit = () => {
    sendMessage(inputText);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const allMessages = [
    ...messages,
    ...(streamingContent
      ? [{ id: -1, role: "assistant" as const, content: streamingContent, conversationId: conversationId || 0, createdAt: new Date().toISOString() }]
      : []),
  ];

  const chatPanel = (
    <div className="flex flex-col h-full min-w-0 flex-1">
      <div className="flex-1 overflow-y-auto">
        {allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Voice App Builder</h2>
            <p className="text-muted-foreground text-sm max-w-md mb-6">
              Describe the app you want to build using your voice or text.
              I'll ask questions to understand your needs, then generate a working app for you.
            </p>
            <div className="flex flex-col items-center gap-4">
              <LanguageSelector value={language} onChange={setLanguage} />
              <Button
                size="lg"
                onClick={() => setVoiceMode(true)}
                disabled={!voice.isSupported}
                className="gap-2 rounded-full px-8"
                data-testid="button-start-voice"
              >
                <Mic className="w-5 h-5" />
                Start Voice Mode
              </Button>
              {!voice.isSupported && (
                <p className="text-xs text-muted-foreground">
                  Voice input not supported in this browser. Use text instead.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-4">
            {loadingConversation ? (
              <div className="space-y-4 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <Skeleton className="h-16 flex-1 rounded-md" />
                  </div>
                ))}
              </div>
            ) : (
              allMessages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  role={msg.role as "user" | "assistant"}
                  content={msg.content}
                  onSpeak={msg.role === "assistant" ? (text) => voice.speak(text) : undefined}
                  isSpeaking={voice.isSpeaking}
                />
              ))
            )}
            {isStreaming && !streamingContent && (
              <div className="flex gap-3 py-4 px-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t bg-background p-4">
        <div className="max-w-3xl mx-auto">
          {allMessages.length > 0 && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <LanguageSelector value={language} onChange={setLanguage} />
              <Button
                size="sm"
                variant={autoSpeak ? "default" : "outline"}
                onClick={() => setAutoSpeak(!autoSpeak)}
                className="gap-1"
                data-testid="button-auto-speak"
              >
                {autoSpeak ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                Auto-speak {autoSpeak ? "on" : "off"}
              </Button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Button
              size="icon"
              variant={voiceMode ? "default" : "outline"}
              onClick={() => setVoiceMode(!voiceMode)}
              disabled={!voice.isSupported}
              data-testid="button-open-voice"
            >
              <Mic className="w-5 h-5" />
            </Button>
            <Textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your app or type a message..."
              className="min-h-[44px] max-h-[120px] resize-none text-sm"
              rows={1}
              data-testid="input-message"
            />
            <Button
              size="icon"
              onClick={handleSubmit}
              disabled={!inputText.trim() || isStreaming}
              data-testid="button-send"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full" data-testid="builder-page">
      {chatPanel}
      {voiceMode && (
        <div className="w-[340px] shrink-0 hidden md:flex">
          <VoiceOverlay
            isOpen={voiceMode}
            onClose={() => setVoiceMode(false)}
            isListening={voice.isListening}
            isSpeaking={voice.isSpeaking}
            isSupported={voice.isSupported}
            userSpeaking={voice.userSpeaking}
            audioLevel={voice.audioLevel}
            vadReady={voice.vadReady}
            interimTranscript={voice.interimTranscript}
            isStreaming={isStreaming}
            pendingSend={pendingSend}
            onStartListening={voice.startListening}
            onStopListening={voice.stopListening}
            onStopSpeaking={voice.stopSpeaking}
            language={language}
            onLanguageChange={setLanguage}
          />
        </div>
      )}
    </div>
  );
}
