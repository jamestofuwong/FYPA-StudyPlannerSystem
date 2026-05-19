# =============================================================================
# Build context: repo root (FYPA-StudyPlannerSystem/)
# Build command: docker build -f cloud/Dockerfile .
#
# Multi-stage build:
#   deps     — install production + dev dependencies
#   dev      — hot-reload dev server (used by docker-compose.override.yml)
#   builder  — generate Prisma client, run Next.js build
#   runner   — lean production image
#
# PDF parsing is handled by the pdf-parser sidecar container (runtime/pdf-parser/).
# This image needs no Python runtime.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: deps
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY cloud/package.json cloud/package-lock.json ./cloud/

RUN npm ci --prefix cloud --ignore-scripts

# -----------------------------------------------------------------------------
# Stage 2: dev
# Hot-reload development server.
#
# WORKDIR is intentionally /app (the repo root) so process.cwd() = /app.
# PATH includes cloud/node_modules/.bin so `prisma` and `next` resolve without
# the full path.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS dev
WORKDIR /app

RUN apk add --no-cache openssl chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PATH="/app/cloud/node_modules/.bin:$PATH"

COPY --from=deps /app/cloud/node_modules ./cloud/node_modules

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV WATCHPACK_POLLING=true
ENV CHOKIDAR_USEPOLLING=true

EXPOSE 3001
CMD ["sh", "-c", \
  "prisma generate --schema core/db/prisma/schema && \
   prisma db push --schema core/db/prisma/schema && \
   next dev cloud -p 3001"]

# -----------------------------------------------------------------------------
# Stage 3: builder
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/cloud/node_modules ./cloud/node_modules

COPY core/ ./core/
COPY cloud/ ./cloud/

RUN cd cloud && npx prisma generate --schema ../core/db/prisma/schema

ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd cloud && npm run build

# -----------------------------------------------------------------------------
# Stage 4: runner
# Minimal production image — Node.js only.
# PDF parsing is delegated to the pdf-parser sidecar via HTTP.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/cloud/.next/standalone ./
COPY --from=builder /app/cloud/.next/static     ./cloud/.next/static

COPY --from=builder /app/core/db/prisma/schema ./core/db/prisma/schema

# Install Prisma CLI at the pinned version globally so db push works at startup.
# Avoids the dependency-chain issues of selectively copying from builder node_modules.
RUN npm install -g prisma@6.19.2 --ignore-scripts

COPY cloud/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
