Turnstile Integration: Human Verification & Bot Protection
Overview
Implement Cloudflare Turnstile for human verification to prevent bot abuse of the CustomGPT.ai API. Focus on server-side security with configurable deployment options.

Dependencies: Issue #2 (Core Middleware)
Assignee: @Manuel-heav
Priority: P1 (Security Critical)

Security Requirements
🔐 Core Principle: Server-Side Verification Only
NEVER trust client-side Turnstile responses
All token verification MUST happen server-side
Zero Turnstile secrets exposed to browser
Secure token transmission and validation
🛡️ Threat Model
Protects Against:

Automated bot attacks on API endpoints
High-volume scraping attempts
Distributed denial of service (DDoS)
API quota abuse by non-human traffic
Does NOT Protect Against:

Legitimate users exceating rate limits
Insider threats with valid credentials
Application-layer attacks (separate concern)
Implementation Tasks
Task 1: Client-Side Turnstile Component
1.1: React Turnstile Widget
Acceptance Criteria:


Reusable React component for Turnstile widget

Support for multiple deployment modes (embedded, floating, iframe)

Configurable theme (light, dark, auto)

Proper error handling and retry logic

TypeScript definitions and props validation
Component Interface:

interface TurnstileProps {
  siteKey: string
  onSuccess: (token: string) => void
  onError?: (error: string) => void
  onExpire?: () => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact' 
  action?: string // Optional action identifier
}
Implementation Notes:

Load Turnstile script dynamically (avoid blocking)
Handle script load failures gracefully
Component cleanup on unmount
Support for multiple instances per page
Testing Requirements:


Unit test: Component rendering

Unit test: Props validation

Unit test: Error handling

E2E test: Token generation flow
1.2: Widget Integration Points
Acceptance Criteria:


Integrate with chat interface before API calls

Show Turnstile for anonymous/IP-based users

Skip Turnstile for authenticated JWT users (configurable)

Handle challenge flow without blocking UI

Store valid tokens temporarily for reuse
Integration Locations:

src/components/chat/ChatInput.tsx - Before message submission
src/components/ui/TurnstileChallenge.tsx - Reusable challenge component
src/widget/ components - Widget-specific integration
Testing Requirements:


Integration test: Chat flow with Turnstile

Integration test: Widget integration

Integration test: Token reuse logic

E2E test: Complete user journey
Task 2: Server-Side Token Verification
2.1: Turnstile Verification Endpoint
Acceptance Criteria:


Secure API endpoint for token verification

Rate limiting on verification endpoint itself

Comprehensive error handling and logging

Support for Cloudflare siteverify API

Token replay attack prevention
API Endpoint: POST /api/turnstile/verify

Request/Response:

// Request
interface VerifyRequest {
  token: string
  action?: string // Optional action verification
}

// Response - Success
interface VerifySuccessResponse {
  success: true
  challengeTs: string
  hostname: string
  action?: string
}

// Response - Error  
interface VerifyErrorResponse {
  success: false
  errorCodes: string[]
  message: string
}
Security Considerations:

Validate token format before API call
Use HTTPS for all Cloudflare API communication
Implement request timeout (5s max)
Log all verification attempts for monitoring
Testing Requirements:


Unit test: Valid token verification

Unit test: Invalid token rejection

Unit test: Network error handling

Unit test: Token replay prevention

Integration test: Cloudflare API integration
2.2: Middleware Integration
Acceptance Criteria:


Integrate Turnstile check with rate limiting middleware

Apply Turnstile requirement based on configuration

Cache valid verifications to avoid repeated checks

Fail gracefully if Turnstile service unavailable

Bypass Turnstile for authenticated users (if configured)
Configuration Logic:

# Turnstile Configuration
TURNSTILE_ENABLED=true
TURNSTILE_SITE_KEY=your-site-key
TURNSTILE_SECRET_KEY=your-secret-key
TURNSTILE_BYPASS_AUTHENTICATED=true
TURNSTILE_REQUIRED_FOR_IP_USERS=true
TURNSTILE_CACHE_DURATION=300  # 5 minutes
Integration Flow:

Rate limiting middleware checks identity
If identity is IP-based AND Turnstile enabled → require verification
Check cache for recent valid verification
If no cache → require new Turnstile challenge
Block request until valid Turnstile token provided
Testing Requirements:


Integration test: Middleware enforcement

Integration test: Caching behavior

Integration test: Bypass logic for JWT users

Integration test: Graceful degradation
Task 3: Configuration & Deployment
3.1: Environment Configuration
Acceptance Criteria:


Secure management of Turnstile keys

Runtime enable/disable without code changes

Per-environment configuration (dev/staging/prod)

