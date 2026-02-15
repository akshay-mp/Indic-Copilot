# Indic Copilot - AI App Builder

## Overview
Voice-driven AI app builder that lets users create web applications through voice conversations in any Indian language (and more). Powered by Claude AI for both planning conversations and app generation.

## Key Features
- Voice input/output via Web Speech API (20+ languages including Kannada, Hindi, Tamil, Telugu, etc.)
- Claude-powered planning phase: AI asks questions to understand app requirements
- App generation: Claude generates complete HTML/CSS/JS apps
- Dashboard to manage all generated apps with fullscreen preview
- Generated apps have database persistence (AppDB) and AI capabilities (AppAI with vision)
- Email/password authentication with user-scoped workspaces
- App sharing via unique share links (WhatsApp integration)
- Clone shared apps into your own workspace

## Architecture
- **Frontend**: React + TypeScript + Vite + TanStack Query + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + PostgreSQL (Drizzle ORM) + Anthropic Claude SDK
- **Auth**: Passport.js (local strategy, email/password) + express-session + connect-pg-simple
- **Voice**: Silero VAD (@ricky0123/vad-web, ONNX) + Web Speech API (STT) + SpeechSynthesis (TTS)
- **AI**: Replit AI Integrations for Anthropic (no API key needed)

## Project Structure
- `client/src/pages/builder.tsx` - Main voice chat builder interface
- `client/src/pages/dashboard.tsx` - Generated apps dashboard
- `client/src/pages/auth.tsx` - Login/register page
- `client/src/pages/shared-app.tsx` - Public shared app viewer
- `client/src/hooks/use-auth.tsx` - Auth hook (AuthProvider, useAuth)
- `client/src/components/` - Reusable UI components
- `client/src/hooks/use-voice.ts` - Voice hook (Silero VAD + Web Speech API)
- `client/src/components/voice-overlay.tsx` - Voice mode side panel (right side, chat stays visible on left)
- `client/src/components/particle-sphere.tsx` - Canvas-based animated atom visualization (orbiting electrons, reacts to voice states)
- `client/src/components/voice-button.tsx` - Mic button with VAD visual feedback (used in non-overlay contexts)
- `server/routes.ts` - All API endpoints
- `server/auth.ts` - Passport.js auth setup (register, login, logout, session)
- `server/storage.ts` - Database CRUD operations
- `shared/schema.ts` - Drizzle schema (users, conversations, messages, generatedApps, appStorage)

## API Routes
### Auth (public)
- `POST /api/register` - Create account (email, password, name)
- `POST /api/login` - Sign in (email, password)
- `POST /api/logout` - Sign out
- `GET /api/user` - Get current user (401 if not logged in)

### Protected (require auth)
- `GET/POST/DELETE /api/conversations` - Conversation CRUD (user-scoped)
- `GET /api/conversations/:id` - Get conversation with messages
- `POST /api/conversations/:id/messages` - Send message (SSE streaming)
- `GET/DELETE /api/apps` - Generated apps CRUD (user-scoped)
- `GET /api/apps/:id/serve` - Serves app HTML with injected AppDB + AppAI helpers
- `POST /api/apps/:id/share` - Generate share link for app
- `DELETE /api/apps/:id/share` - Disable sharing

### Public
- `GET /api/shared/:shareId` - Get shared app metadata
- `GET /api/shared/:shareId/serve` - Serve shared app HTML
- `POST /api/shared/:shareId/clone` - Clone shared app (requires auth)
- `GET/POST/PUT/DELETE /api/app-storage/:appId/:collection[/:docId]` - Document storage for generated apps
- `POST /api/app-ai/chat` - AI proxy for generated apps (supports text + vision/images)
- `POST /api/tts` - Text-to-speech via Sarvam AI REST API (bulbul:v3, speaker: shubh, returns WAV audio)

## Generated App Helpers (injected into served apps)
- **AppDB**: Collection-based document storage backed by PostgreSQL
  - Methods: list(), get(), create(), update(), remove(), clear()
  - All methods return Promises
- **AppAI**: AI proxy to Claude with vision support
  - `AppAI.ask(prompt)` - text Q&A
  - `AppAI.ask(prompt, file)` - image + text analysis (file = File/Blob/base64/dataURL)
  - `AppAI.analyzeImage(file, prompt)` - shorthand for image analysis
  - `AppAI.chat({messages, system})` - full chat with history
  - Supports Claude vision for image analysis (plant disease detection, document OCR, etc.)

## Conversation Flow
1. Planning phase: Claude asks clarifying questions about the app
2. User approves the plan (says "yes", "approve", etc.)
3. Build phase: Server sends `{ phase: "building" }` SSE event, then streams HTML silently (not displayed in chat, not sent to TTS)
4. Server detects HTML in response, saves as app, sends `{ appCreated: true, appId }` event
5. Client shows "Building your app..." indicator during generation, then toast on completion
6. In voice mode, speaks "Your app is ready!" instead of reading code aloud
7. ChatMessage component detects HTML content in saved messages and shows "App Generated" card instead of raw code

## Voice Architecture (Voice Sandwich)
- **VAD**: Silero VAD v5 running in browser via ONNX Runtime Web (@ricky0123/vad-web)
- **STT**: Browser Web Speech API (SpeechRecognition) - supports 20+ Indian languages via Chrome
- **TTS**: Sarvam AI (primary, via backend proxy) → Browser SpeechSynthesis (fallback)
  - Sarvam TTS: REST API (bulbul:v3 model, speaker: shubh), supports 11 Indian languages (kn, hi, ta, te, ml, mr, bn, gu, pa, od, en-IN)
  - Backend endpoint `/api/tts` calls Sarvam REST API directly (not SDK), returns WAV audio
  - Frontend plays audio via HTMLAudioElement, falls back to browser SpeechSynthesis if Sarvam unavailable
  - Requires SARVAM_API_KEY secret
  - Note: bulbul:v3 speakers differ from v2. Valid v3 speakers: shubh, aditya, ritu, ashutosh, priya, neha, rahul, etc.
- **Flow**: Click mic → VAD + STT start → Silero detects speech start/end → auto-send after silence → Claude responds
- **Voice Mode**: Side panel (340px right) with animated atom visualization, chat stays visible on left, auto-starts listening, continuous voice loop
- **Auto-speak**: Claude automatically reads responses aloud (truncated to 500 chars), resumes mic after TTS ends
- **Assets**: ONNX model + worklet + WASM files in client/public/

## Running
- `npm run dev` starts Express + Vite on port 5000
- `npm run db:push` syncs database schema
