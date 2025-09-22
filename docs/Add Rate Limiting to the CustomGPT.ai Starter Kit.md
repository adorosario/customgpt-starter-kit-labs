# Add Rate Limiting to the [CustomGPT.ai](http://CustomGPT.ai) Starter Kit

We need an expert full-stack developer to add a feature to an open-source starter kit. The goal is to add rate limiting functionality to the **CustomGPT.ai Starter Kit** (Next.js 14 \+ TypeScript, Tailwind, secure proxy routes) to support **enterprise-grade end-user rate limiting.**

The Starter Kit already uses server-side proxy handlers where we can enforce business rules (no API keys in the browser). Your PR will implement configurable quotas and identity, plus a small admin screen and docs.

Starter Kit: [https://github.com/Poll-The-People/customgpt-starter-kit](https://github.com/Poll-The-People/customgpt-starter-kit)

## Scope

**A) Identity waterfall (server-side)**

1. Primary: **external user ID** (JWT/OIDC sub, or first-party ID we receive from the enterprise app).  
2. Fallbacks: **session ID** (cookie) → **IP** (coarse).  
3. Pluggable extractor: read from header, cookie, or request body; map into a single `identityKey`.

**B) Rate limiting middleware (at Starter Kit proxy endpoints)**

* Implement sliding-window or token-bucket counters in **Redis/Upstash** (edge-friendly).   
* Configurable windows: per-minute (abuse), per-hour (burst), per-day/per-month (business).  
* **Headers on success**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.  
* **On exceed**: **HTTP 429** with the same headers and optional `Retry-After`; clients should back off per headers (pattern used by major APIs).

**C) Human-check (bot friction)**

* Add a drop-in **Cloudflare Turnstile** component to public/demo modes; validate tokens **server-side** via `siteverify`. 

**D) Configuration & UI**

* `.env` / JSON config for limits: identity source order, windows & caps, mitigation timeout, routes in scope (chat, uploads, etc.).  
* Lightweight **Admin screen** (protected route in the Starter Kit) to view current counters for a given `identityKey` and simulate limits.

**E) Developer experience & docs**

* **K6/Playwright** scripts to simulate identities and prove limits.  
* Update README: where middleware lives, how to pass `external_id` from app → widget/iframe → proxy, how to read headers, how to customize.  
* Ship a minimal **analytics log** per request (JSON) so customers can graph usage.

---

## Deliverables

1. PR to `customgpt-starter-kit` with: middleware, config, admin page, tests, docs.   
2. Headers \+ 429 behavior implemented exactly as specified above (mirrors GitHub-style headers).  
3. Example integration showing `external_id` flowing from the enterprise app into the proxy (plus fallbacks).  
4. Turnstile integration with server-side verification.

---

## KPIs & Acceptance

* **Correctness:**  
    
  * Quotas enforce reliably for the three identities; windows reset per config.  
  * 429 responses include `X-RateLimit-*` \+ `Retry-After` (when applicable). 


* **Performance:**  
    
  * Median overhead ≤ \~10ms per request at P95 under 50 RPS on Vercel/Node (w/ Redis).


* **DX:**  
    
  * One-file config; README section with copy-paste snippets; admin page shows live counters.


* **Security:**  
    
  * No API keys in the browser; Turnstile verified **server-side** when enabled.  
      
* **Auditability:**  
    
  * Histogram/timeseries export (Prometheus format or simple CSV).


* **TDD:**  
    
  * Playwright e2e demonstrating identity waterfall and backoff on 429\.

## Test of Success

* The working PR is approved by the repo maintainer.   
* There will be a $100 bonus \+ positive feedback *when the PR is accepted*  – please do NOT bid if you are not confident of such projects. Also, we have a TON more projects that we are working on, resulting in the possibility of full-time or future projects. 

## Resources

* Contact person for fast code reviews.  
* We will provide you a [CustomGPT.ai](http://CustomGPT.ai) agent and API key for testing. 

