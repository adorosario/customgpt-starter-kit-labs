# 🧪 QA Test Plan: Rate Limiting Feature Validation

## 🎯 **QA Mission: Zero Demo Failures**

As a Senior QA Engineer, my job is to ensure Manuel's rate limiting implementation works flawlessly during Friday's demo. Based on my analysis of the code, here's the comprehensive test strategy.

---

## 📋 **User Stories & Acceptance Criteria**

### **Epic 1: Identity Extraction System**

#### **US-001: JWT User Identification**
**As a** enterprise customer with JWT authentication
**I want** my API requests to be rate-limited based on my JWT sub claim
**So that** my usage is tracked consistently across sessions

**Acceptance Criteria:**
- [ ] Valid JWT with `sub` claim returns `jwt:user123` identity
- [ ] Invalid JWT falls back to next identity method
- [ ] Missing Authorization header falls back gracefully
- [ ] JWT verification works with configured secret
- [ ] Malformed JWT tokens don't crash the system

#### **US-002: Session Cookie Fallback**
**As a** user without JWT authentication
**I want** my rate limits tracked via session cookie
**So that** I have consistent limits during my browser session

**Acceptance Criteria:**
- [ ] `sessionId` cookie returns `session:abc123` identity
- [ ] Missing session cookie falls back to IP
- [ ] Invalid session format handled gracefully
- [ ] Session identity persists across requests

#### **US-003: IP Address Fallback**
**As a** anonymous user
**I want** basic rate limiting via IP address
**So that** I can't abuse the API even without authentication

**Acceptance Criteria:**
- [ ] No auth headers returns `ip:hashedvalue` identity
- [ ] Same IP gets same identity across requests
- [ ] Different IPs get different identities
- [ ] IP hashing protects privacy
- [ ] Proxy headers (X-Forwarded-For) handled correctly

### **Epic 2: Rate Limiting Engine**

#### **US-004: Request Counting & Limits**
**As a** system administrator
**I want** accurate request counting per user
**So that** rate limits are enforced fairly

**Acceptance Criteria:**
- [ ] Request count increments correctly with each API call
- [ ] Multiple time windows (minute/hour/day) tracked separately
- [ ] Atomic Redis operations prevent race conditions
- [ ] Window resets work correctly after time expires

#### **US-005: Rate Limit Enforcement**
**As a** system
**I want** to block requests that exceed limits
**So that** API abuse is prevented

**Acceptance Criteria:**
- [ ] 11th request in minute window returns HTTP 429
- [ ] Rate limited requests don't reach CustomGPT API
- [ ] Rate limit applies only to configured routes
- [ ] Different identities have separate counters

#### **US-006: HTTP Headers & Client Communication**
**As a** API client developer
**I want** clear rate limit information in response headers
**So that** I can implement proper backoff logic

**Acceptance Criteria:**
- [ ] All responses include `X-RateLimit-Limit` header
- [ ] `X-RateLimit-Remaining` decrements correctly
- [ ] `X-RateLimit-Reset` shows accurate reset time
- [ ] `Retry-After` header included in 429 responses
- [ ] Headers match GitHub API standards

### **Epic 3: System Reliability**

#### **US-007: Graceful Degradation**
**As a** system administrator
**I want** the system to work even when Redis is down
**So that** rate limiting failures don't break the entire application

**Acceptance Criteria:**
- [ ] Redis unavailable allows requests through (fail-open)
- [ ] Error headers indicate Redis issues
- [ ] No user-facing errors when Redis down
- [ ] System logs Redis failures appropriately

---

## 🧪 **Manual Test Scenarios**

### **Test Environment Setup**

#### **Prerequisites Checklist:**
- [ ] Local development server running (`pnpm dev`)
- [ ] Upstash Redis credentials in `.env.local`
- [ ] Test JWT tokens available
- [ ] Browser with developer tools
- [ ] Terminal with curl installed
- [ ] Multiple browser sessions/incognito windows

#### **Environment Variables Required:**
```env
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
JWT_SECRET=your-jwt-secret-for-testing
```

---

### **🔬 Critical Test Scenarios**

#### **Test Suite 1: Identity Extraction Validation**

**Test Case 1.1: JWT Identity Extraction**
```bash
# Create test JWT (use jwt.io for quick generation)
TEST_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXVzZXItMTIzIiwiZXhwIjoxNzQwOTk1MjAwfQ.signature"

# Test JWT identity
curl -H "Authorization: Bearer $TEST_JWT" \
     http://localhost:3000/api/test-identity

# Expected: {"key": "jwt:demo-user-123", ...}
```

