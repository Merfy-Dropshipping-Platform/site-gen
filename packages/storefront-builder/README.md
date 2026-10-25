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
   Выпуск темы (`theme-release`) встаёт ждать места (`held`): в работе не больше `RELEASE_SLOTS` заданий выпуска, и
   публикации с правками всегда остаётся место; место выпуска освобождает конец сборки.
   Публикация из site-gen приходит с адресом ответа (прямой ответ RabbitMQ): сборщик отвечает `{ v: 1, build }` —
   номером сборки, в которую она вошла; если сборка уже идёт, номер следующей берётся из резерва `next_build`.
3. Сборка: снимок входов (база sites, товары по RPC `product.list`), ключ блока 4 — совпал с живым, сборки нет;
   иначе сборка, выкладка и переключение указателя блока 5.
4. Упала — повтор через 5 с, потом через 30 с; третий сбой — «остановлено», строка `ALERT` в журнале и запись
   `site.build_stopped` (critical) в журнал действий платформы. Живая витрина не меняется.
5. `/draw` — дорисовка страницы для раздачи (блок 5): свои места и тайм-аут, мимо очереди сборок.
6. Раз в час сверка: опубликованные магазины, у которых живая сборка не та, что дал бы ключ сейчас, получают событие
   `reconcile`.
7. Остановка по SIGTERM (Coolify — `docker stop -t 30`): новых событий и заданий не берёт, идущие сборки ждёт не
   дольше `BUILD_DRAIN_MS`. Не дождался — строка сборки `interrupted`, замок магазина снят, задание с новым номером
   и событиями «ещё раз» берёт ближайший обход любого сборщика (второго контейнера при выкатке или следующего запуска)
   — сразу, а не через срок замка; процесс выходит.
8. Превью конструктора (блок 8): `GET /preview?shop=<id>` — стенд темы (`/theme-stand` рисовальщика) в `mode: preview`
   с правками текущей ревизии (ключи `tokens` и `settings`), одним HTML: CSS темы и шрифты woff2 внутри страницы;
   `POST /preview/tokens?shop=<id>` с `{ tokens }` — `{ css, attributes }` для слушателя превью, неподходящие правки —
   400 `{ problems }`; `GET /theme-panel?theme=<id>` — ответ puck-config новой темы: секций нет, `themePanel` — схема
   панели и токены темы. Данные — заново на каждый запрос, ответы `no-store`. Их зовёт sites (`STOREFRONT_BUILDER_URL`).
   Правки токенов текущей ревизии идут и во входы живой сборки (`revision.tokens` блока 4); настройки — нет.

## Команды (из `packages/storefront-builder`)

| Команда                                                                                      | Что делает                                                                                |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm test` / `pnpm test:coverage`                                                           | быстрые тесты без сети                                                                    |
| `pnpm stack:up` → `pnpm test:stack`                                                          | стенд Docker `storefront-builder-test` и тесты на нём (покрытие всего `src/`)             |
| `pnpm stack:stop`                                                                            | остановить стенд                                                                          |
| `COMPOSE_PROJECT_NAME=<имя> STACK_PG_PORT=… STACK_AMQP_PORT=… STACK_S3_PORT=… pnpm stack:up` | второй стенд рядом: своё имя и порты; те же переменные — у `pnpm test:stack`              |
| `pnpm renderer`                                                                              | серверная сборка рисовальщика тем новой архитектуры                                       |
| `pnpm start`                                                                                 | сборщик (нужны переменные ниже)                                                           |
| `pnpm probe`                                                                                 | проба целиком на стенде: публикация, правки, сто правок подряд, дорисовка, p95, остановка |
| `pnpm shop show --site <id>`                                                                 | строка магазина и последние 5 сборок                                                      |
| `pnpm shop restart --site <id>`                                                              | перезапуск остановленного магазина                                                        |

## Переменные окружения

Обязательные: `DATABASE_URL` (база sites), `RABBITMQ_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`, `STOREFRONT_API_URL`, `ANALYTICS_COLLECTOR_URL` (адрес сборщика аналитики для конфига витрины, блок 11:
`https://analytics.dev.merfy.ru` на dev; запасного адреса нет — без переменной сборщик не стартует), `SOURCE_COMMIT`
(40 знаков; Coolify задаёт сам). Счётчики мерчанта сборщик берёт у сборщика аналитики RPC `analytics.pixels.list`
(`ANALYTICS_TIMEOUT_MS=5000`); не ответил — снимок «не получен», как с товарами.
По умолчанию: `PORT=8080`, `BUILD_SLOTS=1`, `DRAW_SLOTS=1`, `DRAW_TIMEOUT_MS=3000`, `BUILD_LEASE_MS=300000`,
`RECONCILE_MS=3600000`, `PRODUCT_TIMEOUT_MS=10000`, `STOREFRONT_INDEXABLE=false`,
`INDEXNOW_URL=https://yandex.com/indexnow`, `BUILD_DRAIN_MS=20000` (не больше 25000: через 30 с Coolify шлёт SIGKILL).
`RELEASE_SLOTS` — предел выпуска K: по умолчанию на одно меньше `BUILD_SLOTS`, но не меньше 1; больше — ошибка
запуска. При одном месте (dev) K = 1: публикация ждёт не дольше одной сборки выпуска — той, что уже идёт.
`INDEXNOW_KEY` — ключ IndexNow, тот же, что у раздачи (блок 5); нет ключа — уведомлений нет.
`STOREFRONT_STAND_PAGE=true` — в сборку магазина новой темы идёт страница стенда `/theme-stand` из опубликованной
ревизии: по ней инструмент стенда снимает эталон dev по адресу магазина (`STAND_DEV_URL`). По умолчанию `false`; только
на контуре не для поиска — вместе с `STOREFRONT_INDEXABLE=true` сборщик не стартует. Страница появляется со следующей
сборкой магазина.

