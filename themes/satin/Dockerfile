# ---- Базовый образ ----
FROM node:22-alpine AS base
# Совместимость glibc-сборок нативных модулей (sharp и др.) под musl Alpine
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./

# Coolify: Build Secret NODE_AUTH_TOKEN (классический PAT read:packages) или NPM_TOKEN —
# подстановка ниже чтобы не промахнуться именем переменной.
ARG NODE_AUTH_TOKEN
ARG NPM_TOKEN
RUN export NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-$NPM_TOKEN}" \
 && pnpm install --no-frozen-lockfile

FROM deps AS builder
COPY . .

ENV NODE_ENV=production
RUN pnpm build

FROM base AS runner
WORKDIR /app

COPY --from=builder /app/dist ./dist

RUN npm install -g serve

EXPOSE 4321

# БЕЗ флага -s: Astro собирает статический multi-page сайт (dist/<route>/index.html).
# `serve -s` разворачивал любой 404 в /index.html → 1) прямой заход на /catalog отдавал главную,
# 2) промахи на /icons/*.svg отдавали HTML вместо SVG ("битые" иконки).
CMD ["serve", "dist", "-l", "4321", "--no-clipboard"]
