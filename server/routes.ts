import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { generatedApps } from "@shared/schema";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import WebSocket from "ws";
import { randomUUID } from "crypto";
import multer from "multer";


const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

function mergeMultiFileWebApp(response: string): string | null {
  const fileRegex = /<file\s+path="([^"]*)">\s*([\s\S]*?)<\/file>/g;
  const files: Record<string, string> = {};
  let match;
  while ((match = fileRegex.exec(response)) !== null) {
    files[match[1]] = match[2].trim();
  }

  const htmlFile = files["index.html"] || Object.entries(files).find(([k]) => k.endsWith(".html"))?.[1];
  if (!htmlFile || (!htmlFile.includes("<html") && !htmlFile.includes("<!DOCTYPE"))) {
    return null;
  }

  let merged = htmlFile;

  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith(".css")) {
      const linkPattern = new RegExp(`<link[^>]*href=["']${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*/?>`, "gi");
      merged = merged.replace(linkPattern, `<style>\n${content}\n</style>`);
    }
    if (path.endsWith(".js")) {
      const scriptPattern = new RegExp(`<script[^>]*src=["']${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>\\s*</script>`, "gi");
      merged = merged.replace(scriptPattern, `<script>\n${content}\n</script>`);
    }
  }

  return merged;
}

function extractHtmlFromResponse(response: string): string | null {
  const trimmed = response.trim();

  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return trimmed;
  }

  const htmlCodeBlock = response.match(/```html\s*([\s\S]*?)```/);
  if (htmlCodeBlock) {
    return htmlCodeBlock[1].trim();
  }

  const anyCodeBlock = response.match(/```\s*([\s\S]*?)```/);
  if (anyCodeBlock) {
    const code = anyCodeBlock[1].trim();
    if (code.includes("<html") || code.includes("<!DOCTYPE")) {
      return code;
    }
  }

  if (response.includes("<web_app>") || response.includes("<file ")) {
    const merged = mergeMultiFileWebApp(response);
    if (merged) return merged;
  }

  const doctypeIdx = response.indexOf("<!DOCTYPE");
  const htmlIdx = response.indexOf("<html");
  const startIdx = doctypeIdx >= 0 ? doctypeIdx : htmlIdx;
  if (startIdx >= 0) {
    const htmlEndMatch = response.indexOf("</html>", startIdx);
    if (htmlEndMatch >= 0) {
      return response.substring(startIdx, htmlEndMatch + 7).trim();
    }
    return response.substring(startIdx).trim();
  }

  return null;
}

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

const SYSTEM_PROMPT_PLANNING = (lang: string) => `You are Indic Copilot, an AI app builder assistant. You help users plan and build web applications through conversation.

Your role during the PLANNING phase:
1. Ask clarifying questions to understand what the user wants to build
2. Understand the purpose, target audience, and key features
3. Keep questions focused and one at a time
4. After gathering enough info (usually 3-5 exchanges), present a clear app plan summary
5. When presenting the plan, format it clearly with sections for: App Name, Description, Key Features, and Pages/Screens
6. End your plan summary with: "Would you like me to build this app? Say 'yes' or 'approve' to start building!"

CRITICAL LANGUAGE RULE: You MUST respond ENTIRELY in ${lang}. Every single word of your response must be in ${lang}. The user has selected ${lang} as their language. Do NOT use English unless ${lang} is English. This is non-negotiable.
Keep responses concise and conversational - this is a voice-first interface designed for speaking aloud.`;

