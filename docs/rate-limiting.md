# Rate Limiting Documentation

## Overview

The CustomGPT.ai Starter Kit includes enterprise-grade rate limiting to prevent API abuse and ensure fair usage across all users. The system uses a configurable identity waterfall to identify users and enforces per-user quotas on API proxy routes.

## Features

- **Identity Waterfall**: Flexible user identification using JWT, session cookies, or IP addresses
- **Configurable Limits**: Per-minute, hour, day, and month quotas
- **Redis-based Counters**: Fast, distributed rate limiting using Upstash Redis
- **GitHub-style Headers**: Standard rate limit headers in responses
- **Admin Interface**: Monitor and manage rate limits
- **Bot Protection**: Optional Cloudflare Turnstile integration
- **Analytics**: JSON logs and exportable metrics

## Architecture

The rate limiting system consists of several components:

1. **Identity Extraction** (`src/lib/identity.ts`) - Identifies users using configurable methods
2. **Rate Limiter** (`src/lib/rate-limiter.ts`) - Enforces quotas using Redis counters
3. **Middleware Integration** - Applies rate limiting to proxy routes
4. **Admin Interface** - Monitor and manage rate limits
5. **Configuration** (`config/rate-limits.json`) - Centralized settings

## Identity Waterfall

The system identifies users using a configurable waterfall approach, trying each method in order until one succeeds:

### Configuration

Edit `config/rate-limits.json` to configure the identity extraction order:

```json
{
  "identityOrder": ["jwt-sub", "session-cookie", "ip"],
  "jwtSecret": "your-jwt-secret-key-here"
}
```

### Identity Methods

#### 1. JWT Subject (`jwt-sub`)

Extracts the `sub` claim from JWT tokens in the `Authorization: Bearer <token>` header.

**Example**:
```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIn0.sig" \
  http://localhost:3000/api/test-identity
# Returns: { "key": "jwt:user123" }
```

#### 2. Session Cookie (`session-cookie`)

Uses the `sessionId` cookie value.

**Example**:
```bash
curl -H "Cookie: sessionId=abc123" \
  http://localhost:3000/api/test-identity  
# Returns: { "key": "session:abc123" }
```

#### 3. IP Address (`ip`)

Hashes the client IP address for privacy.

**Example**:
```bash
curl http://localhost:3000/api/test-identity
# Returns: { "key": "ip:a1b2c3d4e5f6g7h8" }
```

### External ID Integration

For widget implementations, you can pass external user IDs through headers:

```javascript
// In your widget configuration
fetch('/api/proxy/projects/123/conversations', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ message: 'Hello' })
});
```

## Configuration

### Rate Limits Configuration

The `config/rate-limits.json` file controls all rate limiting behavior:

```json
{
  "identityOrder": ["jwt-sub", "session-cookie", "ip"],
  "jwtSecret": "your-jwt-secret-key-here",
  "limits": {
    "global": {
      "minute": 10,
      "hour": 100, 
      "day": 1000,
      "month": 30000
    }
  },
  "routesInScope": [
    "/api/proxy/projects",
    "/api/proxy/user"
  ],
  "turnstileEnabled": false
}
```

### Environment Variables

Add these to your `.env.local`:

```env
# Required for Redis rate limiting
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Optional for JWT verification
JWT_SECRET=your-jwt-secret

# Optional for Turnstile bot protection
TURNSTILE_SITE_KEY=your-site-key
TURNSTILE_SECRET_KEY=your-secret-key
```

## Testing Identity

### Manual Testing

1. **Start the development server**:
   ```bash
   pnpm dev
   ```

2. **Test JWT Authentication**:
   ```bash
   curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIn0.sig" \
     http://localhost:3000/api/test-identity
   ```
   Expected response: `{ "key": "jwt:user123" }`

3. **Test Session Cookie**:
   ```bash
   curl -H "Cookie: sessionId=abc123" \
     http://localhost:3000/api/test-identity
   ```
   Expected response: `{ "key": "session:abc123" }`

4. **Test IP Fallback**:
   ```bash
   curl http://localhost:3000/api/test-identity
   ```
   Expected response: `{ "key": "ip:hashed-value" }`

5. **Test Invalid JWT Fallback**:
   ```bash
   curl -H "Authorization: Bearer invalid-token" \
     -H "Cookie: sessionId=fallback123" \
     http://localhost:3000/api/test-identity
   ```
   Expected response: `{ "key": "session:fallback123" }`

### Browser Testing

1. Open browser developer tools
2. Set a session cookie: `document.cookie = "sessionId=browser123"`
3. Navigate to: `http://localhost:3000/api/test-identity`
4. Check the response shows: `{ "key": "session:browser123" }`

## Rate Limiting Middleware

The core enforcement system integrates seamlessly with your existing proxy routes, adding rate limiting **before** any API calls are made to CustomGPT.ai.

### How It Works

1. **Request Intercepted**: Every request to `/api/proxy/*` routes is checked
2. **Identity Extracted**: User identified using the waterfall system
3. **Limits Checked**: Redis counters verified for all time windows
4. **Headers Added**: Rate limit information included in all responses
5. **429 on Exceed**: Proper HTTP status codes with retry information

### Integration Points

The rate limiter is integrated at the **proxy handler level** (`src/lib/api/proxy-handler.ts`):

```typescript
// Applied BEFORE any other checks
const rateLimitResult = await applyRateLimit(request);

if (!rateLimitResult.allowed) {
  return NextResponse.json(
    { 
      error: 'Rate limit exceeded',
      message: `Too many requests. Try again in ${retryAfter} seconds.`,
      code: 'RATE_LIMIT_EXCEEDED'
    },
    { status: 429, headers: rateLimitHeaders }
  );
}
```

### Response Headers

