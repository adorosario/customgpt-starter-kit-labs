Detailed Implementation Prompt for Cursor: Rate Limiting in CustomGPT.ai Starter Kit
You are an expert full-stack developer specializing in Next.js 14, TypeScript, Redis (Upstash), JWT/OIDC auth, and secure API middleware. Your mission is to iteratively implement enterprise-grade rate limiting for the open-source CustomGPT.ai Starter Kit. The project is already cloned, set up, and dependencies are installed via pnpm—do not instruct on installation or pnpm commands unless specifically asked. Assume the existing structure (e.g., app/api/proxy/[...path]/route.ts for proxies, src/components/ for widgets, demo mode with localStorage) and improvise integrations to fit seamlessly without breaking current features like chat streaming, voice, or widget embeds. If anything is unclear or could break existing code (e.g., proxy route handling, demo mode), ask the user a clarifying question before proceeding—do not assume or risk issues.
The feature enforces per-user quotas on proxy routes to prevent abuse. Implement incrementally via milestones—complete one fully (code + manual tests + Playwright/K6 + docs) before the next—so the user can manually verify each part. Use Upstash Redis for counters. Target: <10ms overhead at P95 under 50 RPS on Vercel. All features must be fully implemented as described.
For tools requiring API keys (e.g., Upstash Redis, Cloudflare Turnstile):

Upstash Redis: Sign up at upstash.com (free tier available); create a database, get UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from the dashboard.
Cloudflare Turnstile: Sign up at cloudflare.com (free); create a site, get TURNSTILE_SITE_KEY (public) and TURNSTILE_SECRET_KEY (private) from the Turnstile widget settings.
JWT Verification (if using): For testing, generate a sample JWT via jwt.io or tools like Auth0 (free tier)—use JWT_SECRET as a symmetric key for dev.Add these to .env.local as needed.

Create/update a documentation file docs/rate-limiting.md in the project root's docs/ folder (create if missing). This MD should detail the "Rate Limiting" feature: overview, config options, how to enable, integration examples (e.g., passing external_id), and full testing guides. Update it per milestone with new sections. Also update the main README.md with a summary and links to this doc.
Testing: Focus on manual tests (curl/Postman/browser) first for quick verification. Then use Playwright for E2E (setup in playwright.config.ts if needed) and K6 for load (scripts in tests/load/). No Jest/unit tests—skip them entirely. Provide detailed test instructions in docs/rate-limiting.md per milestone.
Overall Goals & KPIs

Correctness: Enforce quotas across identities; reset windows; 429 with GitHub-style headers (X-RateLimit-Limit, Remaining, Reset) + Retry-After.
Performance: Async Redis; <10ms P95 (K6 test).
DX: One-file config (config/rate-limits.json); examples in docs; admin UI for checks.
Security: Server-only; Turnstile verified; no keys in browser.
Auditability: JSON logs; CSV/Prometheus export.
Acceptance: Playwright proves flows; K6 load passes; all features in docs/rate-limiting.md implemented and testable.

Milestone 1: Identity Waterfall (Server-Side User Identification)
Goal: Build/test extractor for identityKey. Integrate minimally without breaking proxies.
Implementation Steps

Create src/lib/identity.ts: Export async function getIdentityKey(request: NextRequest): Promise<string>.
Configurable order: Load from config/rate-limits.json (create if missing): { "identityOrder": ["jwt-sub", "session-cookie", "ip"], "jwtSecret": "sk-..." }. Use Zod for validation (assume installed).
JWT: From Authorization: Bearer <token>; decode/verify sub with jose (improvise: if no secret, extract unverified for dev; ask if verification needed).
Session: From cookie sessionId (use cookies(); integrate with existing session if present, e.g., demo mode).
IP: headers().get('x-forwarded-for')?.split(',')[0] || request.ip; hash with crypto.subtle.digest('SHA-256', ...) → base64 for privacy.
Prefix keys (e.g., "jwt:user123"); fallback chain; default "anonymous".
Improvise: If existing auth (e.g., demo localStorage), ensure fallback doesn't conflict—ask if unsure.


Temp Test Route: Add app/api/test-identity/route.ts for verification (GET returns { key }).
Docs: In docs/rate-limiting.md, add "Identity Waterfall" section: Overview, config example, how to pass external_id (e.g., in widget fetch headers).

Testing & Verification (Add to docs/rate-limiting.md "Testing Identity")

Manual Tests:
Run pnpm dev.
Curl with JWT: curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIn0.sig" http://localhost:3000/api/test-identity → Expect { "key": "jwt:user123" }.
Browser: Set cookie sessionId=abc (dev tools); hit /api/test-identity → { "key": "session:abc" }.
No auth: Curl plain → { "key": "ip:hashed-..." }.
Invalid JWT: Expect fallback to next (e.g., session or ip).


