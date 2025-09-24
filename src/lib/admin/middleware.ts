import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, logAdminAction } from './auth';

/**
 * Admin authentication middleware
 */
export async function withAdminAuth(
  request: NextRequest,
  handler: (request: NextRequest, user: any) => Promise<NextResponse>
) {
  try {
    const user = await getAdminUser(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Admin authentication required' },
        { status: 401 }
      );
    }
    
    // Update last activity
    user.lastActivity = Date.now();
    
    return handler(request, user);
  } catch (error) {
    console.error('[ADMIN_MIDDLEWARE] Auth error:', error);
    return NextResponse.json(
      { error: 'Authentication error' },
      { status: 500 }
    );
  }
}

/**
 * Create authenticated admin API handler
 */
export function createAdminHandler(
  handler: (request: NextRequest, user: any) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    // Normalize authorization header case to avoid client case-sensitivity issues
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Admin authentication required' },
        { status: 401 }
      );
    }
    return withAdminAuth(request, handler);
  };
}
