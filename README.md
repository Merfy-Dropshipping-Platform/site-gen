# Sites Service

Микросервис сайтов Merfy. Слушает очередь `sites_queue`, предоставляет RPC для CRUD сайтов,
доменов и публикации. Включает встроенный генератор статики (Astro) и интеграцию с Coolify для деплоя.

## Архитектура

```
Sites Service (3114)
├── SitesDomainService     — CRUD, freeze/unfreeze, publish
├── CoolifyProvider        — HTTP клиент к Coolify API
├── GeneratorService       — Генерация статики (Astro)
├── S3StorageService       — MinIO/S3 хранилище
├── BillingClient/Listener — Интеграция с биллингом
└── HealthController       — Health checks
```

**Подробнее:** см. [SITES-ARCHITECTURE.md](../docs/SITES-ARCHITECTURE.md)

## Требования

- Node.js 24+
- pnpm 10
- RabbitMQ
- PostgreSQL
- MinIO (опционально, для статики)
- Coolify (для деплоя)

## Быстрый старт

1) Установить зависимости
```bash
pnpm install
```

2) Скопировать `.env.example` в `.env` и настроить:
```env
# Database
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/sites_service

# RabbitMQ
RABBITMQ_URL=amqp://rabbitmq:password@localhost:5672

# Coolify (Production)
COOLIFY_API_URL=http://176.57.218.121:8000
COOLIFY_API_TOKEN=2|...
COOLIFY_SERVER_UUID=oo0kocc8ks0wccgc88kocwss
COOLIFY_PROJECT_UUID=cck0k8sscwos8sgs408kgok8

# S3/MinIO
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=merfy-sites
```

3) Запустить сервис
```bash
pnpm run start:dev
```

## Health Checks

- `GET /health` — liveness probe
- `GET /health/ready` — readiness probe (PostgreSQL, RabbitMQ, MinIO, Coolify)
- `GET /sites/:siteId/health` — health check конкретного сайта

## Очереди и контракты
- RMQ: `sites_queue` (единая очередь)
- Базовые RPC (черновые/частично реализованы):
  - `sites.create_site { tenantId, actorUserId, name, slug? } -> { success, siteId }`
  - `sites.get_site { tenantId, siteId } -> { success, site }`
  - `sites.list { tenantId, cursor?, limit? } -> { success, items, nextCursor? }`
  - `sites.update_site { tenantId, siteId, patch } -> { success }`
  - `sites.delete_site { tenantId, siteId, hard? } -> { success }`
  - `sites.attach_domain { tenantId, actorUserId, siteId, domain } -> { success }`
  - `sites.verify_domain { tenantId, siteId } -> { success }`
  - `sites.publish { tenantId, siteId, mode? } -> { success, url, buildId?, artifactUrl? }`
  - `sites.build { tenantId, siteId, mode? } -> { success, buildId, artifactUrl? }` (используется модулем генератора)

### Как работает верификация домена и SSL
- `sites.attach_domain` возвращает DNS‑челендж (TXT), например:
  - name: `_merfy-verify.example.com`
  - value: `<verification_token>`
- Создайте TXT‑запись у своего регистратора, подождите применения (обычно до 10 минут).
- Вызовите `sites.verify_domain { tenantId, siteId, domain, token }` — статус домена станет `verified`.
- Провайдер деплоя (Coolify) проконфигурирует домен и запустит выпуск SSL (Let’s Encrypt). Режим управляется переменными окружения:
  - `COOLIFY_MODE=mock` — без HTTP‑вызовов, мгновенная симуляция.
  - `COOLIFY_MODE=http` + `COOLIFY_API_URL` + `COOLIFY_API_TOKEN` — реальные HTTP‑вызовы к Coolify API.

Полный список — см. `docs/sites-diagrams.md` и `docs/sites-implementation-checklist.md`.

## Команды
- `pnpm run start:dev` — запуск NestJS в watch-режиме
- `pnpm run build` — сборка в `dist/`
- `pnpm run lint:check` — ESLint
- `pnpm run db:migrate` — миграции Drizzle (после добавления схем)
