# @merfy/shell

Ядро секций витрины новых тем (блок 5 «Секций и SDK»,
`merfy-mcp/docs/plans/storefront-sections/05-section-scripts-bundle/design.md`). Код секции —
`import { defineSection } from '@merfy/shell'`; на странице магазина ядро, его части и модули секций страницы — один
бандл, его собирает сборка магазина (`@merfy/storefront-build`, `src/bundle.ts`, часть 5б). `@merfy/shell` и
`@merfy/shell/core` — один вход `src/core/index.ts`; старое ядро блока 7 (загрузчик, список модулей, карта импортов,
`part()`) удалено в части 5б.

## Команды

- `pnpm build` — ядро секций: `dist/core.js` (ES-библиотека: `start`, `defineSection`, части SDK) и `dist/core.json` —
  версия, вес brotli бандла страницы без секций (бюджет 12 КБ, `build/build.ts`) и части страницы из `core-parts.json`;
  поведения блока 6 — в `dist/behaviors/`. Образ site-gen собирает их в `Dockerfile`; сборщик витрин читает
  `dist/core.json` и `dist/core.js` (`readShellBuild` пакета `@merfy/storefront-build`).
- `pnpm test`, `pnpm test:coverage` — jsdom; `pnpm test:browser` — Chromium.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.

## Как поменять состав ядра

Правка списка `core-parts.json` (например, `{ "core": ["auth", "cart"] }`) и новая версия пакета в `package.json`.
Части из списка — в бандле каждой страницы магазина, их получает каждая секция (до части 5в: там модули выберет
`uses`). Вес стережёт бюджет сборки (`build/build.ts`).

## Аналитика магазина

`src/core/analytics/` — часть SDK `analytics` (блок 11; с части 5б — не секция): визит, просмотр страницы по
`merfy:page:view`, «в корзину» и «из корзины» по событиям `merfy:cart:*` (`sdk-events.ts`) — в сборщик аналитики
(`analytics.url` конфига) по таблице согласия `consent.ts`; счётчики мерчанта — после загрузки страницы и «Принять».
«Свой код» мерчанта (`analytics.custom`, `custom-code.ts`): из текста — только `<script>`, разбор в `<template>`;
«ждать согласия» — после «Принять», «сразу» — после `merfy:page:ready`; один раз, в превью — никогда. API для секций у
части нет; сборка магазина добавляет её в бандл каждой страницы (`LIVE_PARTS`). Вес — до 3 КБ brotli, «свой код» — до
512 Б (`__tests__/analytics-budget.test.ts`).

## Согласие и события страницы (блок 13 «Секций и SDK», часть 13а)

- Часть `consent` (в ядре): `ctx.consent.$consent` — `'unknown' | 'accepted' | 'declined'`, `accept()`, `decline()`;
  разметка — `consent.accept`, `consent.decline`. Ответ — `localStorage['merfy:cookie-consent:v1']`, как у баннера пяти
  тем; превью и недоступное хранилище — память страницы; `merfy:consent:change` — при смене ответа, и из другой вкладки.
- События страницы (`src/core/page-events.ts`): `merfy:page:hidden`, `merfy:page:visible`, `merfy:page:leave`,
  `merfy:page:restore` («Назад» из кеша браузера, без второго просмотра).

## Наши секции

`sections/<имя>/` — исходники наших секций: магазин сохраняет их как свои (блок 1 «Секций и SDK»). `cart-badge` —
«Значок корзины»: число штук в корзине через `ctx.watch(ctx.cart.$count)`.

## Ядро секций (блок 5 «Секций и SDK», части 5а и 5б)

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

## Превью: замена экземпляра и код через `blob:` (блок 5 «Секций и SDK», часть 5г)

- Скрипт превью (`src/preview/`) — обычный скрипт: план 2 части 5г собирает его в `dist/preview.js`, сборщик
  вставляет текстом в HTML превью после JSON-тега `#merfy-preview-bundle` со строкой бандла страницы. Бандл и код новой
  версии секции скрипт превью загружает модулем из `blob:`-адреса (`src/preview/entry.ts`, единственное место с
  `import()`): рамка превью — без `allow-same-origin` (блок 2).
- Протокол — `src/core/preview-protocol.ts`, вход `@merfy/shell/preview`: `merfy:preview:update { html, script,
  codeOnly }` (скрипт секций превью → скрипт превью), `merfy:preview:replace` (скрипт превью → ядро),
  `merfy:preview:updated` странице и `section-updated { id, outcome, message }` конструктору; `SECTION_ERROR_EVENT` —
  имя сбоя экземпляра для скрипта секций превью. Итоги: `kept-state`, `fresh`, `failed`, `reloaded`, `superseded`,
  `absent`.
- Ядро — `watchPreviewReplace` (`src/core/replace.ts`): бандл превью передаёт её в `start({ preview })`, ядро зовёт её
  только в режиме `preview`. Тот же `<merfy-section>`: снятие прежнего экземпляра, атрибуты и содержимое из HTML ответа,
  запуск с копией `ctx.state` (JSON); ошибка — ещё раз без состояния, снова ошибка — сбой. Другой `hash` — `load()` кода,
  его получают и следующие экземпляры секции. Код не загрузился или это двадцатая загрузка (`REPLACE_LIMIT`) — превью
  перезагружается.
- Тесты: `core-replace.test.ts`, `preview-script.test.ts` (unit) и `browser/preview-replace.browser.test.ts` — рамка с
  песочницей; браузеры — `MERFY_BROWSERS` (по умолчанию `chromium`).

## Поведения и анимации (блок 6 «Секций и SDK»)

- Вход — `@merfy/shell/behaviors`: часть `behaviors({ list, reveal, animate })`, девять поведений, появления
  `reveal`, провайдер `animate` для `ctx.animate`; каталог — `@merfy/shell/behaviors/catalog`.
- Разметка секции: `data-behavior="<имя>"` на корне, части — `data-part`, параметры — `data-<имя>` (вид, умолчание и
  границы — `BEHAVIORS`). Девять поведений: `accordion` (`<details>` + Motion: плавное раскрытие значений satin,
  общий `name` — открыт один), `dialog` (`<dialog>` + Motion: `fade`, `drawer`, `drawer-back`, `drop`; модальные и
  немодальные, запрет прокрутки, Escape/фон/ссылка; открытие модального окна закрывает немодальные окна своей секции), `carousel` (Embla с Autoplay и Fade: стрелки, точки, миниатюры,
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
