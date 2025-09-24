import { Redis } from '@upstash/redis';
import { getIdentityConfig } from '@/lib/identity';

export interface UserRateLimitStatus {
  identityKey: string;
  identityType: 'jwt' | 'session' | 'ip';
  windows: {
    perMinute: { current: number; limit: number; resetTime: number };
    perHour: { current: number; limit: number; resetTime: number };
    perDay: { current: number; limit: number; resetTime: number };
  };
  lastActivity: string;
  isBlocked: boolean;
}

export interface SearchFilters {
  identityKey?: string;
  identityType?: 'jwt' | 'session' | 'ip' | 'all';
  status?: 'active' | 'blocked' | 'exceeded' | 'all';
  timeRange?: '1h' | '24h' | '7d' | '30d';
  sortBy?: 'usage' | 'lastActivity' | 'resetTime';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  blockedRequests: number;
  requestsPerMinute: number;
  topUsers: Array<{
    identityKey: string;
    requestCount: number;
    identityType: 'jwt' | 'session' | 'ip';
  }>;
  usageByType: {
    jwt: number;
    session: number;
    ip: number;
  };
}

/**
 * Get Redis client for analytics
 */
function getRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    throw new Error('Redis not configured');
  }
  
  return new Redis({ url, token });
}

/**
 * Get current timestamp windows
 */
function getTimeWindows() {
  const now = Math.floor(Date.now() / 1000);
  return {
    minute: now - (now % 60),
    hour: now - (now % 3600),
    day: now - (now % 86400),
  };
}

/**
 * Extract identity type from identity key
 */
function getIdentityType(identityKey: string): 'jwt' | 'session' | 'ip' {
  if (identityKey.startsWith('jwt:')) return 'jwt';
  if (identityKey.startsWith('session:')) return 'session';
  return 'ip';
}

/**
 * Get rate limit configuration (merged defaults + Redis overrides)
 */
function getRateLimitConfig() {
  const cfg = getIdentityConfig();
  return {
    global: {
      minute: cfg.limits.global.minute,
      hour: cfg.limits.global.hour,
      day: cfg.limits.global.day,
    },
  };
}

/**
 * Scan Redis for all rate limit keys and extract user data
 */
