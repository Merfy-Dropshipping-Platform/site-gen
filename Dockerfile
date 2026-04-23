# ========================
# Stage 1: Build
# ========================
FROM node:24-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@10.14.0

COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY . .
# cache-bust: 2026-04-21-preview-tailwind
RUN pnpm build
# Precompile theme blocks (.astro + sibling .ts) to flat ESM under
# dist/astro-blocks/. Required for both PreviewService (Astro Container)
# and ThemePuckConfigController (dynamic-imports <pkg>__<block>__index.mjs).
RUN pnpm build:blocks
# Compile Tailwind utility bundle for the preview iframe — theme-base
# blocks use Tailwind classes in their .astro templates, and PreviewService
# injects this CSS so the iframe looks like the live site.
RUN pnpm build:preview-tailwind

# ========================
# Stage 2: Production
# ========================
FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache curl
RUN npm install -g pnpm@10.14.0

COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/src/generator/templates/defaults ./dist/src/generator/templates/defaults
# Phase 2e: preset JSONs loaded on bootstrap by ThemePresetService.seedFromFiles
COPY --from=builder /app/seed ./seed
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3114

ENV NODE_ENV=production
ENV PORT=3114

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3114}/health || exit 1

CMD ["sh", "-c", "node dist/src/db/manual-migrate.js && node dist/src/main.js"]
