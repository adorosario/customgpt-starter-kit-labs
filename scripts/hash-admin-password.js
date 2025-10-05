#!/usr/bin/env node

/**
 * Admin Password Hasher
 * 
 * Generate bcrypt hash for admin password
 * Usage: node scripts/hash-admin-password.js [password]
 */

const bcrypt = require('bcryptjs');

async function hashPassword(password) {
  const saltRounds = 12;
  const hash = await bcrypt.hash(password, saltRounds);
  return hash;
}

async function main() {
  const password = process.argv[2];
  
  if (!password) {
    console.error('Usage: node scripts/hash-admin-password.js <password>');
    process.exit(1);
  }
  
  if (password.length < 8) {
    console.error('Password must be at least 8 characters long');
    process.exit(1);
  }
  
  try {
    const hash = await hashPassword(password);
    console.log('Password hash generated successfully!');
    console.log('Add this to your .env.local file:');
    console.log('');
    console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
    console.log('');
    console.log('Complete admin configuration:');
    console.log('ADMIN_ENABLED=true');
    console.log('ADMIN_USERNAME=admin');
    console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
    console.log('ADMIN_SESSION_TIMEOUT=3600');
    console.log('ADMIN_JWT_SECRET=your-secure-jwt-secret-here');
    console.log('# ADMIN_ALLOWED_IPS=127.0.0.1,10.0.0.0/8  # Optional IP restrictions');
  } catch (error) {
    console.error('Error generating password hash:', error);
    process.exit(1);
  }
}

main();
