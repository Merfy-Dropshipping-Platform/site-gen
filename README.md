# Sites Service

Микросервис сайтов Merfy. Слушает одну очередь `sites_queue`, предоставляет RPC для CRUD сайтов, доменов и публикации. Внутри сервиса встроен модуль генератора (build) — отдельного `site-gen` процесса нет. HTTP-эндпоинт `/health` для проверки.

## Требования
- Node.js 24+
- pnpm 10
- RabbitMQ

## Быстрый старт

1) Установить зависимости
```bash
pnpm install
```

2) Настроить окружение `.env.local`
```dotenv
NODE_ENV=development
PORT=3020
RABBITMQ_URL=amqp://rabbitmq:password@localhost:5672
```

3) Запустить сервис
```bash
pnpm run start:dev
```

Примечание: хранение артефактов публикации на этапе разработки локально (без Minio). Для прод/интеграции используйте конфигурацию Minio/S3 из product‑сервиса.

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
