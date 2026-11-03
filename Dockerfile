# ========================
# Stage 1: Build
# ========================
FROM node:24-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@10.14.0

# Private @merfy-dropshipping-platform packages live on GitHub Packages.
# Coolify passes NODE_AUTH_TOKEN (PAT with read:packages) as a build arg;
# .npmrc references ${NODE_AUTH_TOKEN}.
ARG NODE_AUTH_TOKEN
ENV NODE_AUTH_TOKEN=${NODE_AUTH_TOKEN}

# Dependency layer: copy the narrow workspace manifest + the three workspace
# package manifests BEFORE install so the clean image creates the package-local
# importers (theme-contract/theme-base/theme-bloom → their own Zod 3), not just
# root Zod 4 (F-044/F-046). All workspace importers are now locked, so this is
# a --frozen-lockfile install. Cache boundary (this layer only invalidates when
# a manifest/lock/workspace/npmrc changes) is preserved.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/stand-check/package.json ./packages/stand-check/package.json
COPY packages/storefront-build/package.json ./packages/storefront-build/package.json
COPY packages/storefront-storage/package.json ./packages/storefront-storage/package.json
COPY packages/storefront-builder/package.json ./packages/storefront-builder/package.json
COPY packages/storefront-shell/package.json ./packages/storefront-shell/package.json
COPY packages/storefront-sections/package.json ./packages/storefront-sections/package.json
COPY packages/theme-contract/package.json ./packages/theme-contract/package.json
COPY packages/theme-base/package.json ./packages/theme-base/package.json
COPY packages/storefront-config/package.json ./packages/storefront-config/package.json
COPY packages/theme-bloom/package.json ./packages/theme-bloom/package.json
COPY packages/theme-satin/package.json ./packages/theme-satin/package.json
COPY packages/tokens/package.json ./packages/tokens/package.json
COPY packages/sdk-docs/package.json ./packages/sdk-docs/package.json
RUN pnpm install --frozen-lockfile

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
# Sanity: КАЖДАЯ мигрированная тема обязана иметь и preview-, и live-дист.
# Проверки только по rose/theme-preview было мало: build.service помечает тему
# как themes-v2 по наличию dist/theme-live/<t>/index.html, и при его отсутствии
# сборка витрины уходила в legacy scaffold. Теперь это падение (см. guard в
# build.service.ts), поэтому недостающий дист обязан валить образ здесь — раньше,
# чем сайты мерчантов начнут падать в рантайме.
# Список синхронизирован с MIGRATED_THEMES в src/generator/build.service.ts.
RUN for t in rose bloom flux satin vanilla; do \
      for kind in theme-preview theme-live; do \
        test -f "/app/dist/$kind/$t/index.html" \
          || (echo "FATAL: build:themes did not produce dist/$kind/$t/index.html" && exit 1); \
      done; \
    done

# Constructor v2 Phase 2: compile sliced theme sections (canon manifest) for
# Container rendering of content pages. Only themes with sections.map.json.
RUN for t in $(ls themes); do \
      if [ -f "themes/$t/sections.map.json" ]; then \
        node scripts/compile-theme-sections.mjs "$t" || exit 1; \
      fi; \
    done
RUN test -f /app/dist/theme-sections/rose/manifest.json \
    || (echo "FATAL: compile-theme-sections did not produce rose manifest" && exit 1)

# ========================
# Stage 1b: рисовальщик сборщика витрин (блок 6 «Каркаса витрины») — серверная
# сборка каждой темы новой архитектуры (theme-versions.json) в
# themes/<тема>/dist-renderer. Зависимости тем поставил build:themes выше.
# Образ sites эту стадию не собирает: она нужна только цели storefront-builder.
# ========================
FROM builder AS storefront-renderer
RUN pnpm --filter @merfy/storefront-builder renderer
RUN test -f /app/themes/nova/dist-renderer/server/entry.mjs \
    || (echo "FATAL: storefront-builder renderer did not produce themes/nova/dist-renderer" && exit 1)
# Ядро секций @merfy/shell (блок 5 «Секций и SDK», часть 5б): собирается один раз на версию платформы; сборка магазина
# собирает из dist/core.js бандл каждой страницы. Части страницы — packages/storefront-shell/core-parts.json.
RUN pnpm --filter @merfy/shell build
RUN test -f /app/packages/storefront-shell/dist/core.json && test -f /app/packages/storefront-shell/dist/core.js \
    && test -f /app/packages/storefront-shell/dist/behaviors/behaviors.json \
    && test -f /app/packages/storefront-shell/dist/preview.js \
    || (echo "FATAL: @merfy/shell build did not produce dist/core.json, core.js, behaviors/behaviors.json and preview.js" && exit 1)
# Процессы проверки и рендера секций (блок 2 «Секций и SDK»): собранные файлы dist-render — их запускает Node под
# --permission, без tsx.
RUN pnpm --filter @merfy/storefront-sections build:workers
RUN for f in render-worker check-worker sandbox-probe; do \
      test -f "/app/packages/storefront-sections/dist-render/$f.mjs" \
        || (echo "FATAL: storefront-sections build:workers did not produce dist-render/$f.mjs" && exit 1); \
    done

