# syntax=docker/dockerfile:1

# Multi-stage build for the Next.js (standalone) app + Prisma.
# Build on your PC for the NAS architecture, e.g.:
#   docker buildx build --platform linux/arm64 -t happyhome-app:latest --load .   # ARM NAS (DS220+, DS920+ ARM, etc.)
#   docker buildx build --platform linux/amd64 -t happyhome-app:latest --load .   # Intel NAS
# Then: docker save happyhome-app:latest | gzip > happyhome-app.tar.gz  (copy to NAS, docker load)

# ---- deps: install full dependencies ----
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: generate Prisma client + build Next.js ----
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# `public/` holds only untracked assets, so it may be absent on a clean checkout —
# ensure it exists so the runner stage's COPY of it always succeeds.
RUN mkdir -p public
# `npm run build` runs `prisma generate && next build`
RUN npm run build

# ---- runner: minimal standalone runtime ----
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001

# Next.js standalone server + assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# `next build` bakes any .env* present at build time into the standalone output,
# which would override the runtime env_file (e.g. a stale Supabase DATABASE_URL).
# Strip them so the container's environment is the single source of truth.
RUN rm -f .env .env.local .env.development .env.production .env.production.local

# Prisma query engine + generated client for runtime (standalone trims node_modules)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
