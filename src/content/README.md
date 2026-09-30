# Контент магазина: порт `StoreContent`

Здесь живёт единственный путь к ревизии магазина: содержимое — `load`/`save`, метаданные и версии —
`history`/`get`/`envelope`/`rollback`/`diff` (плюс удобные обёртки `createRevision`,
`buildInitialRevision` — сахар над `save`/канон темы, не части интерфейса порта). Мимо порта
содержимое не читают и не пишут: за этим следит один сторож
`__tests__/revision-table-only-in-content.spec.ts` — любое упоминание `schema.siteRevision` в `src/`
вне модуля (кроме тестов) красное, кроме именованных исключений с причиной прямо в файле сторожа
(второй круг, R1: список сведён почти к пустому — см. «Долг» ниже).
`sites.service.ts` держит только тонкие обёртки (сайт по tenantId ищет он сам — порт своего `SELECT`
по `schema.site` не делает, см. ниже), реализация — здесь. Замысел этапа 2 — план
`merfy-mcp/docs/plans/2026-09-24-stage2-safe-write.md`, R1–R5 (перенос читателей, один конвейер
записи, история/разница/откат с базой, таблица шагов формата, этот README) —
`merfy-mcp/docs/plans/2026-09-30-revisions-clean.md`, грамматика адресов и операции —
в `operations/README.md`.

## Как: пять операций коротко

Везде `site: StoreContentSite` — минимум полей строки `site`, которые нужны шагам чтения/записи
(`themeId`, `publicUrl`, опционально `name`/`currentRevisionId`/`contentModel`); готовый хелпер —
`toStoreContentSite(site)` из `store-content.port.ts`, если строка `site` уже на руках.

**Прочитать** — текущую ревизию или конкретную, с полным конвейером чтения (миграции формата →
нормализация манифеста темы → досев страниц → адреса ассетов):
```ts
const { document, version } = await storeContent.load(siteId, { site });
// конкретная версия: storeContent.load(siteId, { site, revisionId })
// побайтовая копия без миграций/досева (нужно откату) — { site, revisionId, asStored: true }
```

**Сохранить от базы** — конструктор/кабинет, «я видел ревизию `base` и правил её»; при устаревшей
базе порт сам сольёт или откажет по `mergePolicy` (таблица «Писатели» ниже):
```ts
const res = await storeContent.save(siteId, {
  mode: "on-base",
  tenantId, site,
  base: currentRevisionIdClientSaw, // null — ревизии у магазина ещё нет
  mergePolicy: "last-writer-wins", // | "reject-conflicts" | "refuse"
  document: nextDocument,
  actor: { type: "user", id: actorUserId },
});
// res.version — id новой ревизии; res.effect?.merged (bool),
// res.effect?.overwritten (что перезаписано слиянием, только при merged)
```

**Сохранить вслепую** — создание магазина, пересев при смене темы: документ целиком поверх текущей,
без слияния и меток; `setCurrent` — сделать текущей, `sitePatch` — заодно поправить `site` (В4,
одна транзакция):
```ts
const res = await storeContent.save(siteId, {
  mode: "blind",
  tenantId, site,
  document: seededDocument,
  setCurrent: true,
  sitePatch: { themeId, themeAppliedAt: new Date() },
});
```

**История** — новые версии магазина сверху, без служебных снимков клиента, курсором:
```ts
const page = await storeContent.history(siteId, { site, limit: 20 });
// ещё есть: storeContent.history(siteId, { site, limit: 20, before: page.nextBefore })
```

**Разница** — список операций движка между двумя версиями (обе читаются как `load`, «одна версия формата»):
```ts
const { ops } = await storeContent.diff(siteId, fromRevisionId, toRevisionId, { site });
```

**Откат** — новая ревизия, побайтовая копия выбранной, со сверкой текущей (И6):
```ts
const { revisionId, restoredFrom } = await storeContent.rollback(siteId, {
  tenantId, site, revisionId: targetRevisionId,
  base: currentRevisionIdClientSaw, // не задан — текущая на момент чтения; null — «ревизии нет»
});
```

Дешёвая проверка «есть ли такая ревизия» без содержимого (используется сборкой — см. `envelope` в
карте модулей) — `storeContent.envelope(siteId, revisionId, { site })`, возвращает `null`, не бросает.

## Карта модулей