## Код секций (блок 7)

- Секций платформы и тем нет (блок 1 «Секций и SDK», пп. 1, 2): при старте сборщик в реестр `storefront_section`
  ничего не сохраняет. Наши секции магазин сохраняет как свои — `pnpm sections accept <папка> --shop <id>` в
  `@merfy/storefront-sections`. Нет сборки ядра — сборщик не стартует (`shell-missing`; сборка —
  `pnpm --filter @merfy/shell build`).
- Снимок: включённые расширения — RPC `extensions.enabledForShop` в `extensions_queue` (тайм-аут — `PRODUCT_TIMEOUT_MS`);
  места секций — ключ `sections` текущей ревизии (`{ "<id страницы>": ["<имя секции>", …] }`); секции — видимые
  магазину строки реестра. Расширения не ответили (`extensions-failed`) или места не той формы (`sections-invalid`) —
  снимок не получен, сборки нет.
- Публикация (`merchant-publish`) до сборки выносит на витрину текущие правки своих секций магазина
  (`sections-published`).
- В сборку идут HTML страниц и файлы бандлов страниц (`_merfy/b/<sha256>.js`); раздача отдаёт `_merfy/` с кэшем
  навсегда. Предупреждения бандла — строки журнала `section-script-skipped` и `page-script-heavy`.

### Код секций в превью (блок 5 «Секций и SDK», часть 5г)

- `GET /preview` — после двух скриптов превью JSON-тег бандла превью и `dist/preview.js` (`previewTags`,
  `src/preview-code.ts`); байты кода — из снимка магазина (`assets`), как у сборки.
- `POST /preview/section` — `{ html, css, script }`: `script` — `{ hash, code, uses }` (hash — 64 знака hex) или
  `null`; у секции с кодом в HTML — тег входных данных, в CSS — классы её скрипта (`script_meta.classes`).
- `GET /sections` — `scriptHash` у секции с кодом: конструктор перечитывает список при возврате на вкладку и шлёт
  `update-block` экземплярам секции с другим хешем.

## Выпуск волнами (блок 10)

- Ведущий волн живёт в сборщике (`src/release/conductor.ts`), состояние — в таблицах `storefront_release` и
  `storefront_release_shop` базы sites. Просыпается от `NOTIFY storefront_release` (команда выпуска), конца сборки,
  ответа проверки и таймера выдержки; при старте сверяет активные выпуски (`resume`).
- Очереди: `storefront_checks` — задания проверки в браузере (их берёт проверяющий процесс), `storefront_check_results`
  — ответы ведущему.
- Переменные: `STOREFRONT_CONTOUR` (`dev` | `prod`, по умолчанию `dev`), `RELEASE_PAUSE_MS` (выдержка между волнами,
  по умолчанию 0; на проде — 3600000), `RELEASE_TEST_SHOP` (тестовый магазин выпусков платформы и расширений).
