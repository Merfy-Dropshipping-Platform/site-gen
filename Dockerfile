# ========================
# Stage 1: Build
# ========================
FROM node:26-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@10.14.0

# Private @merfy-dropshipping-platform packages live on GitHub Packages.
# Coolify passes NODE_AUTH_TOKEN (PAT with read:packages) as a build arg;
# .npmrc references ${NODE_AUTH_TOKEN}.
ARG NODE_AUTH_TOKEN
ENV NODE_AUTH_TOKEN=${NODE_AUTH_TOKEN}

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install

COPY . .
# cache-bust: 2026-05-10-popular-rich-card
RUN pnpm build
# Precompile theme blocks (.astro + sibling .ts) to flat ESM under
# dist/astro-blocks/. Required for both PreviewService (Astro Container)
# and ThemePuckConfigController (dynamic-imports <pkg>__<block>__index.mjs).
RUN pnpm build:blocks
# DEBUG: list PopularProducts files immediately after build:blocks
RUN echo "=== PopularProducts files after build:blocks ===" \
    && ls -la /app/dist/astro-blocks/ | grep -i Popular || echo "(NONE found via grep)" \
    && echo "=== full count ===" \
    && ls /app/dist/astro-blocks/ | wc -l
# Sanity-check: if build:blocks silently produced no output (or skipped a
# critical block), every preview render would fail at runtime with
# "Block X not resolvable for themeId=Y". Fail the build NOW with a clear
# message instead of letting users hit a 500-ish preview later.
RUN test -f /app/dist/astro-blocks/theme-base__Header__Header.mjs \
    || (echo "FATAL: build:blocks did not produce theme-base Header.mjs — check astro syntax in packages/theme-base/blocks/Header/Header.astro" && exit 1)
RUN test -f /app/dist/astro-blocks/theme-base__Footer__Footer.mjs \
    || (echo "FATAL: build:blocks did not produce theme-base Footer.mjs" && exit 1)
RUN test -f /app/dist/astro-blocks/theme-base__Product__Product.mjs \
    || (echo "FATAL: build:blocks did not produce theme-base Product.mjs" && exit 1)
RUN test -f /app/dist/astro-blocks/theme-base__Catalog__Catalog.mjs \
    || (echo "FATAL: build:blocks did not produce theme-base Catalog.mjs" && exit 1)
RUN test -f /app/dist/astro-blocks/theme-base__PopularProducts__PopularProducts.mjs \
    || (echo "FATAL: build:blocks did not produce theme-base PopularProducts.mjs — check syntax in packages/theme-base/blocks/PopularProducts/PopularProducts.astro" && exit 1)
# Compile Tailwind utility bundle for the preview iframe — theme-base
# blocks use Tailwind classes in their .astro templates, and PreviewService
# injects this CSS so the iframe looks like the live site.
RUN pnpm build:preview-tailwind

# Constructor v2 (Phase 1): build every верстальщик theme under themes/ into
# dist/theme-preview/<name>/ (install + astro build + URL rewrite via
# ThemeBuildService). NODE_AUTH_TOKEN (set above) authorises the private
# design-system dep. Stage 2 copies all of /app/dist, so theme-preview ships.
RUN pnpm build:themes
# Sanity: rose is the reference theme — fail the build loudly if its assembled
# page is missing (otherwise the constructor preview would silently fall back to
# legacy for every site on a v2 theme).
RUN test -f /app/dist/theme-preview/rose/index.html \
    || (echo "FATAL: build:themes did not produce dist/theme-preview/rose/index.html" && exit 1)

# ========================
# Stage 2: Production
# ========================
FROM node:26-alpine

WORKDIR /app

RUN apk add --no-cache curl
RUN npm install -g pnpm@10.14.0

COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/templates ./templates
# Phase 3a: new-path assembler reads packages/ for layouts, blocks, styles, tokens
COPY --from=builder /app/packages ./packages
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