const SYSTEM_PROMPT_BUILD = (lang: string) => `You are Indic Copilot, an AI app builder. The user has approved the app plan. Now generate the complete app.

CRITICAL OUTPUT FORMAT: Your entire response must be ONLY a single HTML file. Start your response with <!DOCTYPE html> and end with </html>. Do NOT include any text before or after the HTML. Do NOT use markdown code blocks. Do NOT wrap in <web_app>, <file>, or any other tags. Do NOT generate multiple files.

Generate a SINGLE, complete, self-contained HTML file that includes:
- All HTML structure
- All CSS styles in a single <style> tag inside <head>
- All JavaScript in a single <script> tag before </body>
- Use modern CSS (flexbox, grid, custom properties)
- Make it mobile-responsive
- Use a clean, professional color scheme
- Include realistic placeholder content
- Make all interactive elements functional

DATA PERSISTENCE - CRITICAL:
A global "AppDB" object is automatically injected into the page before your code runs. You MUST use AppDB for ALL data storage instead of localStorage. AppDB persists data to a real database.

AppDB API (all methods return Promises):
- AppDB.list("collection") → returns array of documents: [{id, ...fields, _createdAt, _updatedAt}]
- AppDB.get("collection", "docId") → returns single document or throws 404
- AppDB.create("collection", {field1: value1, ...}) → creates a new document with auto-generated id, returns it
- AppDB.create("collection", {field1: value1, ...}, "customId") → creates with specific id
- AppDB.update("collection", "docId", {field1: newValue, ...}) → updates document, returns it
- AppDB.remove("collection", "docId") → deletes a document
- AppDB.clear("collection") → deletes all documents in a collection

Example usage:
  // Save a customer
  await AppDB.create("customers", { name: "John", phone: "123" });
  // List all customers
  var customers = await AppDB.list("customers");
  // Update a customer
  await AppDB.update("customers", customers[0].id, { name: "Jane", phone: "456" });
  // Delete a customer
  await AppDB.remove("customers", customers[0].id);

IMPORTANT RULES for AppDB:
- Always use async/await or .then() since all AppDB methods return Promises
- Use descriptive collection names like "customers", "orders", "tasks", "products"
- Do NOT use localStorage, sessionStorage, or any client-side storage
- Load data from AppDB when the page loads using an async init function
- The document "id" field is a string, not a number

AI CAPABILITIES - AppAI:
A global "AppAI" object is also automatically injected. Use it when the app needs AI features like image analysis, text generation, classification, or Q&A.

AppAI API (all methods return Promises that resolve to a string response):
- AppAI.ask("question or prompt") → sends text to AI, returns AI response string
- AppAI.ask("analyze this image", file) → sends text + image to AI (file can be a File/Blob from <input type="file">, a base64 string, or a data URL)
- AppAI.analyzeImage(file, "optional prompt") → shorthand for image analysis
- AppAI.chat({messages: [...], system: "optional system prompt"}) → full chat with message history
  Messages format: [{role:"user", content:"text"}, {role:"assistant", content:"prev response"}, ...]
  For images in chat: {role:"user", content:[{type:"image", data:"base64...", mediaType:"image/jpeg"}, {type:"text", text:"describe this"}]}

Example - Image analysis app:
  // Get file from input
  var fileInput = document.getElementById('fileInput');
  var file = fileInput.files[0];
  // Analyze with AI
  var result = await AppAI.ask("What plant disease is shown in this image? Provide the disease name, symptoms, and treatment.", file);
  document.getElementById('result').textContent = result;

Example - Text Q&A:
  var answer = await AppAI.ask("What is the capital of Karnataka?");

IMPORTANT RULES for AppAI:
- Always use async/await or .then() since AppAI methods return Promises
- Show a loading indicator while waiting for AI responses (they take a few seconds)
- For image upload, use <input type="file" accept="image/*"> and pass the File object directly to AppAI.ask()
- AppAI can see and analyze images (photos, screenshots, documents, etc.)
- Handle errors with try/catch and show user-friendly error messages

The HTML must be completely self-contained with NO external dependencies.
Do NOT use any CDN links or external resources.

CRITICAL: All user-facing text, labels, buttons, headings, placeholder content, and descriptions in the generated app MUST be in ${lang}. Do not use English text unless ${lang} is English.

Remember: Output ONLY the raw HTML starting with <!DOCTYPE html>. Nothing else.`;