export async function getAllUsers(filters: SearchFilters = {}): Promise<{
  users: UserRateLimitStatus[];
  totalCount: number;
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
  };
}> {
  const redis = getRedisClient();
  const timeWindows = getTimeWindows();
  const config = getRateLimitConfig();
  
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  
  try {
    // Scan for all rate limit keys
    const allKeys = await redis.keys('rate:*');
    
    // Group keys by identity
    const identityMap = new Map<string, { minute?: number; hour?: number; day?: number }>();
    
    for (const key of allKeys) {
      const parts = key.split(':');
      if (parts.length >= 4) {
        const window = parts[1];
        const identityKey = parts.slice(3).join(':');
        
        if (!identityMap.has(identityKey)) {
          identityMap.set(identityKey, {});
        }
        
        const identity = identityMap.get(identityKey)!;
        
        // Get current count for this window
        const count = await redis.get(key) as number || 0;
        
        if (window === 'minute') identity.minute = count;
        else if (window === 'hour') identity.hour = count;
        else if (window === 'day') identity.day = count;
      }
    }
    
    // Convert to UserRateLimitStatus array
    let users: UserRateLimitStatus[] = Array.from(identityMap.entries()).map(([identityKey, counters]) => {
      const identityType = getIdentityType(identityKey);
      const minuteCount = counters.minute || 0;
      const hourCount = counters.hour || 0;
      const dayCount = counters.day || 0;
      
      return {
        identityKey,
        identityType,
        windows: {
          perMinute: {
            current: minuteCount,
            limit: config.global.minute,
            resetTime: timeWindows.minute + 60,
          },
          perHour: {
            current: hourCount,
            limit: config.global.hour,
            resetTime: timeWindows.hour + 3600,
          },
          perDay: {
            current: dayCount,
            limit: config.global.day,
            resetTime: timeWindows.day + 86400,
          },
        },
        lastActivity: new Date().toISOString(), // This would be tracked separately in a real system
        isBlocked: minuteCount >= config.global.minute,
      };
    });
    
    // Apply filters
    if (filters.identityKey) {
      users = users.filter(user => 
        user.identityKey.toLowerCase().includes(filters.identityKey!.toLowerCase())
      );
    }
    
    if (filters.identityType && filters.identityType !== 'all') {
      users = users.filter(user => user.identityType === filters.identityType);
    }
    
    if (filters.status && filters.status !== 'all') {
      users = users.filter(user => {
        switch (filters.status) {
          case 'blocked':
            return user.isBlocked;
          case 'exceeded':
            return user.windows.perMinute.current > user.windows.perMinute.limit * 0.8;
          case 'active':
            return !user.isBlocked && user.windows.perMinute.current > 0;
          default:
            return true;
        }
      });
    }
    
    // Apply sorting
    if (filters.sortBy) {
      users.sort((a, b) => {
        let aVal: number, bVal: number;
        
        switch (filters.sortBy) {
          case 'usage':
            aVal = a.windows.perMinute.current;
            bVal = b.windows.perMinute.current;
            break;
          case 'resetTime':
            aVal = a.windows.perMinute.resetTime;
            bVal = b.windows.perMinute.resetTime;
            break;
          case 'lastActivity':
            aVal = new Date(a.lastActivity).getTime();
            bVal = new Date(b.lastActivity).getTime();
            break;
          default:
            return 0;
        }
        
        return filters.sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    
    const totalCount = users.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const paginatedUsers = users.slice(startIndex, startIndex + limit);
    
    return {
      users: paginatedUsers,
      totalCount,
      pagination: {
        page,
        limit,
        totalPages,
      },
    };
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Error fetching users:', error);
    throw error;
  }
}

/**
 * Get specific user details
 */
export async function getUserDetails(identityKey: string): Promise<UserRateLimitStatus | null> {
  const result = await getAllUsers({ identityKey, limit: 1 });
  return result.users[0] || null;
}

/**
 * Get analytics dashboard data
 */
export async function getAnalytics(): Promise<AnalyticsData> {
  const redis = getRedisClient();
  
  try {
    const allUsers = await getAllUsers({ limit: 1000 }); // Get more for analytics
    
    const activeUsers = allUsers.users.filter(user => 
      user.windows.perMinute.current > 0
    ).length;
    
    const blockedUsers = allUsers.users.filter(user => user.isBlocked).length;
    
    const totalRequests = allUsers.users.reduce((sum, user) => 
      sum + user.windows.perMinute.current, 0
    );
    
    const topUsers = allUsers.users
      .sort((a, b) => b.windows.perMinute.current - a.windows.perMinute.current)
      .slice(0, 10)
      .map(user => ({
        identityKey: user.identityKey,
        requestCount: user.windows.perMinute.current,
        identityType: user.identityType,
      }));
    
    const usageByType = allUsers.users.reduce((acc, user) => {
      acc[user.identityType] += user.windows.perMinute.current;
      return acc;
    }, { jwt: 0, session: 0, ip: 0 });
    
    return {
      totalUsers: allUsers.totalCount,
      activeUsers,
      blockedRequests: blockedUsers,
      requestsPerMinute: totalRequests,
      topUsers,
      usageByType,
    };
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Error getting analytics:', error);
    throw error;
  }
}

/**
 * Reset user counters
 */
export async function resetUserCounters(identityKey: string, window?: 'minute' | 'hour' | 'day'): Promise<void> {
  const redis = getRedisClient();
  const timeWindows = getTimeWindows();
  
  try {
    if (window) {
      // Reset specific window
      const windowStart = timeWindows[window];
      const key = `rate:${window}:${windowStart}:${identityKey}`;
      await redis.del(key);
    } else {
      // Reset all windows for this user
      const keys = [
        `rate:minute:${timeWindows.minute}:${identityKey}`,
        `rate:hour:${timeWindows.hour}:${identityKey}`,
        `rate:day:${timeWindows.day}:${identityKey}`,
      ];
      
      await redis.del(...keys);
    }
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Error resetting user counters:', error);
    throw error;
  }
}

/**
 * Export users data to CSV format
 */
export function exportUsersToCSV(users: UserRateLimitStatus[]): string {
  const headers = [
    'Identity Key',
    'Identity Type',
    'Minute Current',
    'Minute Limit',
    'Hour Current', 
    'Hour Limit',
    'Day Current',
    'Day Limit',
    'Is Blocked',
    'Last Activity'
  ];
  
  const rows = users.map(user => [
    user.identityKey,
    user.identityType,
    user.windows.perMinute.current.toString(),
    user.windows.perMinute.limit.toString(),
    user.windows.perHour.current.toString(),
    user.windows.perHour.limit.toString(),
    user.windows.perDay.current.toString(),
    user.windows.perDay.limit.toString(),
    user.isBlocked.toString(),
    user.lastActivity,
  ]);
  
  return [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
}