All responses include GitHub-style rate limit headers:

```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1640995200
X-RateLimit-Window: minute
X-RateLimit-Identity: jwt
```

When rate limited (429 response):
```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640995200
Retry-After: 45
```

### Redis Architecture

The system uses **atomic operations** with Redis pipelines:

```typescript
// Atomic increment and TTL setting
const pipeline = redis.pipeline();
pipeline.incr(`rate:minute:${windowStart}:${identityKey}`);
pipeline.expire(`rate:minute:${windowStart}:${identityKey}`, 60);
const results = await pipeline.exec();
```

### Graceful Degradation

If Redis is unavailable:
- ✅ Requests are **allowed** (fail open)
- ✅ Error headers indicate the issue
- ✅ System logs the Redis failure
- ✅ No user-facing errors

### Environment Setup

Add these to your `.env.local`:

```env
# Required - Your Upstash Redis credentials
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
```

## Implementation Status

### ✅ Milestone 1: Identity Waterfall (COMPLETED)

- [x] Identity extraction library (`src/lib/identity.ts`)
- [x] Configuration system (`config/rate-limits.json`)
- [x] Test endpoint (`/api/test-identity`)
- [x] Documentation (this file)
- [x] Manual testing instructions

### ✅ Milestone 2: Rate Limiting Middleware (COMPLETED)

- [x] Redis rate limiter (`src/lib/rate-limiter.ts`)
- [x] Upstash Redis integration
- [x] Proxy handler integration
- [x] GitHub-style headers
- [x] 429 status codes with Retry-After
- [x] Graceful degradation
- [x] JSON logging system

### 🚧 Upcoming Milestones

- [ ] **Milestone 3**: Configuration & Admin UI
- [ ] **Milestone 4**: Human-Check (Cloudflare Turnstile)
- [ ] **Milestone 5**: Full Polish & Analytics

## Testing Middleware

### Manual Testing

1. **Start the development server with Redis credentials**:
   ```bash
   # Add to .env.local first:
   # UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
   # UPSTASH_REDIS_REST_TOKEN=your-redis-token
   
   pnpm dev
   ```

2. **Test Rate Limiting with Session Cookie**:
   ```bash
   # Set a session cookie for consistent identity
   for i in {1..12}; do
     echo "Request $i:"
     curl -H "Cookie: sessionId=test123" \
          -X POST http://localhost:3000/api/proxy/projects \
          -H "Content-Type: application/json" \
          -d '{}' -v
     echo "---"
   done
   ```

   **Expected Results**:
   - Requests 1-10: `200 OK` with decreasing `X-RateLimit-Remaining`
   - Requests 11-12: `429 Too Many Requests` with `Retry-After` header

3. **Test Different Identities**:
   ```bash
   # JWT identity (if you have a test token)
   curl -H "Authorization: Bearer your-test-jwt" \
        -X POST http://localhost:3000/api/proxy/projects \
        -H "Content-Type: application/json" \
        -d '{}'
   
   # Different session
   curl -H "Cookie: sessionId=different456" \
        -X POST http://localhost:3000/api/proxy/projects \
        -H "Content-Type: application/json" \
        -d '{}'
   
   # IP-based (no auth)
   curl -X POST http://localhost:3000/api/proxy/projects \
        -H "Content-Type: application/json" \
        -d '{}'
   ```

4. **Verify Headers in Response**:
   ```bash
   curl -H "Cookie: sessionId=test123" \
        -X POST http://localhost:3000/api/proxy/projects \
        -H "Content-Type: application/json" \
        -d '{}' -I
   ```

   **Expected Headers**:
   ```
   X-RateLimit-Limit: 10
   X-RateLimit-Remaining: 9
   X-RateLimit-Reset: 1640995260
   X-RateLimit-Window: minute
   X-RateLimit-Identity: session
   ```

5. **Test Graceful Degradation** (Stop Redis temporarily):
   ```bash
   # Requests should still work but with error headers
   curl -H "Cookie: sessionId=test123" \
        -X POST http://localhost:3000/api/proxy/projects \
        -H "Content-Type: application/json" \
        -d '{}'
   
   # Look for: X-RateLimit-Error: redis-unavailable
   ```

### Browser Testing

1. Open browser dev tools
2. Set session cookie: `document.cookie = "sessionId=browser123"`
3. Make requests to any proxy endpoint
4. Check Network tab for rate limit headers
5. After 10 requests, you should see `429` responses

### Verification Checklist

- ✅ **Rate limits enforced**: 11th request returns 429
- ✅ **Headers present**: All responses have `X-RateLimit-*` headers
- ✅ **Identity works**: Different identities have separate limits
- ✅ **Reset works**: Wait 60 seconds, limits reset
- ✅ **Graceful degradation**: Works when Redis is down
- ✅ **Logging works**: Check console for JSON log entries

## Troubleshooting

### Common Issues

1. **"UPSTASH_REDIS_REST_URL must be set"**: Add Redis credentials to `.env.local`
2. **All requests return 429**: Check if Redis keys are stuck (restart Redis or wait for TTL)
3. **Rate limits not working**: Verify routes are in `routesInScope` in config
4. **Headers missing**: Check proxy integration is working correctly

### Debug Mode

The identity system logs detailed information in development mode. Check your console for:

```
[Identity] Configuration loaded successfully
[Identity] JWT verification failed: [reason]
[Identity] Session extraction failed: [reason]
[Identity] IP hashing failed: [reason]
```

## Next Steps

After confirming Milestone 1 works correctly:

1. Test all identity methods manually
2. Verify configuration loading and caching
3. Check error handling and fallbacks
4. Proceed to Milestone 2: Rate Limiting Middleware

---

*This documentation will be updated as each milestone is completed.*