export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  function requireAuth(req: any, res: any, next: any) {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  }

  // --- Conversations ---
  app.get("/api/conversations", requireAuth, async (req: any, res) => {
    try {
      const convs = await storage.getAllConversations(req.user.id);
      res.json(convs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ error: "Not found" });
      if (conv.userId && conv.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const msgs = await storage.getMessagesByConversation(id);
      res.json({ ...conv, messages: msgs });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", requireAuth, async (req: any, res) => {
    try {
      const { title, language } = req.body;
      const conv = await storage.createConversation({
        title: title || "New App",
        language: language || "en-US",
        phase: "planning",
        userId: req.user.id,
      });
      res.status(201).json(conv);
    } catch (error) {
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete("/api/conversations/:id", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const conv = await storage.getConversation(id);
      if (conv && conv.userId && conv.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      await storage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // --- Chat with streaming ---
  app.post("/api/conversations/:id/messages", requireAuth, async (req: any, res) => {
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

      const approvalWords = [
        "yes", "approve", "build it", "go ahead", "sure", "do it", "let's go",
        "haan", "theek hai", "banao", "shuru karo",
        "ಹೌದು", "ಒಪ್ಪುತ್ತೇನೆ", "ಶುರು ಮಾಡಿ", "ಮಾಡಿಕೊಡಿ", "ಕಟ್ಟು", "ಕಟ್ಟಿ", "ರೆಡಿ",
        "சரி", "ஆமா", "செய்யுங்கள்", "தொடங்கு",
        "అవును", "చేయండి", "మొదలు పెట్టండి",
        "ശരി", "ചെയ്യൂ", "തുടങ്ങൂ",
        "हां", "हाँ", "बनाओ", "शुरू करो",
        "হ্যাঁ", "শুরু করো",
        "હા", "શરૂ કરો",
        "ਹਾਂ", "ਸ਼ੁਰੂ ਕਰੋ",
        "ହଁ",
      ];
      const contentLower = content.trim().toLowerCase();
      const isShortApproval = content.trim().length < 60;
      const isApproval = isShortApproval && approvalWords.some(w => {
        const word = w.toLowerCase();
        if (/^[a-z\s]+$/.test(word)) {
          const regex = new RegExp(`\\b${word}\\b`, "i");
          return regex.test(contentLower);
        }
        return contentLower.includes(word);
      });
      const assistantMessages = existingMessages.filter(m => m.role === "assistant");
      const lastAssistantMsg = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1].content : "";
      const planIndicators = ["?", "ಕಟ್ಟಲಾ", "ಮುಂದುವರಿಯಲಾ", "ಒಪ್ಪುತ್ತೀರಾ", "build", "approve", "ready",
        "बनाएं", "शुरू", "செய்யலாமா", "చేయమంటారా", "ചെയ്യട്ടെ", "কর", "કરું", "ਕਰਾਂ", "କରିବା"];
      const lastMsgAskedForApproval = planIndicators.some(p => lastAssistantMsg.toLowerCase().includes(p.toLowerCase()));
      const hasPlan = assistantMessages.length >= 3 && conv.phase === "planning" && lastMsgAskedForApproval;

      let systemPrompt: string;
      let shouldBuildApp = false;

      if (isApproval && hasPlan) {
        console.log(`[BUILD] Approval detected for conversation ${conversationId}, triggering build phase`);
        systemPrompt = SYSTEM_PROMPT_BUILD(langName);
        shouldBuildApp = true;
        await storage.updateConversation(conversationId, { phase: "building" });
      } else {
        systemPrompt = SYSTEM_PROMPT_PLANNING(langName);
      }

      let chatMessages = existingMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      if (shouldBuildApp) {
        res.write(`data: ${JSON.stringify({ phase: "building" })}\n\n`);
        chatMessages.push({
          role: "user" as const,
          content: "The user has approved the plan. Now generate the complete app as a single HTML file. Start your response with <!DOCTYPE html> immediately. Do NOT include any text, explanation, or markdown — output ONLY the HTML code.",
        });
      }

      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: shouldBuildApp ? 16384 : 8192,
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
        let htmlContent = extractHtmlFromResponse(fullResponse);
        console.log(`[BUILD] HTML extraction result: ${htmlContent ? `success (${htmlContent.length} chars)` : "FAILED"}`);

        if (htmlContent && !htmlContent.includes("</html>")) {
          console.warn("[BUILD] WARNING: Generated HTML appears truncated (missing </html> closing tag). Appending closing tags.");
          if (!htmlContent.includes("</script>")) {
            htmlContent += "\n    </script>";
          }
          if (!htmlContent.includes("</body>")) {
            htmlContent += "\n</body>";
          }
          htmlContent += "\n</html>";
        }

        if (htmlContent) {
          const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
          const appTitle = titleMatch ? titleMatch[1] : conv.title;

          const app = await storage.createApp({
            conversationId,
            title: appTitle,
            description: conv.title,
            htmlContent,
            language: conv.language,
            userId: req.user.id,
          });

          await storage.updateConversation(conversationId, { phase: "completed" });
          res.write(`data: ${JSON.stringify({ appCreated: true, appId: app.id })}\n\n`);
        } else {
          console.log(`[BUILD] HTML extraction failed, resetting conversation ${conversationId} to planning phase`);
          await storage.updateConversation(conversationId, { phase: "planning" });
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

  // --- Recover apps from messages that contain HTML but were never saved ---
  app.post("/api/apps/recover", requireAuth, async (req: any, res) => {
    try {
      const allConvs = await storage.getAllConversations(req.user.id);
      let recovered = 0;

      for (const conv of allConvs) {
        const existingApps = await db.select().from(generatedApps).where(eq(generatedApps.conversationId, conv.id));
        if (existingApps.length > 0) continue;

        const msgs = await storage.getMessagesByConversation(conv.id);
        for (const msg of msgs) {
          if (msg.role !== "assistant") continue;
          const html = extractHtmlFromResponse(msg.content);
          if (html) {
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            const appTitle = titleMatch ? titleMatch[1] : conv.title;
            await storage.createApp({
              conversationId: conv.id,
              title: appTitle,
              description: conv.title,
              htmlContent: html,
              language: conv.language,
              userId: req.user.id,
            });
            await storage.updateConversation(conv.id, { phase: "completed" });
            recovered++;
            break;
          }
        }
      }

      res.json({ recovered, message: `Recovered ${recovered} apps from existing conversations.` });
    } catch (error) {
      console.error("Recovery error:", error);
      res.status(500).json({ error: "Failed to recover apps" });
    }
  });

  // --- Generated Apps ---
  app.get("/api/apps", requireAuth, async (req: any, res) => {
    try {
      const apps = await storage.getAllApps(req.user.id);
      res.json(apps);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch apps" });
    }
  });

  app.get("/api/apps/:id", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const appData = await storage.getApp(id);
      if (!appData) return res.status(404).json({ error: "App not found" });
      if (appData.userId && appData.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      res.json(appData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch app" });
    }
  });

  app.delete("/api/apps/:id", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const appData = await storage.getApp(id);
      if (appData && appData.userId && appData.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      await storage.deleteApp(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete app" });
    }
  });

  // --- App Sharing ---
  app.post("/api/apps/:id/share", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const appData = await storage.getApp(id);
      if (!appData) return res.status(404).json({ error: "App not found" });
      if (appData.userId && appData.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });

      if (appData.shareId) {
        return res.json({ shareId: appData.shareId });
      }

      const shareId = randomUUID().slice(0, 8);
      const updated = await storage.setAppShareId(id, shareId);
      res.json({ shareId: updated?.shareId });
    } catch (error) {
      res.status(500).json({ error: "Failed to share app" });
    }
  });

  app.delete("/api/apps/:id/share", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const appData = await storage.getApp(id);
      if (!appData) return res.status(404).json({ error: "App not found" });
      if (appData.userId && appData.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });

      await storage.setAppShareId(id, "");
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to unshare app" });
    }
  });

  app.get("/api/shared/:shareId", async (req, res) => {
    try {
      const appData = await storage.getAppByShareId(req.params.shareId);
      if (!appData) return res.status(404).json({ error: "Shared app not found" });
      res.json({ id: appData.id, title: appData.title, description: appData.description, language: appData.language });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shared app" });
    }
  });

  app.get("/api/shared/:shareId/serve", async (req, res) => {
    try {
      const appData = await storage.getAppByShareId(req.params.shareId);
      if (!appData) return res.status(404).send("Shared app not found");

      const appLang = appData.language || "en-US";
      const appHelpersScript = `<script>
(function(){
  var APP_ID = ${appData.id};
  var APP_LANG = "${appLang}";
  var BASE = window.location.origin;
  window.AppDB = {
    list: function(c){return fetch(BASE+"/api/app-storage/"+APP_ID+"/"+c).then(function(r){return r.json()})},
    get: function(c,id){return fetch(BASE+"/api/app-storage/"+APP_ID+"/"+c+"/"+id).then(function(r){return r.json()})},
    create: function(c,d){return fetch(BASE+"/api/app-storage/"+APP_ID+"/"+c,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}).then(function(r){return r.json()})},
    update: function(c,id,d){return fetch(BASE+"/api/app-storage/"+APP_ID+"/"+c+"/"+id,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}).then(function(r){return r.json()})},
    remove: function(c,id){return fetch(BASE+"/api/app-storage/"+APP_ID+"/"+c+"/"+id,{method:"DELETE"})},
    clear: function(c){var url=BASE+"/api/app-storage/"+APP_ID;if(c)url+="/"+c;return fetch(url,{method:"DELETE"})}
  };
})();
</script>`;
      const htmlWithHelpers = appData.htmlContent.replace("</head>", appHelpersScript + "\n</head>");
      res.setHeader("Content-Type", "text/html");
      res.send(htmlWithHelpers);
    } catch (error) {
      res.status(500).send("Failed to serve shared app");
    }
  });

  app.post("/api/shared/:shareId/clone", requireAuth, async (req: any, res) => {
    try {
      const appData = await storage.getAppByShareId(req.params.shareId);
      if (!appData) return res.status(404).json({ error: "Shared app not found" });

      const clonedApp = await storage.createApp({
        title: appData.title + " (clone)",
        description: appData.description,
        htmlContent: appData.htmlContent,
        language: appData.language,
        userId: req.user.id,
      });
      res.status(201).json(clonedApp);
    } catch (error) {
      res.status(500).json({ error: "Failed to clone app" });
    }
  });

  // --- App Serve (serves HTML from real URL so fetch works in iframe) ---
  app.get("/api/apps/:id/serve", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const appData = await storage.getApp(id);
      if (!appData) return res.status(404).send("App not found");

      const appLang = appData.language || "en-US";

      const appHelpersScript = `<script>
(function(){
  var APP_ID = ${id};
  var APP_LANG = "${appLang}";
  var BASE = '/api/app-storage/' + APP_ID;
  function _uid(){return Date.now().toString(36)+Math.random().toString(36).substr(2,9);}
  function _req(method,url,body){
    var opts={method:method,headers:{'Content-Type':'application/json'}};
    if(body)opts.body=JSON.stringify(body);
    return fetch(url,opts).then(function(r){if(!r.ok)throw new Error(r.statusText);return r.status===204?null:r.json();});
  }
  window.AppDB = {
    appId: APP_ID,
    list: function(collection){return _req('GET',BASE+'/'+encodeURIComponent(collection));},
    get: function(collection,docId){return _req('GET',BASE+'/'+encodeURIComponent(collection)+'/'+encodeURIComponent(docId));},
    create: function(collection,data,docId){
      var d=docId||_uid();
      return _req('POST',BASE+'/'+encodeURIComponent(collection),{docId:d,data:data});
    },
    update: function(collection,docId,data){return _req('PUT',BASE+'/'+encodeURIComponent(collection)+'/'+encodeURIComponent(docId),{data:data});},
    remove: function(collection,docId){return _req('DELETE',BASE+'/'+encodeURIComponent(collection)+'/'+encodeURIComponent(docId));},
    clear: function(collection){return _req('DELETE',BASE+'/'+(collection?encodeURIComponent(collection):'_all'));}
  };
  function _fileToBase64(file){
    return new Promise(function(resolve,reject){
      var reader=new FileReader();
      reader.onload=function(){
        var dataUrl=reader.result;
        var base64=dataUrl.split(',')[1];
        var mediaType=file.type||'image/jpeg';
        resolve({base64:base64,mediaType:mediaType});
      };
      reader.onerror=reject;
      reader.readAsDataURL(file);
    });
  }
  window.AppAI = {
    language: APP_LANG,
    chat: function(opts){
      return _req('POST','/api/app-ai/chat',{
        messages: opts.messages,
        system: opts.system||undefined,
        appId: APP_ID,
        language: APP_LANG
      }).then(function(r){return r.content;});
    },
    ask: function(prompt, imageOrFile){
      if(!imageOrFile){
        return window.AppAI.chat({messages:[{role:'user',content:prompt}]});
      }
      var p;
      if(imageOrFile instanceof File || imageOrFile instanceof Blob){
        p=_fileToBase64(imageOrFile);
      } else if(typeof imageOrFile==='string'){
        var mediaType='image/jpeg';
        var b64=imageOrFile;
        if(imageOrFile.startsWith('data:')){
          var parts=imageOrFile.split(',');
          b64=parts[1];
          var mMatch=parts[0].match(/data:([^;]+)/);
          if(mMatch)mediaType=mMatch[1];
        }
        p=Promise.resolve({base64:b64,mediaType:mediaType});
      } else {
        p=Promise.resolve(imageOrFile);
      }
      return p.then(function(img){
        return window.AppAI.chat({messages:[{role:'user',content:[
          {type:'image',data:img.base64,mediaType:img.mediaType},
          {type:'text',text:prompt}
        ]}]});
      });
    },
    analyzeImage: function(file, prompt){
      return window.AppAI.ask(prompt||'Analyze this image in detail.',file);
    }
  };
  setTimeout(function(){
    if(typeof window.showAlert==='undefined'){
      window.showAlert=function(msg,type){
        var el=document.getElementById('alertContainer')||document.getElementById('alert');
        if(!el)return;
        el.innerHTML='<div style="padding:12px 16px;border-radius:8px;margin-bottom:12px;'+(type==='error'||type==='danger'?'background:#ffebee;color:#c62828;border-left:4px solid #f44336;':'background:#e8f5e9;color:#2e7d32;border-left:4px solid #4caf50;')+'">'+msg+'</div>';
        if(type!=='error'&&type!=='danger'){setTimeout(function(){if(typeof window.hideAlert==='function')window.hideAlert();else if(el)el.innerHTML='';},3000);}
      };
    }
    if(typeof window.hideAlert==='undefined'){
      window.hideAlert=function(){
        var el=document.getElementById('alertContainer')||document.getElementById('alert');
        if(el)el.innerHTML='';
      };
    }
    if(typeof window.formatDateTime==='undefined'){
      window.formatDateTime=function(d){
        if(!(d instanceof Date)||isNaN(d))return '';
        return d.getDate().toString().padStart(2,'0')+'/'+
          (d.getMonth()+1).toString().padStart(2,'0')+'/'+
          d.getFullYear()+' '+
          d.getHours().toString().padStart(2,'0')+':'+
          d.getMinutes().toString().padStart(2,'0');
      };
    }
  },0);
})();
</script>`;

      let html = appData.htmlContent;
      if (html.includes("<head>")) {
        html = html.replace("<head>", "<head>" + appHelpersScript);
      } else if (html.includes("<html")) {
        html = html.replace(/<html[^>]*>/, "$&" + appHelpersScript);
      } else {
        html = appHelpersScript + html;
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      res.status(500).send("Failed to serve app");
    }
  });

  // --- App Storage API ---
  app.get("/api/app-storage/:appId/:collection", async (req, res) => {
    try {
      const appId = parseInt(req.params.appId);
      const { collection } = req.params;
      const docs = await storage.listAppStorage(appId, collection);
      res.json(docs);
    } catch (error) {
      res.status(500).json({ error: "Failed to list documents" });
    }
  });

  app.get("/api/app-storage/:appId/:collection/:docId", async (req, res) => {
    try {
      const appId = parseInt(req.params.appId);
      const { collection, docId } = req.params;
      const doc = await storage.getAppStorageDoc(appId, collection, docId);
      if (!doc) return res.status(404).json({ error: "Document not found" });
      res.json(doc);
    } catch (error) {
      res.status(500).json({ error: "Failed to get document" });
    }
  });

  app.post("/api/app-storage/:appId/:collection", async (req, res) => {
    try {
      const appId = parseInt(req.params.appId);
      const { collection } = req.params;
      const { docId, data } = req.body;
      if (!data) return res.status(400).json({ error: "data field required" });
      const id = docId || (Date.now().toString(36) + Math.random().toString(36).substr(2, 9));
      const doc = await storage.createAppStorageDoc(appId, collection, id, data);
      res.status(201).json(doc);
    } catch (error) {
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  app.put("/api/app-storage/:appId/:collection/:docId", async (req, res) => {
    try {
      const appId = parseInt(req.params.appId);
      const { collection, docId } = req.params;
      const { data } = req.body;
      if (!data) return res.status(400).json({ error: "data field required" });
      const existing = await storage.getAppStorageDoc(appId, collection, docId);
      let doc;
      if (existing) {
        doc = await storage.updateAppStorageDoc(appId, collection, docId, data);
      } else {
        doc = await storage.createAppStorageDoc(appId, collection, docId, data);
      }
      res.json(doc);
    } catch (error) {
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/app-storage/:appId/:collection/:docId", async (req, res) => {
    try {
      const appId = parseInt(req.params.appId);
      const { collection, docId } = req.params;
      if (docId === "_all") {
        await storage.clearAppStorage(appId, collection === "_all" ? undefined : collection);
      } else {
        await storage.deleteAppStorageDoc(appId, collection, docId);
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // --- App AI Proxy (lets generated apps call Claude with vision) ---
  const MAX_IMAGE_BASE64_LENGTH = 10 * 1024 * 1024; // ~7.5MB decoded
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

  const LANG_NAMES: Record<string, string> = {
    "kn-IN": "Kannada", "hi-IN": "Hindi", "ta-IN": "Tamil", "te-IN": "Telugu",
    "ml-IN": "Malayalam", "mr-IN": "Marathi", "bn-IN": "Bengali", "gu-IN": "Gujarati",
    "pa-IN": "Punjabi", "or-IN": "Odia", "od-IN": "Odia", "en-US": "English", "en-IN": "English",
  };

  function _buildAppAISystemPrompt(language?: string): string {
    const langCode = language || "en-US";
    const langName = LANG_NAMES[langCode] || "English";
    if (langName === "English") {
      return "You are a helpful AI assistant embedded in a web application. Be concise and helpful.";
    }
    return `You are a helpful AI assistant embedded in a web application. Be concise and helpful. IMPORTANT: You MUST respond entirely in ${langName} (${langCode}). All your text output must be in ${langName}. Do not respond in English unless the user explicitly writes in English.`;
  }

  app.post("/api/app-ai/chat", async (req, res) => {
    try {
      const { messages, system, appId, language } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array required" });
      }

      // Ensure language has a default if missing
      const appLanguage = language || "kn-IN";

      if (messages.length > 20) {
        return res.status(400).json({ error: "Too many messages (max 20)" });
      }

      // Verify app exists if appId provided
      if (appId) {
        const id = parseInt(String(appId));
        if (!isNaN(id)) {
          const appExists = await storage.getApp(id);
          if (!appExists) {
            console.warn(`App AI proxy: App ${id} not found`);
          }
        }
      }

      const anthropicMessages: any[] = messages.map((msg: any) => {
        if (msg.role !== "user" && msg.role !== "assistant") {
          return { role: "user", content: String(msg.content || "").substring(0, 10000) };
        }

        if (msg.role === "user" && Array.isArray(msg.content)) {
          const contentParts: any[] = [];
          for (const part of msg.content) {
            if (part.type === "text") {
              contentParts.push({ type: "text", text: String(part.text || "").substring(0, 10000) });
            } else if (part.type === "image") {
              const base64Data = String(part.data || "");
              const mediaType = String(part.mediaType || "image/jpeg");
              if (!ALLOWED_IMAGE_TYPES.includes(mediaType)) {
                throw new Error("Unsupported image type: " + mediaType + ". Use JPEG, PNG, GIF, or WebP.");
              }
              if (base64Data.length > MAX_IMAGE_BASE64_LENGTH) {
                throw new Error("Image too large. Maximum size is about 7.5MB.");
              }
              if (base64Data.length === 0) {
                throw new Error("Empty image data");
              }
              contentParts.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data,
                },
              });
            }
          }
          return { role: "user", content: contentParts };
        }

        return { role: msg.role, content: String(msg.content || "").substring(0, 10000) };
      });

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: system ? String(system) : _buildAppAISystemPrompt(appLanguage),
        messages: anthropicMessages,
      });

      const textContent = response.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("");

      res.json({
        content: textContent,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      });
    } catch (error: any) {
      console.error("[APP-AI] Error:", error?.message || error);
      res.status(500).json({ error: error?.message || "AI request failed" });
    }
  });

  // --- Sarvam Language Mapping ---
  const sarvamLangMap: Record<string, string> = {
    "kn-IN": "kn-IN", "hi-IN": "hi-IN", "ta-IN": "ta-IN", "te-IN": "te-IN",
    "ml-IN": "ml-IN", "mr-IN": "mr-IN", "bn-IN": "bn-IN", "gu-IN": "gu-IN",
    "pa-IN": "pa-IN", "en-US": "en-IN", "en-IN": "en-IN", "or-IN": "od-IN", "od-IN": "od-IN",
  };

  // --- Multer setup for file uploads ---
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
  });

  // --- Sarvam STT ---
  app.post("/api/stt", upload.single("file"), async (req: any, res) => {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Sarvam API key not configured" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Audio file required" });
    }

    const language = req.body.language || "en-US";
    const mode = req.body.mode || "transcribe";
    const targetLang = sarvamLangMap[language] || "unknown";

    try {
      console.log(`[STT] Processing audio: ${req.file.size} bytes, lang: ${targetLang}, mode: ${mode}`);

      // Create FormData for Sarvam API
      const formData = new FormData();

      // Convert buffer to Blob and append to FormData
      const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "saaras:v3");
      formData.append("language_code", targetLang);
      formData.append("mode", mode);

      const sarvamRes = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: {
          "api-subscription-key": apiKey,
        },
        body: formData,
      });

      if (!sarvamRes.ok) {
        const errBody = await sarvamRes.text();
        console.error("Sarvam STT API error:", errBody);
        return res.status(sarvamRes.status).json({ error: "STT failed: " + errBody });
      }

      const data = await sarvamRes.json() as {
        transcript: string;
        language_code?: string;
        language_probability?: number;
      };

      console.log(`[STT] Success: "${data.transcript.substring(0, 50)}..."`);

      res.json({
        transcript: data.transcript,
        language_code: data.language_code,
        language_probability: data.language_probability,
      });
    } catch (error: any) {
      console.error("Sarvam STT error:", error.message || error);
      res.status(500).json({ error: "STT failed: " + (error.message || "Unknown error") });
    }
  });

  // --- Sarvam TTS ---

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
      const ttsText = text.substring(0, 1500);

      const sarvamRes = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": apiKey,
        },
        body: JSON.stringify({
          text: ttsText,
          target_language_code: targetLang,
          speaker: "shubh",
          model: "bulbul:v3",
          output_audio_codec: "wav",
        }),
      });

      if (!sarvamRes.ok) {
        const errBody = await sarvamRes.text();
        console.error("Sarvam TTS API error:", errBody);
        return res.status(sarvamRes.status).json({ error: "TTS failed: " + errBody });
      }

      const data = await sarvamRes.json() as { audios?: string[] };
      const audioBase64 = data.audios?.[0];
      if (!audioBase64) {
        return res.status(500).json({ error: "No audio generated" });
      }

      const audioBuffer = Buffer.from(audioBase64, "base64");
      res.set({
        "Content-Type": "audio/wav",
        "Content-Length": audioBuffer.length.toString(),
      });
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("Sarvam TTS error:", error.message || error);
      res.status(500).json({ error: "TTS failed: " + (error.message || "Unknown error") });
    }
  });

  // --- Sarvam Streaming TTS (WebSocket → SSE) ---
  app.post("/api/tts-stream", async (req, res) => {
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

    const ttsText = text.substring(0, 3000);

    // Set up SSE response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    let wsCleanedUp = false;
    const cleanup = (ws: WebSocket) => {
      if (wsCleanedUp) return;
      wsCleanedUp = true;
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch { }
    };

    try {
      const wsUrl = `wss://api.sarvam.ai/text-to-speech/streaming?api-subscription-key=${encodeURIComponent(apiKey)}`;
      const ws = new WebSocket(wsUrl);

      // Timeout: close if no response after 30s
      const timeout = setTimeout(() => {
        console.error("Sarvam streaming TTS: timeout");
        res.write(`data: ${JSON.stringify({ error: "Streaming TTS timeout" })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        cleanup(ws);
        res.end();
      }, 30000);

      // Track if client disconnects
      req.on("close", () => {
        clearTimeout(timeout);
        cleanup(ws);
      });

      ws.on("open", () => {
        console.log("Sarvam streaming TTS: WebSocket connected");

        // 1. Send config
        ws.send(JSON.stringify({
          type: "config",
          data: {
            target_language_code: targetLang,
            speaker: "shubh",
            output_audio_codec: "mp3",
            min_buffer_size: 50,
            max_chunk_length: 200,
          },
        }));

        // 2. Send text
        ws.send(JSON.stringify({
          type: "text",
          data: { text: ttsText },
        }));

        // 3. Send flush to start processing
        ws.send(JSON.stringify({ type: "flush" }));
      });

      ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === "audio" && msg.data?.audio) {
            // Forward audio chunk as SSE
            res.write(`data: ${JSON.stringify({
              audio: msg.data.audio,
              contentType: msg.data.content_type || "audio/mp3",
            })}\n\n`);
          } else if (msg.type === "event") {
            console.log("Sarvam streaming TTS: event", msg.data?.event_type);
            if (msg.data?.event_type === "final") {
              clearTimeout(timeout);
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              cleanup(ws);
              res.end();
            }
          } else if (msg.type === "error") {
            console.error("Sarvam streaming TTS: error message", msg.data);
            clearTimeout(timeout);
            res.write(`data: ${JSON.stringify({ error: msg.data?.message || "Streaming TTS error" })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            cleanup(ws);
            res.end();
          }
        } catch (parseErr) {
          console.error("Sarvam streaming TTS: parse error", parseErr);
        }
      });

      ws.on("error", (err) => {
        console.error("Sarvam streaming TTS: WebSocket error", err.message);
        clearTimeout(timeout);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: "WebSocket error: " + err.message })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
        }
      });

      ws.on("close", () => {
        clearTimeout(timeout);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
        }
      });

    } catch (error: any) {
      console.error("Sarvam streaming TTS error:", error.message || error);
      if (!res.headersSent) {
        res.status(500).json({ error: "TTS stream failed: " + (error.message || "Unknown error") });
      } else if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    }
  });

  return httpServer;
}
