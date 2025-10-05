import { NextRequest, NextResponse } from 'next/server';
import { createAdminHandler } from '@/lib/admin/middleware';
import { Redis } from '@upstash/redis';

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export const GET = createAdminHandler(async (request: NextRequest) => {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Redis not configured' }, { status: 503 });
    }

    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const level = searchParams.get('level') || 'all';
    const day = searchParams.get('day'); // YYYY-MM-DD, optional

    // Determine keys to read (today or specific day, fallback last 3 days)
    const days: string[] = [];
    if (day) {
      days.push(day);
    } else {
      const d = new Date();
      for (let i = 0; i < 3; i++) {
        const dt = new Date(d.getTime() - i * 24 * 3600 * 1000);
        const key = dt.toISOString().slice(0, 10);
        days.push(key);
      }
    }

    let entries: any[] = [];
    for (const dayKey of days) {
      const key = `admin:audit:${dayKey}`;
      const list = await redis.lrange<string>(key, 0, -1);
      entries.push(...(list || []).map(x => JSON.parse(x)));
    }

    // Level filter is currently not persisted; keep for future use
    if (level !== 'all') {
      entries = entries.filter(e => e.level === level);
    }

    // Sort desc by timestamp
    entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

    const totalCount = entries.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const startIndex = (page - 1) * limit;
    const slice = entries.slice(startIndex, startIndex + limit);

    return NextResponse.json({ success: true, data: slice, pagination: { page, limit, totalPages, totalCount } });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to load logs' }, { status: 500 });
  }
});


