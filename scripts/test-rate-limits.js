#!/usr/bin/env node

/**
 * Simple rate limiting test script
 * Tests rate limiting with different identities and shows real-time feedback
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function makeRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      ...options
    });
    
    const headers = {};
    response.headers.forEach((value, key) => {
      if (key.toLowerCase().startsWith('x-ratelimit') || key === 'retry-after') {
        headers[key] = value;
      }
    });
    
    let body = '';
    try {
      body = await response.text();
    } catch (e) {
      body = 'Unable to read response body';
    }
    
    return {
      status: response.status,
      headers,
      body: body.length > 200 ? body.substring(0, 200) + '...' : body
    };
  } catch (error) {
    return {
      status: 0,
      headers: {},
      body: `Error: ${error.message}`
    };
  }
}

async function testIdentity(name, headers = {}) {
  console.log(`\n🔍 Testing ${name} identity:`);
  
  const identityRes = await makeRequest('/api/test-identity', { headers });
  console.log(`Identity: ${identityRes.body}`);
  
  console.log(`\n📊 Sending requests until rate limited...`);
  
  for (let i = 1; i <= 15; i++) {
    const res = await makeRequest('/api/admin/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });
    
    const rateLimitHeaders = Object.entries(res.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    
    console.log(`Request ${i.toString().padStart(2)}: ${res.status} ${rateLimitHeaders ? `[${rateLimitHeaders}]` : ''}`);
    
    if (res.status === 429) {
      console.log(`❌ Rate limited! Response: ${res.body}`);
      break;
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function main() {
  console.log('🚀 Rate Limiting Test Script');
  console.log(`Target: ${BASE_URL}`);
  
  // Test 1: IP-based identity (no auth)
  await testIdentity('IP-based (anonymous)');
  
  // Test 2: Session-based identity
  await testIdentity('Session-based', {
    'Cookie': 'sessionId=test-session-123'
  });
  
  // Test 3: Different session
  await testIdentity('Different session', {
    'Cookie': 'sessionId=test-session-456'
  });
  
  console.log('\n✅ Test completed!');
  console.log('\n💡 Tips:');
  console.log('- Each identity has separate rate limits');
  console.log('- Check /admin/rate-limits/demo for interactive testing');
  console.log('- View /admin/rate-limits/users to see live counters');
}

main().catch(console.error);
