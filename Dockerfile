# Multi-stage Dockerfile for CustomGPT UI
# Supports flexible deployment: standalone app, widget only, or iframe only

# ============================================
# Stage 1: Base Dependencies
# ============================================
FROM node:18-alpine AS base
WORKDIR /app

# Install dependencies needed for both dev and prod
RUN apk add --no-cache libc6-compat curl

# Enable pnpm
RUN corepack enable pnpm

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --prod --frozen-lockfile

# ============================================
# Stage 2: Builder - All Assets
# ============================================
FROM node:18-alpine AS builder
WORKDIR /app

# Enable pnpm
RUN corepack enable pnpm

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Install all dependencies (including dev)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build all targets
RUN pnpm run type-check
RUN pnpm run build:all

# ============================================
# Stage 3: Standalone App (Full Next.js App)
# ============================================
FROM node:18-alpine AS standalone
WORKDIR /app

# Copy dependencies from base stage
COPY --from=base /app/node_modules ./node_modules

# Copy built app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy necessary config files
COPY --from=builder /app/next.config.js ./

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server.js"]

# ============================================
# Stage 4: Widget Only (Static Assets)
# ============================================
FROM nginx:alpine AS widget
WORKDIR /usr/share/nginx/html

# Copy widget build output
COPY --from=builder /app/dist/widget/ ./

# Copy nginx config for CORS and proper headers
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;
    
    # Enable CORS for widget embedding
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
    
    # Handle preflight requests
    location / {
        if (\$request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain charset=UTF-8';
            add_header 'Content-Length' 0;
            return 204;
        }
        try_files \$uri \$uri/ =404;
    }
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/customgpt-widget.js || exit 1

EXPOSE 80

# ============================================
# Stage 5: Iframe Only (Static Assets)
# ============================================
FROM nginx:alpine AS iframe
WORKDIR /usr/share/nginx/html

# Copy iframe build output
COPY --from=builder /app/dist/iframe/ ./

# Copy nginx config for iframe embedding
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;
    
    # Allow iframe embedding
    add_header 'X-Frame-Options' 'ALLOWALL' always;
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
    
    # Handle preflight requests
    location / {
        if (\$request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain charset=UTF-8';
            add_header 'Content-Length' 0;
            return 204;
        }
        try_files \$uri \$uri/ /index.html;
    }
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Security headers (relaxed for iframe)
    add_header X-Content-Type-Options "nosniff" always;
}
EOF

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

EXPOSE 80

# ============================================
# Stage 6: Development (Hot Reload)
# ============================================
FROM node:18-alpine AS development
WORKDIR /app

# Install dependencies
RUN apk add --no-cache libc6-compat

# Enable pnpm
RUN corepack enable pnpm

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Expose ports for all dev servers
EXPOSE 3000 8080 8081

# Default to Next.js dev server
CMD ["pnpm", "run", "dev"]