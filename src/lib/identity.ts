import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify, decodeJwt } from 'jose';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// Configuration schema
const ConfigSchema = z.object({
  identityOrder: z.array(z.enum(['jwt-sub', 'session-cookie', 'ip'])),
  jwtSecret: z.string().optional(),
  limits: z.object({
    global: z.object({
      minute: z.number(),
      hour: z.number(),
      day: z.number(),
      month: z.number(),
    }),
  }),
  routesInScope: z.array(z.string()),
  turnstileEnabled: z.boolean().optional(),
});

type Config = z.infer<typeof ConfigSchema>;

let cachedConfig: Config | null = null;
let configLastModified = 0;

/**
 * Load and validate configuration from config/rate-limits.json
 */
function loadConfig(): Config {
  try {
    const configPath = path.join(process.cwd(), 'config', 'rate-limits.json');
    const stats = fs.statSync(configPath);
    
    // Check if config needs to be reloaded
    if (!cachedConfig || stats.mtimeMs > configLastModified) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const parsedConfig = JSON.parse(configContent);
      cachedConfig = ConfigSchema.parse(parsedConfig);
      configLastModified = stats.mtimeMs;
      console.log('[Identity] Configuration loaded successfully');
    }
    
    return cachedConfig;
  } catch (error) {
    console.error('[Identity] Failed to load config:', error);
    // Return default configuration
    return {
      identityOrder: ['jwt-sub', 'session-cookie', 'ip'],
      jwtSecret: undefined,
      limits: {
        global: {
          minute: 10,
          hour: 100,
          day: 1000,
          month: 30000,
        },
      },
      routesInScope: ['/api/proxy/projects', '/api/proxy/user'],
      turnstileEnabled: false,
    };
  }
}

/**
 * Extract JWT subject from Authorization header
 */
async function extractJwtSubject(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const config = loadConfig();
    
    if (config.jwtSecret) {
      // Verify JWT with secret
      try {
        const secret = new TextEncoder().encode(config.jwtSecret);
        const { payload } = await jwtVerify(token, secret);
        return payload.sub || null;
      } catch (verifyError) {
        console.warn('[Identity] JWT verification failed:', verifyError);
        // Fall through to unverified decode for development
      }
    }
    
    // For development: decode without verification
    const decoded = decodeJwt(token);
    return decoded.sub || null;
  } catch (error) {
    console.warn('[Identity] JWT extraction failed:', error);
    return null;
  }
}

/**
 * Extract session ID from cookie
 */
function extractSessionId(request: NextRequest): string | null {
  try {
    // Try to get from Next.js cookies() first (for server components)
    try {
      const cookieStore = cookies();
      const sessionCookie = cookieStore.get('sessionId');
      if (sessionCookie?.value) {
        return sessionCookie.value;
      }
    } catch {
      // cookies() might not be available in all contexts
    }

    // Fallback to request headers
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) {
      return null;
    }

    const parsedCookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        acc[name] = decodeURIComponent(value);
      }
      return acc;
    }, {} as Record<string, string>);

    return parsedCookies.sessionId || null;
  } catch (error) {
    console.warn('[Identity] Session extraction failed:', error);
    return null;
  }
}

/**
 * Extract and hash IP address for privacy
 */
async function extractHashedIp(request: NextRequest): Promise<string> {
  try {
    // Get IP from various headers (Vercel, Cloudflare, etc.)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const cfConnectingIp = request.headers.get('cf-connecting-ip');
    
    let ip = forwardedFor?.split(',')[0]?.trim() || 
             realIp || 
             cfConnectingIp || 
             request.ip || 
             '127.0.0.1';

    // Hash the IP for privacy
    const encoder = new TextEncoder();
    const data = encoder.encode(ip);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex.substring(0, 16); // Use first 16 chars for brevity
  } catch (error) {
    console.warn('[Identity] IP hashing failed:', error);
    return 'unknown';
  }
}

/**
 * Main identity extraction function following the configured waterfall
 */
export async function getIdentityKey(request: NextRequest): Promise<string> {
  const config = loadConfig();
  
  for (const method of config.identityOrder) {
    try {
      switch (method) {
        case 'jwt-sub': {
          const jwtSub = await extractJwtSubject(request);
          if (jwtSub) {
            return `jwt:${jwtSub}`;
          }
          break;
        }
        
        case 'session-cookie': {
          const sessionId = extractSessionId(request);
          if (sessionId) {
            return `session:${sessionId}`;
          }
          break;
        }
        
        case 'ip': {
          const hashedIp = await extractHashedIp(request);
          return `ip:${hashedIp}`;
        }
      }
    } catch (error) {
      console.warn(`[Identity] Method ${method} failed:`, error);
      continue;
    }
  }
  
  // Fallback to anonymous if all methods fail
  return 'anonymous';
}

/**
 * Get the current configuration (for admin/debugging)
 */
export function getIdentityConfig(): Config {
  return loadConfig();
}