- Строки журнала: `release-shop-before`, `release-shop-building`, `release-shop-waits`, `release-shop-done`,
  `release-shop-skipped`, `release-shop-not-reached`, `release-wave`, `release-awaiting`, `release-finished`,
  `release-step-failed`, `release-listen-failed`. Автостоп — строка `ALERT` и запись `site.release_stopped` с
  `critical` в журнале платформы.
- Увидел `ALERT`: `pnpm theme-release status <№>` — что сломалось; дальше `pnpm theme-release revert-all <№>` (вернуть
  все обновлённые магазины) или исправление новым выпуском; магазин, который ждёт сбой данных, снимает
  `pnpm theme-release skip <№> <магазин>`.
- Штатная остановка (SIGTERM): ведущий новых шагов не берёт, идущий доделывает не дольше `BUILD_DRAIN_MS` — вместе с
  идущими сборками.

## Проверяющий процесс (блок 10)

- Что делает: берёт задание из `storefront_checks` по одному, открывает главную магазина в Chromium, снимает паспорт
  (`@merfy/stand-check`), сравнивает с паспортом «до» по `packages/stand-check/release-rules.json` и отвечает в
  `storefront_check_results` ведущему волн. Страница не открылась — ошибка в ответе, а не падение процесса.
- Запуск: `pnpm --filter @merfy/storefront-builder checker`; в образе — цель Dockerfile `storefront-checker` (база —
  образ Playwright с Chromium), в Coolify — отдельное приложение с пределом памяти.
- Переменные: `RABBITMQ_URL` (обязательна; тот же брокер, что у сборщика), `PORT` (по умолчанию 8080, только `/health`).
- Правила: `release-rules.json` — для автостопа; красное там только поломка (новая ошибка в консоли, пропавший токен
  или шрифт), новый скрипт, другой цвет и новый запрос — жёлтое. `compare-rules.json` — правила стенда и отчёта
  человеку, строже; проверяющий процесс их не читает.
- Строки журнала: `checker-started` (порт, число правил), `check-done`, `check-failed`, `checker-stopped`.

## Команда выпуска (блок 10)

Запускает человек на своей машине: `pnpm --filter @merfy/storefront-builder theme-release <подкоманда>`.

- Подкоманды и флаги: `start <тема> [--test-shop <id>] [--version <x.y.z>] [--no-shots] [--expect-hash sha256:…]`,
  `approve <№>`, `status [<№>]`, `skip <№> <магазин>`, `revert-all <№>`.
- Переменные: `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL`,
  `STOREFRONT_CONTOUR`. Значения — из Coolify приложения сборщика своего контура; в README, журнал и чат их не писать.
- dev: `start nova --test-shop <id>` → прочитать отчёт → `approve <№>` или `revert-all <№>`.
- Прод: выкатка коммитов версии по правилу «на прод — только свои задачи», затем
  `start nova --test-shop <id> --expect-hash <отпечаток из отчёта dev>`.
- Отчёты — `packages/storefront-builder/releases/<контур>/`, их коммитит человек.
- Коды выхода: 0 — сделано; 1 — выпуск не стартовал, остановлен или на контуре уже идёт другой; 2 — команда не смогла.

## Выпуски платформы и расширений (блок 10)

- Выпуск платформы заводит сам сборщик при старте, если `renderHash` образа (в нём ядро и секции платформы) не тот, что
  у последнего выпуска платформы на контуре. «Да» не нужно: после тестового магазина волны идут сами. Магазин, которому
  новый код ничего не меняет, уходит из волны пропуском «сборка не изменилась».
- Выпуск расширения: `pnpm --filter @merfy/storefront-builder theme-release extension <расширение> <x.y.z>` — после
  регистрации версии в сервисе extensions.
- Откат платформы и расширения — указатель с паузой: закрепить их у магазина нельзя. Снять паузу —
  `pnpm --filter @merfy/storefront-storage pointer resume --label <метка>`.
- Сверка раз в час сравнивает ключ данных (`dataKey`): новый код платформы и новая версия расширения для неё не
  расхождение, включение и выключение расширения — расхождение.

## Ошибки секций (блок 11, часть 4)

