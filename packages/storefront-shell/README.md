# @merfy/shell

Ядро витрины новых тем (блок 7 «Каркаса витрины», `merfy-mcp/docs/plans/storefront-shell/07-sdk-shell/design.md`):
одна копия на странице, секции всех авторов берут его по имени через import map — `import { defineSection, part }
from '@merfy/shell'` (С7-2 А, п. 12).

## Что делает на странице

- Читает конфиг магазина (`#merfy-config`, блок 3) и список модулей страницы (`#merfy-modules`): строки `section` —
  скрипты секций этой страницы, `global` — глобальные скрипты (С7-7 Г, С7-21 А).
- Грузит все модули сразу (С7-19 А); не загрузился — одна повторная попытка с `?merfy-retry=1` (п. 6).
- Запускает каждую секцию в `<merfy-section data-section="<имя>">` её `mount` и снимает `unmount` (С7-15 Б). Глобальному
  скрипту ставит скрытый `<merfy-section data-merfy-global>` в конце `<body>`.
- Сбой — в предохранителе: секция получает `data-merfy-state="failed"` и `inert`, соседи работают, запись —
  событием `merfy:section-error` на `window` и в консоль (С7-16 А). Ошибки после запуска находят секцию по адресу файла.
- Части ядра — вход, корзина, избранное: `await part('cart')`. Какие части в файле ядра, а какие грузятся отдельно, —
  один список `core-parts.json` (С7-3 Б). Части — шов до договора SDK: состояние в памяти страницы, без сети.
- В превью (`mode: preview`) меняет код секции на лету с её состоянием (С7-22 В, `src/preview.ts`).
- На витрине (`mode: live`) шлёт записи `merfy:section-error` в шлюз — `POST <api.url>/storefront/section-errors`,
  `sendBeacon` с `text/plain`: имя секции, отпечаток скрипта, стадия, текст до 300 знаков; до 10 записей на страницу,
  пачкой через 2 с или при уходе страницы в фон (`src/error-log.ts`, блок 11, часть 4). Запись без отпечатка не уходит.

## Команды

- `pnpm build` — ядро в `dist/shell/` и `dist/shell.json` (версия, подсказки `modulepreload`, вес). Образ site-gen
  собирает его в `Dockerfile`; сборщик витрин кладёт копию в каждую сборку магазина.
- Тот же `pnpm build` собирает ядро секций блока 5 «Секций и SDK»: `dist/core.js` и `dist/core.json` — версия и вес
  brotli бандла страницы без секций (бюджет 12 КБ, `build/core.ts`).
- `pnpm test`, `pnpm test:coverage` — jsdom; `pnpm test:browser` — Chromium по собранному ядру.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.

## Как поменять состав ядра

Правка списка `core-parts.json` (например, `{ "core": ["auth", "cart"] }`) и новая версия пакета в `package.json`.
Код секций не меняется: часть они берут через `part()`. Вес ядра стережёт бюджет сборки (`build/build.ts`).

## Превью: замена кода секции

В `mode: "preview"` ядро слушает сообщения родительского окна — рамки конструктора (блок 8), `src/preview.ts`:

- конструктор → превью: `{ "type": "update-section", "name": "shop:color-match", "html": "<…>", "src": "/_merfy/m/<sha256>.js" }`;
  `src: null` — у новой версии скрипта нет;
- превью → конструктор, только тому `origin`, откуда пришло сообщение: `{ "type": "section-updated", "name": "…",
  "outcome": "…", "message": "…" | null }`.

`outcome`: `kept-state` — новый код живой и получил состояние старого (`saveState` → `context.state`); `fresh` — живой,
но с нуля; `failed` — новый код «не ожил» или в модуле нет определения, текст ошибки — в `message`; `reloaded` — модуль не
загрузился или это двадцатая замена: превью перезагружается само; `superseded` — пришла правка новее; `absent` — секции
на странице нет.

## Секции платформы

`sections/<имя>/` — секции платформы (С7-18 Б: вид встроенного SDK). Они входят в реестр секций при выпуске
платформы с версией этого пакета (дверь выпуска, `@merfy/storefront-sections`). Правка секции — только с новой версией.

- `analytics` — глобальный скрипт `platform:analytics` (блок 11): визит, просмотр страницы, «в корзину» и «из корзины»
  в сборщик аналитики (`analytics.url` конфига) по таблице согласия `consent.ts`; счётчики мерчанта — после «принять».
  Вес — до 3 КБ brotli (`__tests__/analytics-budget.test.ts`). Свои файлы секция импортирует с `.ts`: так их находит
  сборка приёма.

## Ядро секций (блок 5 «Секций и SDK», часть 5а)

`@merfy/shell/core` (`src/core/`) — новое ядро секций рядом со старым. Страницы магазинов его пока не загружают: бандл
страницы собирает часть 5б, она же удаляет старое ядро (загрузчик, список модулей, карту импортов).

- Секция — `export default defineSection({ mount, actions, unmount })`. Код секции получает элементы только обёртками
  `El` и работает со страницей только через `ctx` (design.md блока 5, разделы 3.1–3.3).
- Все секции запускаются разом в порядке страницы, потом глобальные скрипты; затем `merfy:page:ready` и
  `merfy:page:view`. Подписки, таймеры и слушатели экземпляра ядро снимает само, когда элемент ушёл из документа;
  перенос узла экземпляр не перезапускает.