**Validation Points:**
- [ ] Response shows `jwt:demo-user-123`
- [ ] No errors in server console
- [ ] Response time < 100ms

**Test Case 1.2: Session Cookie Identity**
```bash
# Test session cookie
curl -H "Cookie: sessionId=demo-session-456" \
     http://localhost:3000/api/test-identity

# Expected: {"key": "session:demo-session-456", ...}
```

**Test Case 1.3: IP Fallback Identity**
```bash
# Test IP fallback (no auth)
curl http://localhost:3000/api/test-identity

# Expected: {"key": "ip:somehash", ...}
```

**Test Case 1.4: Identity Waterfall**
```bash
# Test fallback: invalid JWT → valid session
curl -H "Authorization: Bearer invalid-token" \
     -H "Cookie: sessionId=fallback-session" \
     http://localhost:3000/api/test-identity

# Expected: {"key": "session:fallback-session", ...}
```

#### **Test Suite 2: Rate Limiting Functionality**

**Test Case 2.1: Basic Rate Limiting**
```bash
# Rapid fire 12 requests with same identity
for i in {1..12}; do
  echo "Request $i:"
  curl -H "Cookie: sessionId=rate-test-123" \
       -X POST http://localhost:3000/api/proxy/projects \
       -H "Content-Type: application/json" \
       -d '{}' -w "Status: %{http_code}\n" -s
  echo "---"
done
```

**Expected Results:**
- [ ] Requests 1-10: Status 200 (or 401/500 from CustomGPT)
- [ ] Requests 11-12: Status 429
- [ ] Headers show decreasing `X-RateLimit-Remaining`

**Test Case 2.2: Rate Limit Headers Validation**
```bash
# Check headers in successful request
curl -H "Cookie: sessionId=header-test" \
     -X POST http://localhost:3000/api/proxy/projects \
     -H "Content-Type: application/json" \
     -d '{}' -I

# Verify headers present:
# X-RateLimit-Limit: 10
# X-RateLimit-Remaining: 9
# X-RateLimit-Reset: [timestamp]
# X-RateLimit-Window: minute
```

**Test Case 2.3: Multiple Identity Isolation**
```bash
# Test different identities have separate limits
# User 1 - use up their limit
for i in {1..10}; do
  curl -H "Cookie: sessionId=user1" \
       -X POST http://localhost:3000/api/proxy/projects \
       -H "Content-Type: application/json" \
       -d '{}' -s > /dev/null
done

# User 1 should be rate limited
curl -H "Cookie: sessionId=user1" \
     -X POST http://localhost:3000/api/proxy/projects \
     -H "Content-Type: application/json" \
     -d '{}' -w "User1 Status: %{http_code}\n" -s

# User 2 should still work
curl -H "Cookie: sessionId=user2" \
     -X POST http://localhost:3000/api/proxy/projects \
     -H "Content-Type: application/json" \
     -d '{}' -w "User2 Status: %{http_code}\n" -s
```

**Expected Results:**
- [ ] User1: Status 429 (rate limited)
- [ ] User2: Status 200/401/500 (not rate limited)

#### **Test Suite 3: Browser-Based Testing**

**Test Case 3.1: Browser Session Testing**
1. Open browser dev tools
2. Navigate to: `http://localhost:3000/api/test-identity`
3. Set session cookie: `document.cookie = "sessionId=browser-test-789"`
4. Refresh page
5. Verify response shows: `{"key": "session:browser-test-789"}`

**Test Case 3.2: Rate Limiting in Browser**
1. Open browser dev tools (Network tab)
2. Set session cookie: `document.cookie = "sessionId=browser-rate-test"`
3. Create test script in console:
```javascript
// Make 12 rapid requests
for(let i = 1; i <= 12; i++) {
  fetch('/api/proxy/projects', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: '{}'
  }).then(r => {
    console.log(`Request ${i}: ${r.status}`);
    console.log('Headers:', r.headers.get('X-RateLimit-Remaining'));
  });
}
```

**Expected Results:**
- [ ] First 10 requests: Status 200/401/500
- [ ] Last 2 requests: Status 429
- [ ] Headers decrement correctly

#### **Test Suite 4: Error Handling & Edge Cases**

**Test Case 4.1: Redis Failure Simulation**
1. Temporarily stop Redis or use invalid credentials
2. Make API request:
```bash
curl -H "Cookie: sessionId=redis-down-test" \
     -X POST http://localhost:3000/api/proxy/projects \
     -H "Content-Type: application/json" \
     -d '{}'
```

