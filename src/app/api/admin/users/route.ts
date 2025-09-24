import { NextRequest, NextResponse } from 'next/server';
import { createAdminHandler } from '@/lib/admin/middleware';
import { getAllUsers, type SearchFilters } from '@/lib/admin/analytics';
import { logAdminAction } from '@/lib/admin/auth';

export const GET = createAdminHandler(async (request: NextRequest, user: any) => {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    
    // Parse filters from query parameters
    const filters: SearchFilters = {
      identityKey: searchParams.get('identityKey') || undefined,
      identityType: (searchParams.get('identityType') as any) || 'all',
      status: (searchParams.get('status') as any) || 'all',
      timeRange: (searchParams.get('timeRange') as any) || '24h',
      sortBy: (searchParams.get('sortBy') as any) || 'usage',
      sortOrder: (searchParams.get('sortOrder') as any) || 'desc',
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '50'),
    };
    
    // Get users data
    const result = await getAllUsers(filters);
    
    // Log admin action
    logAdminAction(user, 'view_users', { filters });
    
    return NextResponse.json({
      success: true,
      data: result.users,
      pagination: result.pagination,
      totalCount: result.totalCount,
      filters,
    });
    
  } catch (error) {
    console.error('[ADMIN_API] Error fetching users:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
});
