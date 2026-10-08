# @merfy/storefront-builder

Сборщик витрин магазинов новой темы (блок 6 этапа «Каркас витрины», design.md в
`merfy-mcp/docs/plans/storefront-shell/06-builder-queue/`). Вторая программа из образа site-gen: своя команда запуска,
без миграций и API sites.

## Как работает

1. Событие «в магазине что-то поменялось» приходит в очередь `storefront_builder_events`: из site-gen через точку
   обмена `content.events`, о товарах — из готовой `product.events`.
2. Строка магазина в `storefront_shop` (база sites) меняется одним условным `UPDATE … RETURNING`: магазин свободен —
   задание уходит в очередь `storefront_builds` (приоритет: публикация 3, правка 2, выпуск темы 1); сборка ещё в
   очереди — событие вливается в неё; сборка идёт — «ещё раз» (`pending`), после неё ровно одно следующее задание.
3. Сборка: снимок входов (база sites, товары по RPC `product.list`), ключ блока 4 — совпал с живым, сборки нет;
   иначе сборка, выкладка и переключение указателя блока 5.
4. Упала — повтор через 5 с, потом через 30 с; третий сбой — «остановлено», строка `ALERT` в журнале и запись
   `site.build_stopped` (critical) в журнал действий платформы. Живая витрина не меняется.
5. `/draw` — дорисовка страницы для раздачи (блок 5): свои места и тайм-аут, мимо очереди сборок.
6. Раз в час сверка: опубликованные магазины, у которых живая сборка не та, что дал бы ключ сейчас, получают событие
   `reconcile`.

## Команды (из `packages/storefront-builder`)

| Команда | Что делает |
| --- | --- |
| `pnpm test` / `pnpm test:coverage` | быстрые тесты без сети |
| `pnpm stack:up` → `pnpm test:stack` | стенд Docker `storefront-builder-test` и тесты на нём (покрытие всего `src/`) |
| `pnpm stack:stop` | остановить стенд |
| `pnpm renderer` | серверная сборка рисовальщика тем новой архитектуры |
| `pnpm start` | сборщик (нужны переменные ниже) |
| `pnpm probe` | проба целиком на стенде: публикация, правки, сто правок подряд, дорисовка, p95, остановка |
| `pnpm shop show --site <id>` | строка магазина и последние 5 сборок |
| `pnpm shop restart --site <id>` | перезапуск остановленного магазина |

## Переменные окружения

Обязательные: `DATABASE_URL` (база sites), `RABBITMQ_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`, `STOREFRONT_API_URL`, `SOURCE_COMMIT` (40 знаков; Coolify задаёт сам).
По умолчанию: `PORT=8080`, `BUILD_SLOTS=1`, `DRAW_SLOTS=1`, `DRAW_TIMEOUT_MS=3000`, `BUILD_LEASE_MS=300000`,
`RECONCILE_MS=3600000`, `PRODUCT_TIMEOUT_MS=10000`, `STOREFRONT_INDEXABLE=false`.

## Журнал и p95

Одна строка JSON на событие: `event-accepted`, `job-queued`, `build-start`, `step` (`buildId`, `shopId`, `step`, `ms`,
`queueWaitMs`), `build-finish`, `build-retry`, `ALERT`. Каждая сборка — строка в `storefront_build`.

p95 «правка → витрина» за сутки:

```sql
SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - event_at) * 1000))::int AS p95_ms
FROM storefront_build WHERE outcome = 'live' AND finished_at > now() - interval '1 day';
```
