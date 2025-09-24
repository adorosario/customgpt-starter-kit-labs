# Admin Verification Checklist

Use this to validate identities, limits, Turnstile, config, users, health, and analytics.

## 0) Prereqs
- Env: `ADMIN_*`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Login at `/admin/login` (stores `admin_token` in localStorage)
- Optional: Configure limits at `/admin/rate-limits/config` and Save

## 1) Identity Detection
- GET `/api/test-identity` (browser or curl) → note `key`
- Session identity
  - In browser console: `document.cookie = 'sessionId=sess_test_1; path=/'`
  - Reload, call `/api/test-identity` → expect `session:sess_test_1`
- JWT identity
  - Create HS256 JWT with payload `{"sub":"user_123"}` signed using `jwtSecret` from config
  - curl example:
```
curl -H "Authorization: Bearer <JWT>" http://localhost:3000/api/test-identity
```
  - Expect `jwt:user_123`

## 2) Rate Limits
- Confirm limits reflected in UI on `/admin/rate-limits/users`
- Exceed per-minute for a test identity
  - Fire N requests to a proxied endpoint (e.g. `/api/proxy/projects`) until 429
  - Verify 429 headers: `X-RateLimit-Limit/Remaining/Reset`
  - UI marks identity as Blocked
- Reset
  - `/admin/rate-limits/users` → Reset on the identity → counts drop

## 3) Turnstile
- Enable in `/admin/rate-limits/config` (Turnstile enabled, bypass authenticated = true)
- With IP identity (no session/cookie & no JWT), hit a protected endpoint → 403 + TURNSTILE_VERIFICATION_REQUIRED
- Complete Turnstile in UI where prompted; repeat call → allowed within cache TTL
- With session or JWT identity, calls should bypass Turnstile

## 4) Configuration
- Change global minute/hour/day → Save → within ~3s, Users/Dashboard show new limits
- Toggle Turnstile enabled → reflected in behavior (as above)

## 5) Users & Analytics
- `/admin/rate-limits/users` loads with filters/paging; shows per-window counters
- `/admin/rate-limits/analytics` loads; overview/totals populated

## 6) Health
- `/admin/rate-limits` health cards show:
  - Redis Connected (if env correct)
  - Turnstile enabled/configured (matches env)

## 7) Troubleshooting
- Redis shows Down → verify Upstash env vars, token auth, and that you’re logged in (Authorization sent)
- Turnstile shown unexpectedly → verify identity via `/api/test-identity`, check cookie name `sessionId`, confirm Turnstile bypass setting


