import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import Anthropic from "@anthropic-ai/sdk";


const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

function getLanguageName(code: string): string {
  const map: Record<string, string> = {
    "kn-IN": "Kannada", "hi-IN": "Hindi", "ta-IN": "Tamil", "te-IN": "Telugu",
    "ml-IN": "Malayalam", "mr-IN": "Marathi", "bn-IN": "Bengali", "gu-IN": "Gujarati",
    "pa-IN": "Punjabi", "en-US": "English", "en-IN": "English", "es-ES": "Spanish",
    "fr-FR": "French", "de-DE": "German", "pt-BR": "Portuguese", "zh-CN": "Chinese",
    "ja-JP": "Japanese", "ko-KR": "Korean", "ar-SA": "Arabic", "ru-RU": "Russian",
  };
  return map[code] || "English";
}

const SYSTEM_PROMPT_PLANNING = (lang: string) => `You are VoiceForge, an AI app builder assistant. You help users plan and build web applications through conversation.

Your role during the PLANNING phase:
1. Ask clarifying questions to understand what the user wants to build
2. Understand the purpose, target audience, and key features
3. Keep questions focused and one at a time
4. After gathering enough info (usually 3-5 exchanges), present a clear app plan summary
5. When presenting the plan, format it clearly with sections for: App Name, Description, Key Features, and Pages/Screens
6. End your plan summary with: "Would you like me to build this app? Say 'yes' or 'approve' to start building!"

CRITICAL LANGUAGE RULE: You MUST respond ENTIRELY in ${lang}. Every single word of your response must be in ${lang}. The user has selected ${lang} as their language. Do NOT use English unless ${lang} is English. This is non-negotiable.
Keep responses concise and conversational - this is a voice-first interface designed for speaking aloud.`;

const SYSTEM_PROMPT_BUILD = (lang: string) => `You are VoiceForge, an AI app builder. The user has approved the app plan. Now generate the complete app.

Generate a SINGLE, complete, self-contained HTML file that includes:
- All HTML structure
- CSS styles (inline or in <style> tags) - make it modern, beautiful, and responsive
- JavaScript functionality (in <script> tags)
- Use modern CSS (flexbox, grid, custom properties)
- Make it mobile-responsive
- Use a clean, professional color scheme
- Include realistic placeholder content
- Make all interactive elements functional

The HTML must be completely self-contained with NO external dependencies.
Do NOT use any CDN links or external resources.

Return ONLY the HTML code, nothing else. No explanations, no markdown code blocks, just raw HTML.

CRITICAL: All user-facing text, labels, buttons, headings, placeholder content, and descriptions in the generated app MUST be in ${lang}. Do not use English text unless ${lang} is English.`;

