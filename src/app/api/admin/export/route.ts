import { NextRequest, NextResponse } from 'next/server';
import { createAdminHandler } from '@/lib/admin/middleware';
import { getAllUsers, exportUsersToCSV, type SearchFilters } from '@/lib/admin/analytics';
import { logAdminAction } from '@/lib/admin/auth';

export const GET = createAdminHandler(async (request: NextRequest, user: any) => {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const format = searchParams.get('format') || 'csv';
    
    if (format !== 'csv' && format !== 'json') {
      return NextResponse.json(
        { success: false, error: 'Unsupported format. Use csv or json' },
        { status: 400 }
      );
    }
    
    // Parse filters from query parameters
    const filters: SearchFilters = {
      identityKey: searchParams.get('identityKey') || undefined,
      identityType: (searchParams.get('identityType') as any) || 'all',
      status: (searchParams.get('status') as any) || 'all',
      timeRange: (searchParams.get('timeRange') as any) || '24h',
      sortBy: (searchParams.get('sortBy') as any) || 'usage',
      sortOrder: (searchParams.get('sortOrder') as any) || 'desc',
      limit: 10000, // Export limit
    };
    
    // Get all users data for export
    const result = await getAllUsers(filters);
    
    // Log admin action
    logAdminAction(user, 'export_data', { 
      format, 
      userCount: result.totalCount,
      filters 
    });
    
    if (format === 'csv') {
      const csvData = exportUsersToCSV(result.users);
      const timestamp = new Date().toISOString().split('T')[0];
      
      return new NextResponse(csvData, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="rate-limit-users-${timestamp}.csv"`,
        },
      });
    } else {
      // JSON format
      const timestamp = new Date().toISOString().split('T')[0];
      
      return new NextResponse(JSON.stringify(result, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="rate-limit-users-${timestamp}.json"`,
        },
      });
    }
    
  } catch (error) {
    console.error('[ADMIN_API] Error exporting data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to export data' },
      { status: 500 }
    );
  }
});
