# 🚀 CustomGPT.ai Starter Kit - Deployment Guide

Simple deployment guide for the CustomGPT.ai Starter Kit with rate limiting and admin panel.

## 📋 What You Need

### Required Accounts & Credentials

1. **CustomGPT.ai API Key**
   - Get from: https://app.customgpt.ai → Settings → API Keys
   - Format: `cgpt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

2. **Upstash Redis** (Free tier available)
   - Get from: https://console.upstash.com → Create Database
   - Need: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

3. **Admin Panel Setup**
   - Generate password hash using: `node scripts/hash-admin-password.js`
   - Generate JWT secret: `openssl rand -base64 32`

4. **Optional: Cloudflare Turnstile** (Bot protection)
   - Get from: https://dash.cloudflare.com → Turnstile
   - Need: `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`

5. **Optional: OpenAI API Key** (Voice features)
   - Get from: https://platform.openai.com → API Keys
   - Format: `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## 🔧 Environment Setup

Create `.env.local` file:

```env
# ============================================
# REQUIRED - Core API Keys
# ============================================
CUSTOMGPT_API_KEY=cgpt_your_api_key_here
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token_here

# ============================================
# REQUIRED - Admin Panel
# ============================================
ADMIN_ENABLED=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$10$your_bcrypt_hash_here
ADMIN_JWT_SECRET=your_super_secure_jwt_secret_here
ADMIN_SESSION_TIMEOUT=1440
ADMIN_ALLOWED_IPS=127.0.0.1,::1

# ============================================
# OPTIONAL - Security & Bot Protection
# ============================================
TURNSTILE_SITE_KEY=0x4AAAAAAABkMYinukE8nzYr4g6n2U1mK
TURNSTILE_SECRET_KEY=0x4AAAAAAABkMYinukE8nzYr4g6n2U1mK

# ============================================
# OPTIONAL - Voice Features
# ============================================
OPENAI_API_KEY=sk-your_openai_key_here
```

## 🚀 Deployment Options

### Option 1: Vercel (Recommended)

**Steps:**
1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel`
3. Add environment variables in Vercel dashboard
4. Deploy: `vercel --prod`

**✅ Benefits:** Automatic HTTPS, global CDN, zero config

### Option 2: Docker

**Steps:**
1. Build: `docker build -t customgpt-starter-kit .`
2. Run: `docker run -p 3000:3000 --env-file .env.local customgpt-starter-kit`

**✅ Benefits:** Consistent environment, easy scaling

### Rate Limiting Setup

Edit `config/rate-limits.json`:

```json
{
  "identityOrder": ["jwt-sub", "session-cookie", "ip"],
  "jwtSecret": "your-jwt-secret-here",
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
    "/api/proxy/user",
    "/api/admin/test"
  ],
  "turnstileEnabled": true,
  "turnstile": {
    "enabled": true,
    "bypassAuthenticated": true,
    "requiredForIPUsers": true,
    "cacheDurationMinutes": 5,
    "testMode": false
  }
}
```

## 🧪 Testing

### Quick Tests

```bash
# Test basic functionality
curl https://yourdomain.com/api/admin/health

# Test rate limiting
for i in {1..15}; do
  curl -X POST https://yourdomain.com/api/admin/test
  echo "Request $i"
done

# Test admin panel
curl -u admin:password https://yourdomain.com/admin
```

### Generate Admin Password

```bash
# Generate secure password hash
node scripts/hash-admin-password.js

# Follow prompts and copy hash to ADMIN_PASSWORD_HASH
```

## 🔍 Troubleshooting

### Common Issues

**Redis Connection Failed:**
```bash
curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
     "$UPSTASH_REDIS_REST_URL/ping"
# Expected: {"result":"PONG"}
```

**Admin Panel Not Loading:**
- Check `ADMIN_ENABLED=true`
- Verify password hash: `node scripts/hash-admin-password.js`
- Check JWT secret is set

**Rate Limiting Not Working:**
- Check Redis connection
- Verify `config/rate-limits.json` exists
- Test endpoint: `curl -X POST https://yourdomain.com/api/admin/test`

## ✅ Deployment Checklist

- [ ] CustomGPT.ai API key configured
- [ ] Upstash Redis database created and credentials added
- [ ] Admin password generated and hash added
- [ ] JWT secret generated and added
- [ ] Environment variables configured
- [ ] Rate limiting configured
- [ ] Application deployed and accessible
- [ ] Admin panel accessible at `/admin`
- [ ] Rate limiting tested and working

## 🎯 Quick Start

1. **Get credentials** from the accounts listed above
2. **Create `.env.local`** with your credentials
3. **Generate admin password**: `node scripts/hash-admin-password.js`
4. **Deploy** using your preferred method
5. **Test** the admin panel at `/admin`
6. **Verify** rate limiting is working

**🚀 You're ready to go!**