| Файл | За что отвечает | Кто зовёт |
|---|---|---|
| `store-content.port.ts` | контракт порта: `load`/`save`/`history`/`get`/`envelope`/`rollback`/`diff`, формы записи `SaveParams` (`"on-base"` / `"blind"`), `SitePatch` (В4), результаты, ошибки `RevisionConflictError` и `RevisionMergeConflictError` | все ниже, `sites.service`, `pages.service`, RPC-контроллер, команды `store/` |
| `store-content.service.ts` | Nest-провайдер: диспетчер по `site.content_model` (сегодня только `document`) + `createRevision`/`buildInitialRevision`/`historyCounts` (не диспетчеризуются — общие для всех моделей) | `sites.service`, `pages.service`, `build.service`, `generator.service`, `preview.controller`, `page-meta.controller`, `admin/bulk`, команды `store/theme-switch`, `store/lifecycle` |
| `document.adapter.ts` | адаптер модели `document`: конвейер чтения `LOAD_STEPS` (migrate → normalize → seed → resolve, таблица из 4 шагов), `history`/`get`/`envelope`/`rollback`/`diff`, единая функция фиксации `commit()` (вставка + сдвиг указателя + `sitePatch`, одна транзакция) | `store-content.service` |
| `format/run.ts` + `format/steps/*.ts` | R4: сам шаг `migrate` конвейера чтения — таблица `MIGRATION_STEPS` (~28 шагов формата ревизии: миграции страниц, бэкфиллы, сидеры системных страниц, унификация хрома с `home`) вместо лестницы `if`; `after` в каждом шаге — задокументированная зависимость порядка, проверяется `validateStepOrder()` на загрузке модуля. Публичный вход остался на старом месте — `utils/revision-migrations.ts` (см. ниже) | `document.adapter.ts` (через фасад) |
| `utils/revision-migrations.ts` | тонкий фасад: реэкспорт `migrateRevisionData`/`unifyHeaderWithHome`/`storeChromeOnCheckoutResult`/`unifyFooterWithHome`/`GALLERY_CANON_ITEMS` из `format/` — путь не переехал, потому что у него ~45 внешних импортёров (тесты тем, `canon-reference.ts`, `revision-write-filter.ts`) | `document.adapter.ts`, `store/theme-switch/canon-reference.ts`, `utils/revision-write-filter.ts`, тесты тем |
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
- ~~Шаги чтения (`migrate`, `normalize`, `seed`, `resolve`) лежат внутри `document.adapter.ts`~~ —
  частично снято R4: `migrate` был не тонкой обёрткой, а 2 532-строчной лестницей `if`
  (`utils/revision-migrations.ts`) — теперь таблица шагов в `format/steps/*.ts`
  (`merfy-mcp/docs/plans/2026-09-30-revisions-clean.md`). Осталось: сама таблица оркестрации четырёх
  шагов (`LOAD_STEPS`/`runLoadSteps`, тонкие обёртки `migrateStep`/`normalizeStep`/`seedStep`/
  `resolveStep`) — по-прежнему в `document.adapter.ts`; `normalize`/`seed`/`resolve` каждый уже тонкая
  обёртка над внешней функцией (`PageResolver.normalizeRevision`, `seedContentPagesFromTheme`,
  `resolveAssetUrls`) — выносить оркестрацию в свой файл, если понадобится, отдельной задачей.
- **R4, пропуск миграций для «свежего» документа — рассмотрели и НЕ стали делать.** Замер
  `migrateRevisionData` на золотых документах пяти тем (`src/__tests__/golden/*/fresh-store.json`,
  33–66 КБ) — 0,12–0,22 мс за прогон; весь конвейер чтения (миграции + normalize + seed + resolve) по
  замеру плана — 0,4–1,3 мс. Даже полный пропуск ВСЕХ шагов миграции экономил бы меньше миллисекунды,
  а корректная реализация (метка версии формата в `meta`, не в `data` — иначе золотые документы
  изменились бы; шаги на манифесте темы, например `seedCheckoutResultPage`, пропускать нельзя никогда;
  доказательство равносильности «пропуск = повтор» по всем золотым документам и фикстурам) добавляет
  риск на горячий путь, который выполняется на КАЖДЫЙ GET. Не стоит того — «при любом сомнении не
  делай» (бриф R4).