# ========================
# Stage 2: Production
# ========================
FROM node:24-alpine AS runtime

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

# ========================
# Stage 3: сборщик витрин (блок 6, В6-1 А) — тот же образ, своя команда запуска.
# В Coolify: отдельное приложение, Docker Build Stage Target = storefront-builder.
# ========================
FROM runtime AS storefront-builder

# Тема nova с её зависимостями и сборкой рисовальщика — только в образе сборщика.
COPY --from=storefront-renderer /app/themes/nova /app/themes/nova
COPY --from=storefront-renderer /app/packages/storefront-shell/dist /app/packages/storefront-shell/dist
# Процессы рендера и проверки секций (блок 2 «Секций и SDK», «Решил сам» пп. 1, 2): бинарник Node 26 — под --permission
# сеть закрыта только с 25-й версии, сам сборщик остаётся на 24; база образов одна — alpine 3.24. Сборщик — root, у
# каждого процесса — свой пользователь ОС (В2-3 А): uid 10001–11000, по одному на живой процесс, группа sandbox (10001).
# Сигнал процессу другого пользователя ОС ядро не пропускает (EPERM) — ни сборщику, ни соседнему процессу рендера, и
# инспектор по сигналу (process._debugProcess) у них не открыть. Записей этих uid в /etc/passwd нет: Node запускает
# процесс по числу. --disable-sigusr1 у сборщика — запасной слой; процессам рендера NODE_OPTIONS не достаётся (окружение
# у них пустое), этот флаг им ставит isolation.ts. Отчёт песочницы — строка журнала render-sandbox при старте сборщика.
COPY --from=node:26.12.0-alpine3.24 /usr/local/bin/node /usr/local/bin/node26
RUN addgroup -g 10001 -S sandbox
COPY --from=storefront-renderer /app/packages/storefront-sections/dist-render /app/packages/storefront-sections/dist-render
ENV SECTION_RENDER_NODE=/usr/local/bin/node26 SECTION_RENDER_UID_FIRST=10001 SECTION_RENDER_UID_COUNT=1000 SECTION_RENDER_GID=10001
ENV NODE_OPTIONS=--disable-sigusr1
ENV PORT=8080
EXPOSE 8080
WORKDIR /app/packages/storefront-builder
CMD ["node_modules/.bin/tsx", "src/main.ts"]

# ========================
# Stage 4: проверяющий процесс выпуска (блок 10, П10-3 В) — паспорт главной магазина в браузере, по одному магазину.
# Chromium на Alpine не работает, поэтому база — образ Playwright той же версии, что пакет playwright (1.59.1), а
# зависимости ставятся здесь заново: node_modules стадии builder собраны под musl.
# В Coolify: отдельное приложение, Docker Build Stage Target = storefront-checker, предел памяти — в его настройках.
# ========================
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS storefront-checker

WORKDIR /app
RUN npm install -g pnpm@10.14.0
ARG NODE_AUTH_TOKEN
ENV NODE_AUTH_TOKEN=${NODE_AUTH_TOKEN}
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/stand-check/package.json ./packages/stand-check/package.json
COPY packages/storefront-build/package.json ./packages/storefront-build/package.json
COPY packages/storefront-storage/package.json ./packages/storefront-storage/package.json
COPY packages/storefront-builder/package.json ./packages/storefront-builder/package.json
COPY packages/storefront-shell/package.json ./packages/storefront-shell/package.json
COPY packages/storefront-sections/package.json ./packages/storefront-sections/package.json
COPY packages/theme-contract/package.json ./packages/theme-contract/package.json
COPY packages/theme-base/package.json ./packages/theme-base/package.json
COPY packages/storefront-config/package.json ./packages/storefront-config/package.json
COPY packages/theme-bloom/package.json ./packages/theme-bloom/package.json
COPY packages/theme-satin/package.json ./packages/theme-satin/package.json
COPY packages/tokens/package.json ./packages/tokens/package.json
COPY packages/sdk-docs/package.json ./packages/sdk-docs/package.json
RUN pnpm install --frozen-lockfile --filter "@merfy/storefront-builder..."
COPY packages/stand-check ./packages/stand-check
COPY packages/storefront-build ./packages/storefront-build
COPY packages/storefront-storage ./packages/storefront-storage
COPY packages/storefront-shell ./packages/storefront-shell
COPY packages/storefront-sections ./packages/storefront-sections
COPY packages/storefront-config ./packages/storefront-config
COPY packages/tokens ./packages/tokens
# Реестр библиотеки шрифтов (блок 12): storefront-build читает его при старте (src/fonts.ts) и берёт в отпечаток
# платформы (src/render-files.ts). Остальной theme-contract проверяющему не нужен.
COPY packages/theme-contract/fonts ./packages/theme-contract/fonts
COPY packages/storefront-builder ./packages/storefront-builder
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
WORKDIR /app/packages/storefront-builder
CMD ["node_modules/.bin/tsx", "src/checker/main.ts"]

# Последняя стадия — образ sites как прежде: без цели сборки Coolify собирает её.
FROM runtime
