# ========================
# Stage 1: Build
# ========================
FROM node:24-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@10.14.0

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ========================
# Stage 2: Production
# ========================
FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache curl
RUN npm install -g pnpm@8

COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3114

ENV NODE_ENV=production
ENV PORT=3114

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3114}/health || exit 1

CMD ["node", "dist/main.js"]