Validation of required environment variables

Clear error messages for misconfiguration
Environment Variables:

# Required when TURNSTILE_ENABLED=true
TURNSTILE_ENABLED=true|false
TURNSTILE_SITE_KEY=1x00000000000000000000AA  # Public key (client-side)
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA  # Private key (server-side)

# Optional Configuration
TURNSTILE_ACTION=login  # Action identifier for verification
TURNSTILE_THEME=auto   # light|dark|auto
TURNSTILE_SIZE=normal  # normal|compact
TURNSTILE_BYPASS_AUTHENTICATED=true
TURNSTILE_CACHE_DURATION=300
TURNSTILE_TIMEOUT=5000  # Verification API timeout (ms)
Testing Requirements:


Unit test: Configuration validation

Unit test: Error handling for missing keys

Integration test: Runtime enable/disable

Integration test: Per-environment configs
3.2: Development & Demo Mode Support
Acceptance Criteria:


Test mode with dummy tokens for development

Demo mode integration for live playground

Local development without Cloudflare dependency

Clear distinction between test/production modes

Documentation for developer setup
Development Configuration:

# Development/Test Mode
TURNSTILE_ENABLED=true
TURNSTILE_TEST_MODE=true  # Skip actual API calls
TURNSTILE_SITE_KEY=1x00000000000000000000AA  # Test site key
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA  # Test secret
Testing Requirements:


Unit test: Test mode behavior

Integration test: Demo mode flow

E2E test: Development setup

Documentation test: Setup instructions
Task 4: User Experience & Error Handling
4.1: Challenge Flow UX
Acceptance Criteria:


Smooth challenge presentation without jarring transitions

Clear user messaging about verification requirement

Progress indicators during verification

Graceful handling of challenge failures

Retry mechanisms for temporary failures
UX Requirements:

Show Turnstile challenge before API call blocking
Provide clear messaging: "Verifying you're human..."
Handle slow networks with loading states
Allow retry for failed challenges
Don't lose user input during verification
Testing Requirements:


E2E test: Complete challenge flow

E2E test: Challenge failure scenarios

E2E test: Retry mechanisms

Usability test: User flow smoothness
4.2: Error Handling & Monitoring
Acceptance Criteria:


Comprehensive error logging for debugging

User-friendly error messages

Monitoring for Turnstile service health

Alerting for high failure rates

Graceful degradation when service unavailable
Error Categories:

Network Errors: Timeout, connection failures
Invalid Tokens: Malformed, expired, wrong site
Service Errors: Cloudflare API issues
Configuration Errors: Missing keys, wrong environment
Monitoring Metrics:

Turnstile verification success rate
Average verification time
Error rate by category
Cache hit/miss ratio
Testing Requirements:


Unit test: Error categorization

Integration test: Error logging

E2E test: Error message display

Monitor test: Alerting thresholds
Security Validation
Security Checklist:

✅ Secret keys never exposed to client-side

✅ All token verification server-side only

✅ HTTPS enforced for all Cloudflare API calls

✅ Token replay attack prevention

✅ Request timeout prevents hanging

✅ Rate limiting on verification endpoint

✅ Secure token transmission

✅ Graceful failure handling
Penetration Testing Scenarios:

Attempt to bypass Turnstile with fake tokens

Try token replay attacks

Test with malformed token payloads

Verify timeout handling prevents DoS

Confirm no secrets in client-side code
Performance Requirements
Latency Targets:

Turnstile verification: <2s P95
Token validation: <500ms P95
Cache lookup: <10ms P95
Challenge display: <1s P95
Reliability Targets:

Verification success rate: >99.5%
Service availability: >99.9%
Cache hit rate: >80% for repeat users
Error recovery: <5s for transient failures
Implementation Phases
Phase 1 (Days 1-2): Client Integration
React Turnstile component
Chat interface integration
Basic error handling
Phase 2 (Days 3-4): Server Verification
Verification endpoint
Cloudflare API integration
Security validation
Phase 3 (Days 5-6): Middleware Integration
Rate limiting integration
Caching implementation
Configuration system
Phase 4 (Days 7-8): UX & Testing
User experience polish
Comprehensive testing
Performance optimization
Definition of Done
Security:

All security checklist items verified

Penetration testing scenarios passed

No secrets exposed client-side

Server-side verification working
Functionality:

Turnstile challenges display correctly

Token verification working end-to-end

Rate limiting integration functional

Configuration system operational
Performance:

Latency targets met

Reliability targets achieved

Caching working effectively

Error handling responsive
User Experience:

Smooth challenge flow

Clear error messaging

Progress indicators working

Retry mechanisms functional
