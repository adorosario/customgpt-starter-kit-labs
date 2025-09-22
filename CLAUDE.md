# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Codebase Status

This is a clean v1 production-ready codebase. All development artifacts, TODO comments, and work-in-progress indicators have been removed. The code is professionally documented and ready for production deployment.

## Build and Development Commands

### Core Commands
```bash
# Install dependencies
pnpm install              # Preferred package manager
# or
npm install

# Development
pnpm dev                  # Start Next.js dev server (http://localhost:3000)
pnpm dev:widget           # Start widget dev server
pnpm dev:iframe           # Start iframe dev server
pnpm dev:https            # Start dev server with HTTPS

# Build
pnpm build                # Build Next.js standalone app
pnpm build:widget         # Build widget bundle (dist/widget/customgpt-widget.js)
pnpm build:iframe         # Build iframe app (dist/iframe/)
pnpm build:all            # Build everything

# Production
pnpm start                # Start production server

# Code Quality
pnpm lint                 # Run ESLint
pnpm type-check           # TypeScript type checking
```

## Architecture Overview

### Core Technology Stack
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI primitives
- **API Client**: Custom proxy client with server-side authentication

### Project Structure

```
src/
├── app/                  # Next.js App Router pages
│   ├── api/proxy/       # API proxy routes (adds auth headers server-side)
│   └── dashboard/       # Dashboard pages
├── components/          # React components
│   ├── chat/           # Chat UI components
│   ├── dashboard/      # Dashboard components
│   ├── projects/       # Project management components
│   └── ui/             # Reusable UI primitives
├── lib/                # Core utilities
│   ├── api/            # API client and proxy handler
│   └── streaming/      # SSE message streaming
├── store/              # Zustand state stores
│   └── widget-stores/  # Isolated stores for widget mode
└── widget/             # Widget-specific entry points
```

### Key Architectural Patterns

#### 1. API Proxy Architecture
All API calls go through Next.js API routes (`/api/proxy/*`) which:
- Add authentication headers server-side (API key never exposed to client)
- Handle CORS for widget deployments
- Transform requests/responses as needed

**Key files**:
- `src/lib/api/proxy-handler.ts` - Core proxy logic
- `src/lib/api/proxy-client.ts` - Client-side API interface
- `src/app/api/proxy/[...path]/route.ts` - Catch-all proxy route

#### 2. Multi-Deployment Architecture
The app supports three deployment modes:
- **Standalone**: Full Next.js app with dashboard
- **Widget**: Embeddable chat widget (webpack bundle)
- **Iframe**: Isolated iframe deployment

**Entry points**:
- Standalone: `src/app/page.tsx`
- Widget: `src/widget/index.tsx`
- Iframe: `src/widget/iframe-app.tsx`

#### 3. State Management
Uses Zustand with persistence for state management:
- **Global stores**: `src/store/*.ts` - Used in standalone mode
- **Widget stores**: `src/store/widget-stores/*.ts` - Isolated for widget mode

Key stores:
- `agents.ts` - Agent/project management (Note: UI uses "agents" but API uses "projects")
- `conversations.ts` - Conversation state
- `messages.ts` - Message handling with streaming support
- `config.ts` - Configuration and initialization

#### 4. Real-time Streaming
Server-Sent Events (SSE) for message streaming:
- `src/lib/streaming/handler.ts` - Global stream manager
- `src/lib/streaming/parser.ts` - SSE parsing utilities
- Handles concurrent streams, cleanup, and error recovery

## Environment Configuration

Required environment variables in `.env.local`:
```bash
# Required - Server-side only
CUSTOMGPT_API_KEY=your_api_key_here

# Optional
CUSTOMGPT_API_BASE_URL=https://app.customgpt.ai/api/v1
ALLOWED_ORIGINS=https://yourdomain.com
```

## Important Implementation Notes

### Feature Parity Rule
**IMPORTANT**: Only implement features that exist in the desktop version or are supported by the CustomGPT API:
- Do NOT add features like billing, logout, or settings that don't exist in desktop
- Do NOT create functionality that isn't backed by an API endpoint
- Always check desktop version for feature availability before implementing
- Mobile UI should be a responsive version of desktop, not have additional features

### API Terminology Mismatch
The codebase has a terminology mismatch:
- **UI/Store**: Uses "agents" terminology
- **API**: Uses "projects" endpoints
- The proxy client correctly maps to `/projects/*` endpoints

### Widget Isolation
Widget mode uses:
- Separate Zustand stores to prevent conflicts
- PostMessage API for iframe communication
- Isolated CSS to prevent style leaks

### File Upload Handling
- Uses FormData for multipart uploads
- Progress tracking via XMLHttpRequest
- Supports both direct file upload and sitemap-based agent creation

### Citation Preview
The `previewCitationFile` method uses the `/preview/[id]` endpoint for fetching citation file previews.

### Build Outputs
- **Widget**: `dist/widget/customgpt-widget.js` - Self-contained bundle
- **Iframe**: `dist/iframe/` - Separate HTML app
- **Standalone**: `.next/` - Next.js build output

## Common Development Tasks

### Adding a New API Endpoint
1. Add the route in `src/app/api/proxy/[endpoint]/route.ts`
2. Add the method in `src/lib/api/proxy-client.ts`
3. Add TypeScript types in `src/types/`

### Creating a New Component
1. Add component in appropriate directory under `src/components/`
2. Use existing UI primitives from `src/components/ui/`
3. Follow existing patterns for styling (Tailwind + cn() utility)

### Updating Widget Bundle
1. Make changes in relevant components
2. Run `npm run build:widget` to generate new bundle
3. Test with examples in `examples/` directory

### Fresh Conversation on App Start
The app is configured to always start with a fresh conversation (showing welcome screen with starter questions) rather than loading the last conversation. This is achieved by:
- Not persisting `currentConversation` in the conversation store's `partialize` function
- Setting `currentConversation` to null in the `onRehydrateStorage` callback
- The welcome screen with starter questions is shown when no messages exist in `ChatContainer`

### Loading States Throughout the App
Comprehensive loading indicators have been implemented across all major user interactions:

**Components**:
- `src/components/ui/loading.tsx` - Reusable loading components (Spinner, Skeleton, LoadingDots, etc.)

**Chat Interface**:
- **Message sending**: ChatInput shows spinner in send button while `isStreaming` is true
- **Conversation switching**: MessageArea shows message skeletons when switching between conversations
- **Message loading**: Skeleton messages appear briefly when loading conversation history

**Sidebar & Navigation**:
- **Conversation list**: ConversationSkeleton shown when fetching conversations
- **New conversation**: Spinner in "New Chat" button when creating conversations
- **Agent switching**: Loading overlay on AgentSelector when switching between agents

**Loading States Used**:
- `Spinner` - Rotating loading indicator for buttons and inline states
- `MessageSkeleton` - Chat message placeholder during loading
- `ConversationSkeleton` - Conversation list placeholder
- `LoadingOverlay` - Full overlay with backdrop blur for modal operations