**Expected Results:**
- [ ] Request allowed (fail-open behavior)
- [ ] Header includes: `X-RateLimit-Error: redis-unavailable`
- [ ] No user-facing errors

**Test Case 4.2: Route Scope Testing**
```bash
# Test rate limited route
curl -X POST http://localhost:3000/api/proxy/projects \
     -H "Content-Type: application/json" \
     -d '{}' -I | grep X-RateLimit

# Test excluded route (should have no rate limit headers)
curl http://localhost:3000/api/health -I | grep X-RateLimit
```

**Expected Results:**
- [ ] `/api/proxy/projects`: Has rate limit headers
- [ ] `/api/health`: No rate limit headers (excluded)

---

## 🎭 **Demo Day Test Script**

### **Pre-Demo Validation (30 minutes before)**

#### **Demo Environment Checklist:**
- [ ] Server running without errors
- [ ] Redis connected and responding
- [ ] Test identities configured
- [ ] Browser dev tools ready
- [ ] Backup demo recording available

#### **Demo Flow Test Run:**
1. **Identity Demo** (2 minutes)
   - [ ] Show JWT user identity: `curl -H "Authorization: Bearer $DEMO_JWT" /api/test-identity`
   - [ ] Show session user identity: Set cookie, refresh browser
   - [ ] Show IP fallback: `curl /api/test-identity` in incognito

2. **Rate Limiting Demo** (3 minutes)
   - [ ] Set session cookie: `document.cookie = "sessionId=demo-user"`
   - [ ] Make 10 API requests successfully
   - [ ] Show 11th request returns 429
   - [ ] Show rate limit headers in Network tab

3. **Recovery Demo** (1 minute)
   - [ ] Wait 60 seconds
   - [ ] Show rate limits reset
   - [ ] First request after reset works

### **Demo Contingency Plans**

#### **If Rate Limiting Fails:**
1. **Backup Demo Video**: Pre-recorded working demo
2. **Code Walkthrough**: Show implementation highlights
3. **Redis Dashboard**: Show Redis operations in real-time

#### **If Identity Extraction Fails:**
1. **Manual Identity**: Show different identity methods separately
2. **Config Demo**: Show configuration flexibility
3. **IP Demo Only**: Focus on IP-based rate limiting

---

## 🚨 **Critical Success Criteria**

### **Zero Tolerance Issues (Must Work Perfectly):**
- [ ] Identity extraction returns correct values
- [ ] Rate limiting blocks 11th request with 429
- [ ] Headers appear correctly in all responses
- [ ] No server errors or crashes during demo
- [ ] Performance feels snappy (< 100ms response times)

### **High Priority Issues (Should Work):**
- [ ] Multiple identities have separate limits
- [ ] Rate limits reset after time window
- [ ] Graceful degradation when Redis down
- [ ] All configured routes are rate limited

### **Nice to Have (Can be Explained if Broken):**
- [ ] Perfect header formatting
- [ ] Precise timing of rate limit resets
- [ ] Advanced edge case handling

---

## 📊 **Test Execution Plan**

### **Tuesday (Today) - QA Sprint**
**Time**: 3-4 hours
**Focus**: Validate all core functionality

**Schedule:**
- **Hour 1**: Environment setup and identity testing
- **Hour 2**: Rate limiting functionality testing
- **Hour 3**: Browser testing and edge cases
- **Hour 4**: Demo scenario rehearsal

### **Wednesday - Demo Integration Testing**
**Time**: 2 hours
**Focus**: End-to-end demo validation

**Schedule:**
- **Hour 1**: Full demo script test run
- **Hour 2**: Contingency testing and backup preparation

### **Thursday - Final Validation**
**Time**: 1 hour
**Focus**: Final demo rehearsal

**Schedule:**
- **30 minutes**: Complete demo run-through
- **30 minutes**: Fix any last-minute issues

---

## 🎯 **QA Success Metrics**

### **Functional Metrics:**
- [ ] 100% of critical test cases pass
- [ ] 90%+ of high priority test cases pass
- [ ] Zero crashes or server errors
- [ ] Response times < 100ms for all operations

### **Demo Readiness Metrics:**
- [ ] Demo script executes flawlessly 3 times in a row
- [ ] All demo scenarios work in clean browser session
- [ ] Backup plans tested and working
- [ ] Team confident in demo execution

---

**Bottom Line**: This comprehensive QA plan ensures Manuel's excellent implementation will shine during Friday's demo. The systematic testing approach identifies issues early and validates all critical functionality before the presentation.