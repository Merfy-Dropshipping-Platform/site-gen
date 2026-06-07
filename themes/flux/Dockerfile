# ---- Базовый образ ----
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./

ARG NODE_AUTH_TOKEN
ENV NODE_AUTH_TOKEN=$NODE_AUTH_TOKEN

RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .

ENV NODE_ENV=production
RUN pnpm build

FROM base AS runner
WORKDIR /app

COPY --from=builder /app/dist ./dist

RUN npm install -g serve

EXPOSE 4321

CMD ["serve", "-s", "dist", "-l", "4321"]