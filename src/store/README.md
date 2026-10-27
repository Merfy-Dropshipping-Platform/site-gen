# src/store — магазин одной командой (этап 3)

Замысел, решения и открытые вопросы: `merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md`.

## Карта модулей

| Файл | За что отвечает | Кто зовёт |
|---|---|---|
| `store-commands.controller.ts` | RPC `sites.cmd.create_store`, `sites.cmd.set_theme`, `sites.query.store_status` | шлюз (с куска 3.5), агент |
| `commands/create-store.command.ts` | `CreateStore`: проверка входа, тема по каталогу, лимит тарифа, вставка строки, сид | контроллер, `user.listener` (регистрация), `site-provisioning.scheduler` (cron «без магазина») |
| `commands/command-result.ts` | форма ответа: эффект или отказ с `code` | обе команды, контроллер |
| `store-registry.ts` | подсчёт магазинов, слаг и вставка строки под блокировкой тенанта | `CreateStore` |
| `store-slug.ts` | слаг из имени: транслит кириллицы, `[a-z0-9-]`, не длиннее 60 | `CreateStore` |
| `store-view.ts` | вид магазина в ответах, вместе с состоянием рождения | команды, `store_status` |
| `theme-catalog.ts` | каталог тем и `DEFAULT_THEME_ID` | команды, `ThemesService` (`themes.list`) |
| `lifecycle/store-lifecycle.ts` | сага данными: состояния, шаги, паузы повторов, `LEASE_MS` | доводчик, схема БД (тип состояния) |
| `lifecycle/store-lifecycle.reconciler.ts` | доводчик: захват строки, шаг за шагом до `ready` или провала | `CreateStore`, тик |
| `lifecycle/store-lifecycle.scheduler.ts` | тик раз в 30 с по строкам, которым пора | cron Nest |
| `lifecycle/lifecycle.repository.ts` | чтение и запись состояния, захват с арендой | доводчик, `store_status` |
| `lifecycle/lifecycle.steps.ts` | шаги `seed`, `provision`, `route` | доводчик |
| `theme-switch/set-theme.command.ts` | `SetTheme`: чтение документа, план, запись с CAS, тема в строке, переиздание | контроллер |
| `theme-switch/theme-switch.plan.ts` | чистая функция: новый документ и отчёт о смене темы | `SetTheme` |
| `theme-switch/canon-reference.ts` | канон прежней темы в том виде, в каком его отдаёт порт, — эталон для «что потеряно» | `SetTheme` |
| `skeleton/place-skeleton.command.ts` | `PlaceSkeleton`: заготовка магазина новой темы — секции библиотеки в магазин, «О нас», секции в пустые списки одной записью ревизии; сводка | контроллер (`sites.cmd.place_skeleton`), `CreateStore` (nova) |
| `skeleton/skeleton.plan.ts` | чистая функция: документ → документ с заготовкой и отчёт (заполнено, не тронуто, ждёт, нет страницы) | `PlaceSkeleton` |
| `skeleton/skeleton-layout.ts` | раскладка заготовки (перенесена из merfy-mcp `knowledge/starter/layout.json`) | `PlaceSkeleton` |
| `skeleton/skeleton-library.ts` | наша библиотека секций с диска: `packages/storefront-sections/fixtures/shop`, `packages/storefront-shell/sections` | `PlaceSkeleton` |
| `skeleton/skeleton-sections.ts` | порты: свои секции магазина (реестр `storefront_section`, сохранение через сборщик витрин) и блокировка магазина | `PlaceSkeleton` |
| `shared/*` | фоновая работа, текст ошибки, разбор ошибок zod | команды, доводчик |
| `store.providers.ts` | список провайдеров и контроллеров для `AppModule` | `AppModule`, `store-module-wiring.spec.ts` |

## Рождение магазина: регистрация или кабинет → `ready`

1. Вход (регистрация, кабинет, cron «без магазина», позже агент) зовёт `CreateStore`.
2. Команда проверяет тему по каталогу и один раз спрашивает биллинг.
3. Под блокировкой тенанта: лимит, слаг, вставка строки с `lifecycle = 'reserved'`. Строка сразу в аренде у команды, и тик её не берёт.
4. Команда сама ведёт строку (`driveHeld`). Сид стартовой ревизии выбранной темы идёт синхронно, ответ всегда уходит с ревизией.
5. Дальше `provision` (поддомен REG.RU и проект Coolify) и `route` (маршрут хостинга). При `wait:true` команда ждёт их, иначе они идут фоном.
6. Упал шаг: `failed` с причиной, пауза по таблице, повтор делает тик. Следующий шаг берётся из фактов строки, а не из записанного состояния.

## Смена темы: `SetTheme` → отчёт

Команда проверяет тему по каталогу и читает документ через порт `StoreContent`. `planThemeSwitch` берёт канон новой темы и переносит в него свои страницы и меню мерчанта. Документ пишется с CAS. Только после записи в строке магазина меняется `themeId`, потом опубликованный магазин переиздаётся. В ответе отчёт: что перенесено, переименовано, приведено к полной форме, пересеяно, убрано и потеряно.

## Заготовка магазина новой темы: `PlaceSkeleton`

Решение 7 спеки MCP «Секции и SDK» (`merfy-mcp/docs/plans/mcp-sections/2026-10-26-mcp-sections-design.md`): заготовку
нового магазина ставит платформа одной командой. RPC `sites.cmd.place_skeleton { tenantId, siteId, actorUserId? }`,
шлюз — `POST /api/sites/:id/commands/skeleton`.

1. Только магазин новой темы (`not_new_theme`) с ревизией (`no_revision`); под блокировкой магазина
   (`skeleton_in_progress`, если заготовка уже идёт).
2. Недостающие секции библиотеки — своими секциями магазина через сборщик витрин (`POST /sections/save?shop=`, без шлюза
   и его лимита): сборка шаблона и пробные рендеры идут в песочнице сборщика, в образе sites её нет. Секция с тем же
   именем уже есть — не трогаем; роль занята другой секцией — пропуск с причиной.
3. «О нас» (если её нет) и секции в ПУСТЫЕ списки по раскладке — одной записью ревизии от прочитанной базы со сведением
   `last-writer-wins`, как запись конструктора у nova. Список, для которого секций в магазине нет, ждёт повтора.

Повтор ничего не меняет. `CreateStore` с новой темой зовёт заготовку сам сразу после сида, разом с поддоменом и
маршрутом; в ответе `skeleton: done | started | failed`.

## Граница со старым кодом

- Старые магазины (`lifecycle IS NULL`) ведут старые cron, reaper и `clearMockCache`. Доводчик берёт только строки с непустым `lifecycle`, так что строки у них не пересекаются.
- В `sites.service.ts` остаются старые пути, помеченные `@deprecated`: `reserve()`, `create()` (RPC `sites.create_site`), `triggerAsyncProvisioning`, а также смена темы в `update()` (`shouldReseedOnThemeSwitch`, `carryOverUserPages`, `carryOverMenuLinks`). Шаги саги пока зовут оттуда `finishProvisioning`, `ensureSiteHosting` и `buildInitialRevision`.
- Шлюз переходит на команды в куске 3.5. Старые пути удаляются в уборке 3.9, только после «ок» владельца.
