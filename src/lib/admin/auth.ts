import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import fs from 'fs';
import path from 'path';

export interface AdminUser {
  username: string;
  role: 'admin';
  sessionId: string;
  loginTime: number;
  lastActivity: number;
  ipAddress: string;
}

export interface AdminAuthConfig {
  enabled: boolean;
  username: string;
  passwordHash: string;
  sessionTimeout: number; // in seconds
  allowedIPs?: string[];
  jwtSecret: string;
}

/**
 * Best-effort loader for admin-related env vars from .env.local/.env if missing.
 * This guards against cases where the running dev server hasn't reloaded envs yet.
 */
function loadAdminEnvVariablesIfMissing() {
  const requiredKeys = new Set([
    'ADMIN_ENABLED',
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD_HASH',
    'ADMIN_SESSION_TIMEOUT',
    'ADMIN_ALLOWED_IPS',
    'ADMIN_JWT_SECRET',
  ]);

  const isMissing = (key: string) => {
    const val = process.env[key];
    return typeof val === 'undefined' || String(val).trim() === '';
  };

  const needsLoad = Array.from(requiredKeys).some(isMissing);
  if (!needsLoad) return;

  const candidates = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
  ];

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) continue;
        const key = line.slice(0, eqIndex).trim();
        if (!requiredKeys.has(key)) continue;
        let value = line.slice(eqIndex + 1).trim();
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // Remove any trailing whitespace that might have been included
        value = value.replace(/\s+$/g, '');

        if (isMissing(key)) {
          process.env[key] = value;
        }
      }
    } catch (_) {
      // Ignore parsing errors and continue
    }
  }
}

/**
 * Get admin configuration from environment (with fallback loader)
 */
export function getAdminConfig(): AdminAuthConfig {
  // Ensure env is populated if Next.js hasn't injected yet
  loadAdminEnvVariablesIfMissing();

  const enabledRaw = process.env.ADMIN_ENABLED ?? '';
  const usernameRaw = process.env.ADMIN_USERNAME ?? 'admin';
  const passwordHashRaw = process.env.ADMIN_PASSWORD_HASH ?? '';
  const sessionTimeoutRaw = process.env.ADMIN_SESSION_TIMEOUT ?? '3600';
  const allowedIPsRaw = process.env.ADMIN_ALLOWED_IPS ?? '';
  const jwtSecretRaw = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'admin-secret';

  const enabled = String(enabledRaw).trim().toLowerCase() === 'true';
  const username = String(usernameRaw).trim();
  const passwordHash = String(passwordHashRaw).trim();
  const sessionTimeout = parseInt(String(sessionTimeoutRaw).trim() || '3600');
  const allowedIPs = allowedIPsRaw
    ? String(allowedIPsRaw)
        .split(',')
        .map(ip => ip.trim())
        .filter(Boolean)
    : undefined;
  const jwtSecret = String(jwtSecretRaw).trim();

  return {
    enabled,
    username,
    passwordHash,
    sessionTimeout,
    allowedIPs,
    jwtSecret,
  };
}

/**
 * Hash a password for storage
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Get client IP from request
 */
export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnecting = request.headers.get('cf-connecting-ip');
  
  return (forwarded?.split(',')[0] || realIp || cfConnecting || request.ip || '127.0.0.1').trim();
}

/**
 * Check if IP is allowed
 */
export function isIPAllowed(ip: string, allowedIPs?: string[]): boolean {
  if (!allowedIPs || allowedIPs.length === 0) {
    return true; // No IP restrictions
  }
  
  return allowedIPs.some(allowedIP => {
    if (allowedIP.includes('/')) {
      // CIDR notation - simplified check for common cases
      const [network, bits] = allowedIP.split('/');
      if (bits === '8' && ip.startsWith(network.split('.')[0] + '.')) return true;
      if (bits === '16' && ip.startsWith(network.split('.').slice(0, 2).join('.') + '.')) return true;
      if (bits === '24' && ip.startsWith(network.split('.').slice(0, 3).join('.') + '.')) return true;
    }
    return ip === allowedIP;
  });
}

/**
 * Create admin JWT token
 */
export async function createAdminToken(user: AdminUser): Promise<string> {
  const config = getAdminConfig();
  const secret = new TextEncoder().encode(config.jwtSecret);
  
  return new SignJWT({
    sub: user.username,
    role: user.role,
    sessionId: user.sessionId,
    loginTime: user.loginTime,
    ipAddress: user.ipAddress,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + config.sessionTimeout)
    .sign(secret);
}

/**
 * Verify admin JWT token
 */
export async function verifyAdminToken(token: string): Promise<AdminUser | null> {
  try {
    const config = getAdminConfig();
    const secret = new TextEncoder().encode(config.jwtSecret);
    
    const { payload } = await jwtVerify(token, secret);
    
    if (payload.role !== 'admin') {
      return null;
    }
    
    return {
      username: payload.sub as string,
      role: 'admin',
      sessionId: payload.sessionId as string,
      loginTime: payload.loginTime as number,
      lastActivity: Date.now(),
      ipAddress: payload.ipAddress as string,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Authenticate admin user
 */
export async function authenticateAdmin(
  username: string, 
  password: string, 
  ip: string
): Promise<{ success: boolean; user?: AdminUser; error?: string }> {
  const config = getAdminConfig();
  
  if (!config.enabled) {
    return { success: false, error: 'Admin panel is disabled' };
  }
  
  if (!isIPAllowed(ip, config.allowedIPs)) {
    return { success: false, error: 'IP address not allowed' };
  }
  
  if (username !== config.username) {
    return { success: false, error: 'Invalid credentials' };
  }
  
  if (!config.passwordHash) {
    return { success: false, error: 'Admin password not configured' };
  }
  
  const isValidPassword = await verifyPassword(password, config.passwordHash);
  if (!isValidPassword) {
    return { success: false, error: 'Invalid credentials' };
  }
  
  const user: AdminUser = {
    username,
    role: 'admin',
    sessionId: crypto.randomUUID(),
    loginTime: Date.now(),
    lastActivity: Date.now(),
    ipAddress: ip,
  };
  
  return { success: true, user };
}

/**
 * Extract admin user from request
 */
export async function getAdminUser(request: NextRequest): Promise<AdminUser | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const user = await verifyAdminToken(token);
  
  if (!user) {
    return null;
  }
  
  // Check IP consistency
  const currentIP = getClientIP(request);
  if (user.ipAddress !== currentIP) {
    return null; // IP changed, invalid session
  }
  
  // Check session timeout
  const config = getAdminConfig();
  if (Date.now() - user.lastActivity > config.sessionTimeout * 1000) {
    return null; // Session expired
  }
  
  return user;
}

/**
 * Log admin action for audit trail
 */
export function logAdminAction(user: AdminUser, action: string, details?: any) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'admin_action',
    username: user.username,
    sessionId: user.sessionId,
    ipAddress: user.ipAddress,
    action,
    details,
  };
  
  console.log('[ADMIN_AUDIT]', JSON.stringify(logEntry));
  // Durable audit log in Redis (best-effort)
  try {
    // Lazy import to avoid circular
    const { Redis } = require('@upstash/redis');
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      const redis = new Redis({ url, token });
      const key = `admin:audit:${new Date().toISOString().slice(0,10)}`; // per-day list
      const entry = JSON.stringify(logEntry);
      redis.lpush(key, entry).catch(() => {});
      redis.expire(key, 7 * 24 * 3600).catch(() => {});
    }
  } catch {}
}
