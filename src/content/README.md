# Контент магазина: порт `StoreContent`

Здесь живёт единственный путь к ревизии магазина: содержимое — `load`/`save`, метаданные и версии —
`history`/`get`/`rollback` (плюс удобные обёртки `createRevision`, `buildInitialRevision` — сахар над
`save`/канон темы, не части интерфейса порта). Мимо порта содержимое не читают и не пишут: за этим
следит один сторож `__tests__/revision-table-only-in-content.spec.ts` — любое упоминание
`schema.siteRevision` в `src/` вне модуля (кроме тестов) красное, кроме именованных исключений с
причиной прямо в файле сторожа (второй круг, R1: список сведён почти к пустому).
`sites.service.ts` держит только тонкие обёртки (сайт по tenantId ищет он сам — порт своего `SELECT`
по `schema.site` не делает, см. ниже), реализация — здесь. Замысел этапа 2 — план
`merfy-mcp/docs/plans/2026-09-24-stage2-safe-write.md`, R1–R3 (перенос читателей, один конвейер
записи, история/разница/откат с базой) — `merfy-mcp/docs/plans/2026-09-30-revisions-clean.md`,
грамматика адресов и операции — в `operations/README.md`.

## Карта модулей

| Файл | За что отвечает | Кто зовёт |
|---|---|---|
| `store-content.port.ts` | контракт порта: `load`/`save`/`history`/`get`/`rollback`/`diff`, формы записи `SaveParams` (`"on-base"` / `"blind"`), `SitePatch` (В4), результат, ошибки `RevisionConflictError` и `RevisionMergeConflictError` | все ниже, `sites.service`, `pages.service`, RPC-контроллер, команды `store/` |
| `store-content.service.ts` | Nest-провайдер: диспетчер по `site.content_model` (сегодня только `document`) + `createRevision`/`buildInitialRevision` (не диспетчеризуются — общие для всех моделей) | `sites.service`, `pages.service`, `build.service`, `preview.controller`, команды `store/theme-switch`, `store/lifecycle` |
| `document.adapter.ts` | адаптер модели `document`: шаги чтения (миграции, досев, адреса), `history`/`get`/`rollback`, единая функция фиксации `commit()` (вставка + сдвиг указателя + `sitePatch`, одна транзакция — что раньше было «записью от базы» и отдельно «вслепую» с дублированным SQL) | `store-content.service` |
| `canon.ts` | канон темы — стартовый документ без базы данных (PageResolver для тем с полным манифестом, иначе легаси JSON из `generator/templates/defaults`) | `store-content.service.buildInitialRevision` |
| `save-on-base.ts` | алгоритм записи от базы без SQL: CAS, слияние, снимок клиента, метки `meta`; хранилище (`RevisionStore.commit`) даёт адаптер | `document.adapter` |
| `write-model.ts` | что записи нужно знать о документе: приведение к одной версии формата, фильтр досеянного, «что не правка» | `document.adapter` (строит), `save-on-base` (пользуется) |
| `change-kinds.ts` | правила «не правка»: автозначения панели конструктора, копии шапки и подвала на внутренних страницах | `write-model` |
| `panel-defaults.ts` | значения по умолчанию панели из того же puck-config, что получает конструктор | `document.adapter`, дымовая проверка `scripts/smoke-panel-defaults.mjs` |
| `rewrite-current.ts` | повтор «прочитал → посчитал → записал» при споре о том же месте | `pages.service`, `sites.service.resetContentPages` |
| `revision-kinds.ts` | условие «ревизия — версия магазина, а не снимок клиента»: `coalesce(kind, meta->>'kind', '') <> 'client-snapshot'` — колонка в приоритете, `meta->>'kind'` только запасной путь на переходный период выкатки миграции 0020 (второй круг, R1) | `document.adapter.history`/`historyCounts` (было — `sites.service.listRevisions` до R1), `admin/bulk` (через `historyCounts`) |
| `operations/` | движок: `diff`, `apply`, `merge3`, адреса; чистые функции без базы | `save-on-base`, `change-kinds`, `write-model` |

## Инварианты этапа 2

- **И1.** Строку ревизии на месте не правит никто. Любое изменение контента — новая ревизия через `save`.
- **И2.** Запись несёт базу, то есть ревизию, которую видел пишущий. Правки в разных местах сливаются.
  Если пишущий и другая вкладка поменяли одно и то же поле, результат зависит от политики писателя
  (таблица ниже). Чужая правка молча не пропадает.
- **И3.** Конструктор не замерзает: после любого ответа очередь сохранений продолжает работать. Это
  часть 2.4 в конструкторе, порт отдаёт ему `merged`, `overwritten` и коды ошибок.
- **И4.** Устаревшая вкладка не откатывает чужую правку ни первым сохранением, ни следующими. После
  слияния документ клиента хранится снимком (`meta.kind = 'client-snapshot'`), и следующее сохранение
  идёт уже от него.
- **И5.** У ревизии записано, кто её сделал (`actor`), откуда пришла правка (`source`), от какой
  ревизии (`base`) и что поменялось (`changes`).
- **И6.** Откат создаёт новую ревизию: побайтовую копию выбранной версии со сверкой текущей и
  пометкой `restoredFrom`.
- **И7.** Если писатель один, всё работает как раньше: золотые документы и снимки секций не меняются.

## История, разница, откат (R3)

