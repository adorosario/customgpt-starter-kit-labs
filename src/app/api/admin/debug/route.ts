import { NextRequest, NextResponse } from 'next/server';
import { getAdminConfig } from '@/lib/admin/auth';

export async function GET(request: NextRequest) {
  const config = getAdminConfig();
  
  return NextResponse.json({
    debug: true,
    config: {
      enabled: config.enabled,
      username: config.username,
      hasPasswordHash: !!config.passwordHash,
      passwordHashLength: config.passwordHash?.length || 0,
      sessionTimeout: config.sessionTimeout,
      hasJwtSecret: !!config.jwtSecret,
      allowedIPs: config.allowedIPs,
    },
    environment: {
      ADMIN_ENABLED: process.env.ADMIN_ENABLED,
      ADMIN_USERNAME: process.env.ADMIN_USERNAME,
      hasADMIN_PASSWORD_HASH: !!process.env.ADMIN_PASSWORD_HASH,
      hasADMIN_JWT_SECRET: !!process.env.ADMIN_JWT_SECRET,
    },
  });
}