const SYSTEM_PROMPT_PLANT = (lang: string) => `You are a plant disease expert. Analyze the plant image provided and give a detailed diagnosis.

Provide your analysis in ${lang} with these sections:
1. Plant Identification - What plant/crop this appears to be
2. Health Assessment - Overall health status
3. Disease/Issue Identified - Name of disease or problem if any
4. Symptoms Observed - What visual symptoms you see
5. Causes - Likely causes of the condition
6. Treatment Recommendations - How to treat/manage the issue
7. Prevention Tips - How to prevent this in the future

Be specific and practical. If the plant appears healthy, say so and provide general care tips.
If you cannot identify the plant clearly, mention that and provide your best assessment.`;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // --- Conversations ---
  app.get("/api/conversations", async (_req, res) => {
    try {
      const convs = await storage.getAllConversations();
      res.json(convs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ error: "Not found" });
      const msgs = await storage.getMessagesByConversation(id);
      res.json({ ...conv, messages: msgs });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      const { title, language } = req.body;
      const conv = await storage.createConversation({
        title: title || "New App",
        language: language || "en-US",
        phase: "planning",
      });
      res.status(201).json(conv);
    } catch (error) {
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // --- Chat with streaming ---
  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content, language: msgLanguage } = req.body;
      const conv = await storage.getConversation(conversationId);
      if (!conv) return res.status(404).json({ error: "Conversation not found" });

      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ error: "Message content is required" });
      }

      const activeLanguage = msgLanguage || conv.language || "en-US";

      if (msgLanguage && msgLanguage !== conv.language) {
        await storage.updateConversation(conversationId, { language: msgLanguage });
      }

      await storage.createMessage({ conversationId, role: "user", content: content.trim() });

      const existingMessages = await storage.getMessagesByConversation(conversationId);
      const langName = getLanguageName(activeLanguage);

      const isApproval = /\b(yes|approve|build|go ahead|haan|hā|hoon|ಹೌದು|oo|சரி|అవును|ശരി|हो|হ্যাঁ|હા|ਹਾਂ)\b/i.test(content);
      const assistantMessages = existingMessages.filter(m => m.role === "assistant");
      const hasPlan = assistantMessages.length >= 2 && conv.phase === "planning";

      let systemPrompt: string;
      let shouldBuildApp = false;

      if (isApproval && hasPlan) {
        systemPrompt = SYSTEM_PROMPT_BUILD(langName);
        shouldBuildApp = true;
        await storage.updateConversation(conversationId, { phase: "building" });
      } else {
        systemPrompt = SYSTEM_PROMPT_PLANNING(langName);
      }

      const chatMessages = existingMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 8192,
        system: systemPrompt,
        messages: chatMessages,
      });

      let fullResponse = "";

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const text = event.delta.text;
          if (text) {
            fullResponse += text;
            res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
          }
        }
      }

      await storage.createMessage({ conversationId, role: "assistant", content: fullResponse });

      if (shouldBuildApp) {
        let htmlContent = fullResponse;
        const htmlMatch = fullResponse.match(/```html\s*([\s\S]*?)```/);
        if (htmlMatch) {
          htmlContent = htmlMatch[1].trim();
        } else if (!fullResponse.trim().startsWith("<!DOCTYPE") && !fullResponse.trim().startsWith("<html")) {
          const codeMatch = fullResponse.match(/```\s*([\s\S]*?)```/);
          if (codeMatch) htmlContent = codeMatch[1].trim();
        }

        if (htmlContent.includes("<html") || htmlContent.includes("<!DOCTYPE") || htmlContent.includes("<body")) {
          const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
          const appTitle = titleMatch ? titleMatch[1] : conv.title;

          const app = await storage.createApp({
            conversationId,
            title: appTitle,
            description: conv.title,
            htmlContent,
            language: conv.language,
          });

          await storage.updateConversation(conversationId, { phase: "completed" });
          res.write(`data: ${JSON.stringify({ appCreated: true, appId: app.id })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Chat error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to process message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process message" });
      }
    }
  });

  // --- Generated Apps ---
  app.get("/api/apps", async (_req, res) => {
    try {
      const apps = await storage.getAllApps();
      res.json(apps);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch apps" });
    }
  });

  app.get("/api/apps/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const appData = await storage.getApp(id);
      if (!appData) return res.status(404).json({ error: "App not found" });
      res.json(appData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch app" });
    }
  });

  app.delete("/api/apps/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteApp(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete app" });
    }
  });

  // --- Plant Disease Analysis ---
  app.post("/api/plant-analyze", async (req, res) => {
    try {
      const { image, language } = req.body;
      if (!image) return res.status(400).json({ error: "Image required" });

      const langName = getLanguageName(language || "en-US");

      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const mediaType = image.match(/^data:(image\/\w+);base64,/)?.[1] || "image/jpeg";

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 8192,
        system: SYSTEM_PROMPT_PLANT(langName),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: "Please analyze this plant image for any diseases or health issues.",
              },
            ],
          },
        ],
      });

      const textContent = response.content.find((c) => c.type === "text");
      res.json({ analysis: textContent?.text || "Could not analyze the image." });
    } catch (error) {
      console.error("Plant analysis error:", error);
      res.status(500).json({ error: "Failed to analyze plant image" });
    }
  });

  // --- Sarvam TTS ---
  const sarvamLangMap: Record<string, string> = {
    "kn-IN": "kn-IN", "hi-IN": "hi-IN", "ta-IN": "ta-IN", "te-IN": "te-IN",
    "ml-IN": "ml-IN", "mr-IN": "mr-IN", "bn-IN": "bn-IN", "gu-IN": "gu-IN",
    "pa-IN": "pa-IN", "en-US": "en-IN", "en-IN": "en-IN", "or-IN": "od-IN",
  };

  app.post("/api/tts", async (req, res) => {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Sarvam API key not configured" });
    }

    const { text, language } = req.body;
    if (!text) return res.status(400).json({ error: "Text required" });

    const targetLang = sarvamLangMap[language || "en-US"];
    if (!targetLang) {
      return res.status(400).json({ error: "Language not supported by Sarvam TTS" });
    }

    try {
      const { SarvamAIClient } = await import("sarvamai");
      const client = new SarvamAIClient({ apiSubscriptionKey: apiKey });

      const ttsText = text.substring(0, 1500);

      const response = await client.textToSpeech.convert({
        text: ttsText,
        target_language_code: targetLang as any,
        speaker: "meera" as any,
        model: "bulbul:v2" as any,
        audio_format: "mp3" as any,
        sample_rate: 22050,
        pace: 1.0,
      });

      const audioBase64 = response.audios?.[0];
      if (!audioBase64) {
        return res.status(500).json({ error: "No audio generated" });
      }

      const audioBuffer = Buffer.from(audioBase64, "base64");
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
      });
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("Sarvam TTS error:", error.message || error);
      res.status(500).json({ error: "TTS failed: " + (error.message || "Unknown error") });
    }
  });

  return httpServer;
}
