# VoiceForge - AI App Builder

## Overview
Voice-driven AI app builder that lets users create web applications through voice conversations in any Indian language (and more). Powered by Claude AI for both planning conversations and app generation.

## Key Features
- Voice input/output via Web Speech API (20+ languages including Kannada, Hindi, Tamil, Telugu, etc.)
- Claude-powered planning phase: AI asks questions to understand app requirements
- App generation: Claude generates complete HTML/CSS/JS apps
- Plant Doctor: Upload plant photos for AI-powered disease diagnosis
- Dashboard to manage all generated apps with fullscreen preview

## Architecture
- **Frontend**: React + TypeScript + Vite + TanStack Query + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + PostgreSQL (Drizzle ORM) + Anthropic Claude SDK
- **Voice**: Browser Web Speech API (SpeechRecognition + SpeechSynthesis)
- **AI**: Replit AI Integrations for Anthropic (no API key needed)

## Project Structure
- `client/src/pages/builder.tsx` - Main voice chat builder interface
- `client/src/pages/dashboard.tsx` - Generated apps dashboard
- `client/src/pages/plant-doctor.tsx` - Plant disease identifier
- `client/src/components/` - Reusable UI components
- `client/src/hooks/use-voice.ts` - Web Speech API hook
- `server/routes.ts` - All API endpoints
- `server/storage.ts` - Database CRUD operations
- `shared/schema.ts` - Drizzle schema (conversations, messages, generatedApps)

## API Routes
- `GET/POST/DELETE /api/conversations` - Conversation CRUD
- `GET /api/conversations/:id` - Get conversation with messages
- `POST /api/conversations/:id/messages` - Send message (SSE streaming)
- `GET/DELETE /api/apps` - Generated apps CRUD
- `POST /api/plant-analyze` - Plant disease analysis (accepts base64 image)

## Conversation Flow
1. Planning phase: Claude asks clarifying questions about the app
2. User approves the plan (says "yes", "approve", etc.)
3. Build phase: Claude generates a complete HTML app
4. App is saved and viewable in the dashboard

## Running
- `npm run dev` starts Express + Vite on port 5000
- `npm run db:push` syncs database schema
