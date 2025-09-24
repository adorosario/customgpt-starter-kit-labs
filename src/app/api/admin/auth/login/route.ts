import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateAdmin, createAdminToken, getClientIP, logAdminAction } from '@/lib/admin/auth';

const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parseResult = LoginSchema.safeParse(body);
    
    if (!parseResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid request data',
          details: parseResult.error.flatten()
        },
        { status: 400 }
      );
    }
    
    const { username, password } = parseResult.data;
    const clientIP = getClientIP(request);
    
    // Authenticate user
    const authResult = await authenticateAdmin(username, password, clientIP);
    
    if (!authResult.success || !authResult.user) {
      // Log failed login attempt
      console.log('[ADMIN_AUTH] Failed login attempt:', {
        username,
        ip: clientIP,
        error: authResult.error,
        timestamp: new Date().toISOString(),
      });
      
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 401 }
      );
    }
    
    // Create JWT token
    const token = await createAdminToken(authResult.user);
    
    // Log successful login
    logAdminAction(authResult.user, 'login', { ip: clientIP });
    
    return NextResponse.json({
      success: true,
      token,
      user: {
        username: authResult.user.username,
        role: authResult.user.role,
        loginTime: authResult.user.loginTime,
      },
    });
    
  } catch (error) {
    console.error('[ADMIN_AUTH] Login error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Admin authentication endpoint',
    methods: ['POST'],
    body: {
      username: 'string',
      password: 'string',
    },
  });
}
