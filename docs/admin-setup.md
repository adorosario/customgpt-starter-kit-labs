# Admin Setup Guide

This guide explains how to enable, configure, and use the Admin Console for rate limiting, Turnstile, analytics, and logs.

## 1) Prerequisites

- Node.js 18+, pnpm
- Upstash Redis (serverless) credentials
- Optional: Cloudflare Turnstile keys (site + secret)

## 2) Environment Variables

Add these to `.env.local` (or `.env`) in your project root:

```env
# Admin console
ADMIN_ENABLED=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt-hash>   # see step 3 to generate
ADMIN_SESSION_TIMEOUT=3600
ADMIN_JWT_SECRET=admin-jwt-secret-for-development
ADMIN_ALLOWED_IPS=127.0.0.1,::1

# Redis (required for rate limiting and admin)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Turnstile (optional)
TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
TURNSTILE_ENABLED=true
TURNSTILE_BYPASS_AUTHENTICATED=true
```

Restart dev server after changes:

```bash
pnpm dev
```

## 3) Generate Admin Password Hash

Use the provided script to create a bcrypt hash:

```bash
pnpm node scripts/hash-admin-password.js "your-password"
```

Copy the printed hash into `ADMIN_PASSWORD_HASH`.

## 4) Login to the Admin Console

- Open `http://localhost:3000/admin`
- Login with `ADMIN_USERNAME` and your password
- On 401 responses, admin pages auto-redirect to `/admin/login`
- The login page renders without sidebar/header for focus

## 5) Admin Features (Implemented)

- Authentication: bcrypt + JWT, http redirects on 401
- Dashboard: live counters (analytics), health (Redis + Turnstile env)
- Users: search/filter/pagination, per-window usage, reset counters
- Configuration: edit global limits, route-specific limits, routesInScope, Turnstile (enable + cache TTL); changes stored in Redis and applied at runtime without restart
- Analytics: overview (requests/min, blocked, users) with charts
- Audit Logs: durable logs (Redis lists per day) with UI and pagination

## 6) Configuration Details

Configuration uses a merged model:
- File defaults: `config/rate-limits.json`
- Runtime overrides: Redis key `admin:rate-limit-config`, managed by the Admin UI

At runtime, the app merges both (defaults + overrides) for:
- `limits.global.minute/hour/day/month`
- `routesInScope` (list of path prefixes/patterns considered for rate limiting)
- `turnstile.enabled` and `turnstile.cacheDurationSeconds`

Note: Turnstile bypass flags currently use env (`TURNSTILE_BYPASS_AUTHENTICATED`, `TURNSTILE_REQUIRED_FOR_IP_USERS`).

## 7) Admin Endpoints (Server-side)

- `POST /api/admin/auth/login` — login and JWT issuance
- `GET  /api/admin/users` — list users (scans Redis rate keys)
- `GET  /api/admin/users/[id]` — specific user usage
- `POST /api/admin/users/[id]/reset` — reset counters (minute/hour/day)
- `GET  /api/admin/analytics` — aggregate stats (active users, blocked, rpm)
- `GET  /api/admin/config` — return defaults + overrides
- `POST /api/admin/config` — save overrides to Redis (canonical shape)
- `GET  /api/admin/health` — Redis/Turnstile health status
- `GET  /api/admin/logs` — durable admin actions (Redis per-day list)

All admin routes require `Authorization: Bearer <admin_token>`; the Admin UI attaches this automatically after login.

## 8) Using the Admin Console

### Dashboard
- View counters and health
- Auto-refresh enabled by default

### Users
- Search by identity key, filter by type/status, sort and paginate
- Click Reset to clear minute-window counters for a user

### Configuration
- Edit Global Limits (per minute/hour/day)
- Manage Route-Specific Limits (add/remove route patterns with limits)
- Edit `routesInScope` (paths under rate limiting)
- Turnstile: Enable and set cache duration (seconds)
- Save to apply changes (stored in Redis; picked up at runtime)

### Analytics
- Overview metrics with charts and summary cards

### Logs
- Audit logs (admin actions) with pagination

## 9) Identities & Testing

- IP: default when no session/JWT
- Session: set cookie `sessionId=your_value` (same host)
- JWT: set `Authorization: Bearer <token>` with `sub` claim
- Check current identity at `GET /api/test-identity`

## 10) Troubleshooting

- 401 on admin pages
  - Token expired or missing → auto-redirect to `/admin/login`
  - Login again; ensure localStorage stores `admin_token`

- Redis health shows Down
  - Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
  - Ensure requests include Authorization header (must be logged in)

- Turnstile prompts despite session/JWT
  - Confirm cookie name is `sessionId`
  - Ensure `TURNSTILE_BYPASS_AUTHENTICATED=true`
  - Verify `turnstile.enabled` is what you expect in Admin UI

## 11) Current Limitations / Next Steps

- Route-specific enforcement: currently limits are global; pattern-based limits can be applied in the rate limiter (planned)
- Turnstile bypass flags: migrate from env -> Redis-backed toggles to fully control from Admin UI
- Analytics storage: replace `KEYS`-like scans with SCAN/indexed design for large scale
- SSE/WebSockets: improve real-time updates (reduce polling)
- Admin auth: move to httpOnly cookies + CSRF for production hardening

## 12) References

- Runtime config merge: `src/lib/identity.ts`
- Rate limiting: `src/lib/rate-limiter.ts`
- Admin APIs: `src/app/api/admin/*`
- Turnstile: `src/lib/turnstile-verification.ts`, `src/app/api/turnstile/verify/route.ts`
- Audit logs: `src/lib/admin/auth.ts` (logAdminAction), `src/app/api/admin/logs/route.ts`
