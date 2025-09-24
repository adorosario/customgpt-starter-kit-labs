import { NextRequest, NextResponse } from 'next/server';
import { createAdminHandler } from '@/lib/admin/middleware';
import { getAnalytics } from '@/lib/admin/analytics';
import { logAdminAction } from '@/lib/admin/auth';

export const GET = createAdminHandler(async (request: NextRequest, user: any) => {
  try {
    const analytics = await getAnalytics();
    
    // Log admin action
    logAdminAction(user, 'view_analytics');
    
    return NextResponse.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('[ADMIN_API] Error fetching analytics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
});