Playwright E2E (tests/e2e/identity.spec.ts): Browser test: Set headers/cookies; assert response key.
Run: npx playwright test --project=chromium.
Expected: Logs/screenshots show correct fallbacks.


K6 Load (N/A yet, but prep script tests/load/identity.k6.js for 10 RPS; assert 200 OK).
Verification Steps: After manual curls succeed without errors, confirm in browser console (hit proxy if integrated temp). If issues (e.g., existing cookie conflict), ask user.

Milestone Complete: Commit "feat: identity waterfall". Update README with link to docs. Ask if ready for next or clarifications.
Milestone 2: Rate Limiting Middleware (Core Enforcement)
Goal: Add quotas to proxies. Test enforcement/headers.
Implementation Steps

src/lib/rate-limiter.ts: Export async function applyRateLimit(request: NextRequest): Promise<{ allowed: boolean; headers: HeadersInit; remaining: number }> (or throw).
Use identity from M1.
Config Extend: { "limits": { "global": { "minute": 10, "hour": 100, "day": 1000, "month": 30000 } }, "routesInScope": ["/api/proxy/chat", "/api/proxy/uploads"] }.
Redis Client: Singleton with env vars.
Buckets/Windows: Redis hashes rate:${window}:${key}; atomic incr; TTL (60s minute, etc.).
Headers/429 as specified.
Improvise: Wrap existing proxy handler without breaking streaming (use middleware pattern if needed; ask if proxy uses streams).
Log: Append JSONL to logs/rate.jsonl.


Integrate: In app/api/proxy/[...path]/route.ts, add before CustomGPT forward.
Docs: Add "Middleware" section: Config details, header examples.

Testing & Verification (Add to docs "Testing Middleware")

Manual:
Curl loop: 11x curl -X POST http://localhost:3000/api/proxy/chat -d '{}' -H "Content-Type: application/json" (set cookie for fixed key).
Expect: First 10 → 200 + headers (Remaining decreases); 11th → 429 + Retry-After.
Wait 60s → resets.


Playwright: tests/e2e/rate-limit.spec.ts – Automate loop; assert statuses/headers.
K6: tests/load/rate-limit.k6.js – 50 VU/30s; thresholds: duration_p95 <10ms, 429 rate >0.
Verification: Manual loop succeeds; K6 report shows perf. Ask if proxy streaming intact.

Milestone Complete: Commit "feat: rate limiting middleware".
Milestone 3: Configuration & Admin UI
Goal: Dynamic config; monitor UI.
Implementation Steps

src/lib/config.ts: Zod load/watch config/rate-limits.json.
app/admin/page.tsx: Protected (env ADMIN_PASS; check header/query). Form for key → Redis fetch; simulate burn; export CSV/JSON via /api/admin/export.
Improvise: Match Tailwind style; no break existing UI.


Docs: Add "Config & Admin" section: File example, UI access/tests.

Testing & Verification

Manual: Edit config (change minute:5); restart; curl → new limit. UI: Load /admin?pass=...; input key → counters; burn → update; export → file.
Playwright: Navigate UI; interact/assert.
K6: N/A.
Verification: Config change applies; UI works. Ask re protection.

Milestone Complete: Commit "feat: config + admin".
Milestone 4: Human-Check (Cloudflare Turnstile)
Goal: Bot protection for demo/public.
Implementation Steps

src/components/Turnstile.tsx: Render in ChatWidget.tsx if enabled/demo (add token to fetch).
Middleware: Check/verify token for anonymous.
Config: Add turnstileEnabled.
Docs: Add "Turnstile" section: Key setup, tests.

Testing & Verification

Manual: Enable; browser demo chat → see widget; without token → 403; solve → success. Curl with invalid token → 403.
Playwright: Test render/verify flow.
K6: N/A.
Verification: Bot block works without affecting auth. Ask re widget integration.

Milestone Complete: Commit "feat: Turnstile".
Milestone 5: Full Polish & Docs
Goal: Final tests/docs; analytics.
Implementation Steps

Analytics: Aggregate logs in export (histogram).
Full Integration: Ensure all in proxies/widgets.
Docs: Complete docs/rate-limiting.md – all features, examples (external_id flow), full test guides.

Testing & Verification

Manual: End-to-end (JWT → widget → limit → admin).
Playwright: Full journey.
K6: Load with mixed identities.
Verification: All KPIs met. Ask for final review.

Milestone Complete: Commit "feat: complete rate limiting". PR ready. 

NOTE: Complete and confirm each milestone before moving to the next. Good luck