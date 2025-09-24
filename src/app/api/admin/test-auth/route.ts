import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, getAdminConfig } from '@/lib/admin/auth';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const config = getAdminConfig();
    
    console.log('=== AUTH TEST DEBUG ===');
    console.log('Config enabled:', config.enabled);
    console.log('Config username:', config.username);
    console.log('Has password hash:', !!config.passwordHash);
    console.log('Password hash:', config.passwordHash?.substring(0, 20) + '...');
    console.log('Input password:', password);
    console.log('Password length:', password?.length);
    
    if (!config.passwordHash) {
      return NextResponse.json({ error: 'No password hash configured' });
    }
    
    const isValid = await verifyPassword(password, config.passwordHash);
    console.log('Password verification result:', isValid);
    
    return NextResponse.json({
      success: true,
      passwordValid: isValid,
      configEnabled: config.enabled,
      configUsername: config.username,
      hasPasswordHash: !!config.passwordHash,
    });
    
  } catch (error) {
    console.error('Auth test error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