Шлюз кладёт ошибки секций из браузеров в очередь `storefront_section_errors` (сообщение Nest:
`{ pattern: 'storefront.section-errors', data: { v: 1, shopId, receivedAt, errors } }`). Сборщик пишет их в
`storefront_section_error`: строка на магазин, секцию, отпечаток скрипта, стадию, текст и минуту приёма, повтор —
`count`. Автор, владелец и выпуск — из `storefront_section` по имени и отпечатку; незнакомый отпечаток и магазин без
строки `storefront_shop` не пишутся (`src/section-error-store.ts`). Строка журнала на пачку — `section-errors`
(`shopId`, `minute`, `written`, `skipped`).

Счёт для автостопа выпуска (блок 10) — `sectionErrorSummary(db, since)`: строка на выпуск секции — `shops` (магазинов) и
`errors` (ошибок) с минуты `since`.

## Каталог во входах (блок 8 «Секций и SDK», часть 8а-2)

- Товары (`product.list`) и коллекции (`product.collections.storefront`) — у сервиса product; во входы — только
  публичные поля (`src/catalog.ts`), цены в копейках. Не ответил любой из двух — снимок «не получен», сборки нет.
  Элемент не по форме — без него, строки журнала `product-invalid`, `collection-invalid`.
- Статьи — с SEO, обложкой и датой публикации, текст очищен (`cleanArticleHtml`); блоги — сущностью `blog`.

## Совпавшие адреса записей (блок 8 «Секций и SDK», часть 8б)

Строка журнала `route-duplicate` — `{ shopId, buildId, type, id, path, page }`: адрес по handle (`path`) занят другой
записью; `page` — адрес, который получила запись (по id), `null` — страницы у записи нет. Сборка идёт.

## Превью шаблонов и адрес нового товара (блок 8 «Секций и SDK», часть 8б-2)

- `GET /preview?shop&page=<product|collection|blog|article|policy>&record=<id или адрес>` — шаблон записи с этой
  записью; нет `record` — запись по умолчанию, записей вида нет — пример платформы. Тело превью одного блока —
  `{ instance, menus?, theme?, page?, record? }`.
- `product.created` с `handle` дописывает `/product/<адрес>` в список адресов магазина
  (`storefront/entities/<магазин>.json`), `product.deleted` убирает адрес и адрес по id: nginx раздачи сразу
  отправляет новый адрес на рендер по запросу. Сбой хранилища — строка журнала `entity-paths-failed`, событие принято.

## Поля с записями в секциях (блок 8 «Секций и SDK», часть 8г)

- Код магазина во входах сборки: у секции с полями с записями — `recordFields` и `data` из `section.json`
  (`sectionRecordKeys`).
- Превью одного блока: с `page` в теле или `uses` у секции поля с записями получают записи магазина, без них — `null`.
  `page` и `record` из адреса превью шлёт в теле скрипт превью — с части 8г-2.

## Журнал и p95

Одна строка JSON на событие: `event-accepted`, `job-queued`, `build-start`, `step` (`buildId`, `shopId`, `step`, `ms`,
`queueWaitMs`), `build-finish`, `build-retry`, `build-interrupted`, `ALERT`. Каждая сборка — строка в
`storefront_build`.

p95 «правка → витрина» за сутки:

```sql
SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - event_at) * 1000))::int AS p95_ms
FROM storefront_build WHERE outcome = 'live' AND finished_at > now() - interval '1 day';
```

## «Свой код» мерчанта (блок 13 «Секций и SDK», часть 13б)

`src/counters.ts`: «свой код» (`pixel_type: custom`) из того же `analytics.pixels.list` — сущности `custom-code`
`{ code, consent }` снимка: `none` — запускается сразу, иначе — после «Принять» в баннере cookie. Включённый и непустой,
до 64 КБ на магазин по порядку id; не влез — строка `custom-code-skipped` без кода. Пересборка — событие
`analytics-counters-change`.

## Список с параметрами (блок 11 «Секций и SDK», часть 11а-2)

- `GET /draw?…&list=<параметры>` — страница со списком с фильтрами, сортировкой, поиском или номером: товары страницы и
  значения фильтров — RPC `product.findAll` и `product.getFilters` (аргументы — как у шлюза), карточки — из записей
  сборки. Такая страница не пишется в список дорисовок и отдаётся без `X-Merfy-Hash`. Номер больше последнего — 404.
- `POST /preview/section` с `list` — блок со списком страницы превью и этими параметрами; без `list` — первая страница.
  `GET /preview?page=catalog` — каталог, и с пустым списком.
- В превью модуль «Каталог» шлёт `merfy:preview:list` (`@merfy/shell/preview`); скрипт секций превью запрашивает блок с
  `list`.