- **`history(siteId, {site, limit?, before?})`** — новые версии сверху (`ORDER BY created_at DESC`),
  постранично: `before` — курсор («строго раньше этой даты»), `nextBefore` в ответе — дата самой старой
  строки страницы, когда строк ровно `limit` (может быть, есть ещё); меньше `limit` или пусто —
  `nextBefore: null` (это была последняя страница). Каждый `HistoryItem` несёт И5 из `meta`:
  `actor`/`source`/`changes`/`restoredFrom` (не записано — `null`, не ошибка). Снимки клиента — не
  версии магазина, в списке их нет (`isStoreVersion()`, колонка `kind`). RPC `sites.revisions.list`
  расширен совместимо: `before` на входе, `nextBefore` + новые поля `HistoryItem` на выходе; старые
  поля не переименованы и не удалены.
- **`diff(siteId, from, to, {site})`** — список операций движка (`operations/diff`) между двумя
  версиями: оба документа читаются тем же путём, что `load` (миграции, досев, адреса — «одна версия
  формата», как у слияния), затем чистый `diff(a, b)`. Новый RPC `sites.revisions.diff` (вход
  `{tenantId, siteId, from, to}`, ответ `{success, ops}`).
- **`rollback`** уже принимает базу (`RollbackParams.base`) — не менялось в R3, шлюз передаёт её с
  этапа 2 (`expectedCurrentRevisionId` на проводе, см. `sites.microservice.controller.ts`).
- **Миграция `drizzle/0020_revision_kind_and_history_index.sql`** (только добавляет): колонка
  `site_revision.kind text` (backfill из `meta->>'kind'` для существующих строк, где он есть) + индекс
  `idx_site_revision_site_id_created_at (site_id, created_at DESC)` — без него история — полный
  просмотр таблицы. `DocumentAdapter.commit()` пишет `kind` из `meta.kind` при каждой вставке —
  совместимость (`meta.kind` продолжает писаться) на время выкатки.

## Писатели и политика при устаревшей базе

| Писатель | Форма | При устаревшей базе |
|---|---|---|
| конструктор (`sites.revisions.create`) | `on-base` | слить, `last-writer-wins`; чужое — в `overwritten` |
| страницы кабинета (`pages.service`) | `on-base` | слить, `reject-conflicts`; спор — пересчитать правку (`rewriteCurrent`) |
| сброс контент-страниц (`resetContentPages`) | `on-base` | так же, как страницы кабинета |
| откат (`rollback`) | `on-base` | `refuse`: не сливать, `RevisionConflictError` (409) |
| создание магазина, сид саги рождения (`store/lifecycle`) | `blind` | не проверяется; с `expectedVersion` — жёсткий CAS |
| смена темы (`store/theme-switch/SetThemeCommand`) | `blind` | жёсткий CAS по прочитанной версии; `sitePatch` (`themeId`/`themeAppliedAt`/`updatedBy`) едет в ТОЙ ЖЕ транзакции, что ревизия (R2, В4) |

Повторы: гонку CAS (кто-то записал между чтением и записью) отрабатывает сам порт, до
`CAS_ATTEMPTS` раз. `rewriteCurrent` повторяет правку только при `RevisionMergeConflictError`,
иначе попытки перемножались бы.

## Долг

- ~~`saveWithoutBase` в адаптере — второй путь записи рядом с `saveOnBase`~~ — снято R2
  (`merfy-mcp/docs/plans/2026-09-30-revisions-clean.md`): обе формы (`on-base`/`blind`) сходятся в
  ОДНУ функцию фиксации, `DocumentAdapter.commit()` — она одна решает, двигать ли указатель, проверять
  ли CAS и патчить ли `site` заодно (`sitePatch`). `saveWithoutBase` осталась как имя метода (перевод
  `BlindSaveParams` → аргументы `commit()`), но SQL под ней теперь общий с записью от базы.
- ~~Ревизия и `site.themeId` двумя транзакциями (В4)~~ — снято R2: `SetTheme` передаёт `sitePatch` в
  `content.save({mode: "blind", ...})`, `commit()` пишет ревизию, сдвигает указатель и патчит `site`
  одной транзакцией. Сбой между вставкой и патчем — ничего не записано (тест-саботаж:
  `document.adapter.spec.ts` → «sitePatch: сбой ПОСЛЕ вставки ревизии…»).
- ~~Колонка `kind` у `site_revision` вместо `meta->>'kind'`~~ — снято R3 (миграция 0020, см. выше).
  `meta.kind` продолжает писаться (совместимость на время выкатки) — убрать дубль отдельной задачей,
  когда прод перейдёт на колонку везде, где ещё смотрит в `meta`.
- **Запасной `meta->>'kind'` в `isStoreVersion()`** (второй круг, R1): пока старый (до-0020) контейнер
  ещё может стоять рядом с новым во время выкатки (rolling deploy), он пишет `meta.kind =
  'client-snapshot'`, но колонку `kind` не знает — она осталась бы `NULL`, и новый код без запасного
  пути посчитал бы такую строку версией магазина. `revision-kinds.ts` поэтому читает
  `coalesce(kind, meta->>'kind', '')`, не голую колонку. Через релиз (когда старый контейнер больше не
  запускается) — убрать запасной `meta->>'kind'` и вернуться к голой колонке `kind`.
- **Источник значений по умолчанию панели** (`panel-defaults.ts`) создаёт HTTP-контроллер
  `ThemePuckConfigController`, так что слой контента зависит от контроллера. Чтобы это исправить,
  нужно вынести сборку puck-config с кэшем в провайдер уровня `themes/`, а это правка старого
  контроллера, которую этап 2 не трогал. Делается отдельной задачей.
- **Шаги чтения** (`migrate`, `normalize`, `seed`, `resolve`) лежат внутри `document.adapter.ts`
  с волны 1. Выносить их в свой файл — тоже отдельная задача.