- Входные данные экземпляра — тег `<script type="application/json" data-merfy-input>` последним дочерним элементом
  `<merfy-section>`: `{ settings, blocks, data }`, до 32 КБ (`src/core/input.ts`).
- Сбой — на экземпляр: `data-merfy-state="failed"`, элементам с `data-action` — `aria-disabled`, событие
  `merfy:section:error` на `document` с `{ section, id, script, stage, message }`, строка в консоли; на витрине —
  запись в журнал ошибок шлюза (`src/error-log.ts`, `CORE_ERRORS`).
- Части SDK `cart`, `favorites`, `auth`, `newsletter` (`src/core/parts/`) — сторы `{ get }` и действия с `Result`.
  Корзина — на сервере (блок 9); избранное и вход — в памяти страницы до блока 10. Действия разметки: `cart.add` —
  `data-product-id`, `data-variant-id`, `data-quantity`; `favorites.toggle` — `data-product-id`.
- Атрибуты, которые код секции пишет через `El.attr` и `El.cssVar`, — по списку `src/core/attributes.ts`; остальное —
  ошибка `attr-forbidden`.

## Поведения и анимации (блок 6 «Секций и SDK»)

- Вход — `@merfy/shell/behaviors`: часть `behaviors({ list, reveal, animate })`, девять поведений, появления
  `reveal`, провайдер `animate` для `ctx.animate`; каталог — `@merfy/shell/behaviors/catalog`.
- Разметка секции: `data-behavior="<имя>"` на корне, части — `data-part`, параметры — `data-<имя>` (вид, умолчание и
  границы — `BEHAVIORS`). Девять поведений: `accordion` (`<details>` + Motion: плавное раскрытие значений satin,
  общий `name` — открыт один), `dialog` (`<dialog>` + Motion: `fade`, `drawer`, `drawer-back`, `drop`; модальные и
  немодальные, запрет прокрутки, Escape/фон/ссылка), `carousel` (Embla с Autoplay и Fade: стрелки, точки, миниатюры,
  счётчик, текст слайда, кнопка паузы, ←/→), `tabs` и `nav-menu` (свой код по W3C APG), `quantity` (браузерные
  `stepUp`/`stepDown`), `card-photos` (наведение и свайп фото карточки), `sticky-header` (ставит и снимает
  `data-hidden`), `video` (кнопка «Смотреть»). Что делает браузер, что — SDK — `BEHAVIORS` в каталоге.
- Появления: `data-animate="<пресет>"` и `data-delay` — пресеты `PRESETS` со значениями пяти тем «один в один»;
  появлений нет при выключенном выборе «Появление секций» (`data-motion-reveal`), при «уменьшить движение» и в
  превью. Флаг `data-merfy-motion` ставит встроенный скрипт `MOTION_HEAD_SCRIPT`, снимает часть behaviors по
  `merfy:page:ready`; `MOTION_CSS` — запасной показ через 3 с, если ядро не запустилось. Всё это встраивает в `<head>`
  сборка страницы (часть 6б).
- `ctx.animate(el, кадры, параметры)`: свойства — из списка `src/core/keyframes.ts`, значения без `url()`, кавычек и
  «\», длительность и задержка — мс, кривые — по имени из `EASINGS` или массивом Безье; элемент — только своей секции;
  превью и «уменьшить движение» — сразу последний кадр; снятие секции останавливает анимацию.
- Сборка: `pnpm build` → `dist/behaviors/` (файл на поведение, появления, провайдер и часть; общий код — в кусках,
  бюджеты brotli — `build/behaviors.ts`); бандл страницы склеивает их (часть 6б). Тесты — `pnpm test` (unit) и
  `pnpm test:browser` (настоящий Chromium).

## Сторы, события и действия (блок 9 «Секций и SDK», часть 9а)

- Сторы ядра — Nano Stores 1.5.4 (`src/core/stores.ts`): `atom` замораживает значение, `set` с тем же значением
  подписчиков не вызывает; `batch`, `computed`, `onMount` — из Nano Stores. Секциям — по-прежнему фасад `{ get }` и
  `ctx.watch`.
- Каталог событий — `src/core/event-catalog.ts`, вход `@merfy/shell/events`: 20 имён `merfy:объект:действие`, правила
  полей, семь кодов ошибок, `checkEventDetail` для превью и тестов. Типы данных — `EventMap` (`src/core/types.ts`).
  Имена и поля внутри `"sdk": 1` только добавляются. На витрине данные событий не проверяются.
- Таблица действий — `src/core/action-catalog.ts`, вход `@merfy/shell/actions`: `cart.add`, `favorites.toggle`,
  `newsletter.subscribe` (без разметки) — для проверки при сохранении и документации.
- Ошибки действий — `src/core/failures.ts`: ответ шлюза → код SDK (код в теле `{ code }` главнее статуса), тексты
  уведомлений, `quiet`. Покупатель видит `merfy:notice:show` с текстом SDK; `invalid` — только строка в консоли.
- Корзина — на сервере (`src/core/parts/cart.ts`): номер — `merfy:cart-id:v1` (в превью — в памяти страницы), чтение при
  первой подписке и по событиям страницы, `cart.add` — очередь по одному, `$count` растёт сразу и откатывается при
  ошибке. `cart.remove` — блок 10.
- Подписка на рассылку — `ctx.newsletter.subscribe({ email })` по `uses: ["newsletter"]`.
- Бюджет бандла страницы без секций — 12 КБ brotli (`build/build.ts`).
