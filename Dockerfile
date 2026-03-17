# ── Base ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ── Dependencies ───────────────────────────────────────────────────────────
FROM base AS deps
# Copy workspace manifests first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/graph/package.json ./packages/graph/
COPY packages/search/package.json ./packages/search/

# Install all deps (including devDeps needed for build)
RUN pnpm install --frozen-lockfile

# ── Builder ────────────────────────────────────────────────────────────────
FROM deps AS builder
# Copy full source
COPY . .

# Build all packages that api depends on, then api itself
RUN pnpm --filter @nexus/shared build
RUN pnpm --filter @nexus/graph build
RUN pnpm --filter @nexus/search build
RUN pnpm --filter @nexus/db build
RUN pnpm --filter @nexus/api build

# ── Production deps ────────────────────────────────────────────────────────
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/graph/package.json ./packages/graph/
COPY packages/search/package.json ./packages/search/

RUN pnpm install --frozen-lockfile --prod

# ── Runner ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

ENV NODE_ENV=production

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nexus

# Copy built artifacts and production node_modules
COPY --from=prod-deps  /app/node_modules              ./node_modules
COPY --from=builder    /app/apps/api/dist             ./apps/api/dist
COPY --from=builder    /app/packages/shared/dist      ./packages/shared/dist
COPY --from=builder    /app/packages/db/dist          ./packages/db/dist
COPY --from=builder    /app/packages/graph/dist       ./packages/graph/dist
COPY --from=builder    /app/packages/search/dist      ./packages/search/dist

# Package manifests (needed for module resolution)
COPY --from=builder    /app/apps/api/package.json     ./apps/api/
COPY --from=builder    /app/packages/shared/package.json ./packages/shared/
COPY --from=builder    /app/packages/db/package.json  ./packages/db/
COPY --from=builder    /app/packages/graph/package.json ./packages/graph/
COPY --from=builder    /app/packages/search/package.json ./packages/search/
COPY --from=builder    /app/package.json              ./

USER nexus

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]

# ── Web runner (placeholder for Next.js / other frontend) ──────────────────
FROM node:22-alpine AS web-runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nexus

# Web build would be copied here in a real setup
# COPY --from=web-builder /app/apps/web/.next/standalone ./
# COPY --from=web-builder /app/apps/web/public ./apps/web/public

USER nexus
EXPOSE 3000
CMD ["node", "server.js"]
