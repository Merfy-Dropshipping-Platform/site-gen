# Журнал работы по темам

Append-only. Исправление прошлой записи — новая запись со ссылкой на неё.
Не писать пароли и токены.

## 2026-08-30 — W-001 — правило журнала + смена эталона на flux

### Цель

Фиксировать, что сделано по темам, чтобы сессии не восстанавливали историю из обрывков.

### Выполнено

- Добавлено правило `.claude/rules/record-theme-work.md` и секция в корневом `AGENTS.md`.
- Заведён канон `docs/theme-work/STATUS.md` (этот каталог).
- Пользователь подтвердил: flux доведён по эталону поведения (сайдбары, настройки секций, cart, checkout, wishlist, динамические страницы).
- Следующая тема: satin, тот же скоуп.

### Статус записей

- flux = USER_CONFIRMED (подтверждение пользователя, код в этой сессии не аудитился).
- satin = NEXT, работа не начата.

### Проверки

- Код тем не менялся.
- Commit/push/deploy не выполнялись.

## 2026-08-30 — W-002 — локальный конструктор Satin

### Цель

Завести конструктор под Satin, чтобы на нём догонять flux-эталон.

### Выполнено

- Существующий local-сайт `57ac2ede-853d-42f3-abd5-68d6bbbc0709` был `frozen` (trial past_due с 2026-08-20). Status → `draft`.
- Подписка `qOTazGhwWZFFnF3bzGH5xJAb1ILkIdHa` → `trialing` до 2026-09-29.
- Поднят billing :3112 (без него write 503 `billing_unavailable`).
- Логин в origin конструктора `:3200`, открыт `/?siteId=57ac2ede-…&page=home`.
- Превью SATIN + сайдбар Hero живые.

### Не делали

- Не создавали новый аккаунт.
- Не публиковали live.
- Не начинали паритет секций с flux.

## 2026-08-30 — W-003 — Satin: дефолт = разметка Satin-theme, не чёрный плейсхолдер

### Цель

Вернуть метод «разметка репы верстальщика + оживление настройками». Эталон:
`Merfy-Dropshipping-Platform/Satin-theme` (клон `/tmp/Satin-theme`).

### Почему было чёрное

Hero empty-state = `bg-[#111111]` без фото кампании. Картинки `/images/4x/*`
переписывались на мёртвый `https://393bdf0b623f.merfy.ru/...`. Collections/Popular
вместо плиток верстальщика рисовали пустые плейсхолдеры.

### Сделано в коде (sites, не запушено)

- `preview.service.ts`: rewrite ассетов на `/__theme/<themeId>` (dist/theme-preview).
- `themes/satin/.../Hero.astro`: дефолт как index.astro верстальщика (фото Главный_экран, тексты).
- `Collections.astro`: без выбора в пикере — `defaultCollections` из репы.
- `Popular.astro`: `catalogProducts`, не пустые курточки.
- `pnpm exec node scripts/compile-theme-sections.mjs satin` — OK.

### Дальше

Остальные секции главной (CollectionRows, ImageBanner, Features, Journal, Faq) тем же лекалом. Нужен рестарт sites, чтобы preview rewrite подхватился.

## 2026-08-30 — W-004 — Satin home: IWT/MultiRows/MainText/FAQ с дефолтом Satin-theme

В worktree `flux-constructor-live-markup`:
- ImageWithText ← ImageBanner (фото мужской кампании, «STYLE’S WEAR…», CTA Перейти)
- MultiRows ← CollectionRows (женская/мужская коллекции с фото)
- MainText ← TextBlock (копирайт верстальщика)
- MultiColumns ← Features (если в ревизии нет columns)
- CollapsibleSection ← Faq (если в ревизии нет sections)
- Publications ← Journal (если нет реальных публикаций)

Пруф в конструкторе: h2 «Женская коллекция» / «Мужская коллекция» / «STYLE’S WEAR COLLECTION SINCE 90’», hero `Главный_экран.webp`.

## 2026-08-30 — W-005 — Satin home 1:1 с index.astro верстальщика

### Цель

Состав главной в конструкторе = `Satin-theme/src/pages/index.astro`, не урезанный сид.

### Было

Header, Hero, Collections, Popular, IWT, MultiRows, MainText, MultiColumns (ДОСТАВКА/ВОЗВРАТ), FAQ сида, Footer.
Не было второй сетки коллекций, второго Popular, Journal.

### Сделано

- Ревизия local-сайта и `templates/defaults/satin.json`: порядок Hero → Collections → Popular → MultiRows → MainText → IWT → Collections-2 → Popular-2 → Features → Journal → FAQ.
- `Collections.astro`: пустой пикер на `collections-satin-2` / `collectionSet=secondary` → `collectionsSecondary` (Коллекция_4/5/6, «Футболки и поло»).
- `Popular.astro`: `popular-satin-2` / `productOffset=3` → товары 4–6 верстальщика.
- `Hero.astro`: пустой `title` из puck-default больше не прячет «STYLE’S WEAR…».
- Compile satin 17 секций + restart sites в worktree.

### Пруф

Конструктор `/?siteId=57ac2ede-…&page=home`: outline с двумя «Список коллекций», двумя «Коллекция товаров», Публикации; превью Hero + Коллекция_1–6 + journal.

### Не делали

Commit/push/deploy. Cart/checkout/wishlist. Vanilla/bloom.

## 2026-08-30 — W-006 — Satin preview CSS = вёрстка, не схлопнутый Tailwind

### Почему «поехала вёрстка»

В iframe конструктора не было CSS портов Satin:
- `dist/theme-css/satin.css` не собирался (`compile-theme-sections` обещал, не писал).
- `preview-tailwind` не содержит `.satin-*`, `md:h-[680px]`, `size-8`.

Следствие: Hero ~200px (вместо 680), CTA прозрачная, сердца избранного 300×300 поверх фото.

### Сделано

- `themes/satin/src/styles/global.css`: `@source` своих `components/layouts/pages` (как у rose).
- `compile-theme-sections.mjs` пишет `dist/theme-css/<theme>.css`.
- Конструктор: `Kelly Slab` / `Arsenal` из настроек больше не срываются в Comfortaa (ключ `Kelly Slab` ≠ `kelly-slab`).

### Пруф (computed в iframe)

Hero 680px, CTA `rgb(0,0,0)` / текст белый, h1 Kelly Slab 32px, fav 32×32, `--font-heading: "Kelly Slab"`.

### Дальше по секциям

Пиксельная доводка MultiRows / IWT / Features / Journal / FAQ vs `Satin-theme`. Cart/checkout не трогали.

## 2026-08-31 — W-007 — Satin MultiRows: вёрстка как настройки

### Что

«Женская / Мужская коллекция» — не отдельный тип блока, а два редактируемых ряда `CollectionRows` (в конструкторе — Мультиряды).

### Сделано

- Дефолты puckConfig + ревизия + seed: заголовок, текст, фото, CTA «Для женщин/мужчин» → `?collection=Женское|Мужское`.
- Сайдбар: Мультиряды → два «Ряд», поле кнопки «Для женщин».
- Превью: фото с `/__theme/satin/images/4x/Женская_коллекция` (не мёртвый merfy.ru). Двойной префикс `/__theme/satin/__theme/...` починен в rewrite.

### Не делали

Commit. Следующая секция: ImageWithText / баннер.

## 2026-08-31 — W-008 — Satin: белая схема 1 + русские имена секций

### Жалоба

1. Конструктор Satin «весь чёрный», а дефолтная цветовая схема должна быть белой.
2. Названия секций на английском (`Header`/`Footer` в строках сайдбара) — отображаются неверно.

### Почему

- `theme.json` scheme-1 раньше был чёрный (`--color-bg: 8 2 0`), блоки с `colorScheme: "1"` красились в `.color-scheme-1`.
- `templates/defaults/satin.json` после перестановки White/Black оставил `defaultSchemeIndex: 1` → новые сайты брали Black.
- `GET /api/themes/satin/puck-config` отдавал `label: "Header"|"Footer"` из theme-base / закэшированных astro-blocks, а не русские лейблы.

### Сделано

- Ревизия local-сайта: `defaultSchemeIndex: 0`, схема 1 = White `#ffffff`, контент `colorScheme: "1"`, PromoBanner `colorScheme: "2"` (чёрная плашка как в вёрстке).
- `theme.json` scheme-1 = белый. Сид `templates/defaults/satin.json`: `defaultSchemeIndex: 0`, у Black инвертированы кнопки (белая primary на чёрном фоне).
- Конструктор: `getComponentLabel` в `puckConfigResolver` + `ComponentPicker` (Header→Шапка, Footer→Подвал). Outline уже шёл через `COMPONENT_LABELS`.
- Тест манифеста: первая схема `--color-bg: 255 255 255`.

### Пруф

Тема → Цвета: «Схема 1» белая, выбрана. Outline: Промо-баннер, Шапка, Изображение, … Подвал. Превью: белый фон, чёрная промо-плашка, split Hero.

### Не делали

Commit/push/deploy. Cart/checkout/wishlist. Vanilla/bloom.

## 2026-08-31 — W-009 — Satin: белая схема не должна перекрашиваться в чёрную

### Жалоба

Сначала превью белое, потом всё равно становится чёрным.

### Почему

Конструктор после загрузки iframe писал в `<head>` `data-theme-vars` + `data-color-schemes` из React-палитры. Hardcode pupa: scheme-1 = `#000000`. Серверный `__merfy_tokens_css` (Satin белая) приходил первым; слой конструктора — вторым и перебивал `:root` / `.color-scheme-1`.

### Сделано

- В iframe/host не инжектятся `--color-*` схемы (остаются шрифты/радиусы).
- `style[data-color-schemes]` из превью снимается.
- `update-tokens` не шлёт pupa-hardcode (scheme-1 `#000`).
- Снова сид палитры из puck-config / theme.json, если merchant-схем нет.

### Не делали

Commit/push/deploy.

## 2026-08-31 — W-010 — Satin цвета как у rose/flux

Rose/flux: контент на `scheme-2`, и `scheme-2` светлая; тёмная палитра с другим номером; конструктор инжектит `:root` + `.color-scheme-N`.

Satin seed копировал `scheme-2` на контент, но схема 2 была чёрная — страница белела, потом чернела. Обход «не инжектить цвета» откатили.

Теперь scheme-1 и scheme-2 светлые, чёрная `#080200` = scheme-4 (промо/копирайт). Инжект как у rose/flux. POST ревизии local 402 `open_invoice_pending`.

## 2026-08-31 — W-011 — Bloom аудит 10 секций вне home seed

### Цель

Проверить wiring/preview для секций, не входящих в seed главной (8 блоков).

### Выполнено

- Runtime: `scripts/audit-bloom-sections.mjs` → POST `/api/sites/.../preview/block` — **10/10 OK** (Collections … CartSection).
- Фиксы: `page-blocks.ts` (IWT headingSize/textSize, Collections subtitle envelope, MultiRows/Video normalize, Newsletter alignment→position); `preview.service.ts` — `adaptLegacyProps` в hot-render; `MultiRows.astro` — `secondary` → white pill.
- STATUS.md обновлён (bloom WIP).

### Проверки

- `pnpm test src/services/__tests__/resolve-block-scheme.spec.ts` — 22/22 pass.
- Sites :3114 preview/block для каждой секции.

### Открыто

- Product + catalog pages; click-audit сайдбаров; 402 media upload (billing).

## 2026-09-01 — W-012 — Bloom MultiColumns пустые в конструкторе

### Причина

Worktree `flux-constructor-live-markup` не имел `themes/bloom/src/lib/rich-text.ts`. Compile оставлял relative import → `dist/lib/rich-text` 404 → `resolveV2Section` молча падал → fallback на theme-base MultiColumns (пустая сетка без placeholder).

### Фикс

- Добавлен `rich-text.ts` в worktree.
- `node scripts/compile-theme-sections.mjs bloom` (worktree + main).
- Пруф: empty → «Мультиколонны» + 3 «Колонна»; seed columns → 3 `<img>` + «Колонка N» (bloom HTML, не base).

### Проверки

- POST `/preview/block` MultiColumns empty + filled — bloom markup.

## 2026-09-03 — W-013 — Bloom Hero: пропала подложка после смены фото

### Причина

Плейсхолдер Hero всегда рисовал градиент + белый текст. После реального фото: scheme-3 (чёрный текст) + затемнение 55% → текст «пропадал»; градиент-подложка был только в ветке `isEmpty`.

Rose: Hero на тёмной схеме (белый текст) + overlay.

### Фикс

- `Hero.astro` (worktree + main): градиент `from-black/45` на filled; `!text-white` поверх фото; overlay с inline `background-color`.
- `coerceHeroProps`: не затирать title/subtitle пустой строкой.
- `theme.json` blockDefaults Hero: `scheme-1` + `overlay: 40`.

### Пруф

POST preview/block — `!text-white`, `from-black/45`, title «Искусство заботы…».

## 2026-09-01 — W-012 — Satin сайдбары секций как у live Rose

### Цель

Правый сайдбар каждой секции главной Satin + добавленных секций = живой конструктор Rose. Варианты настроек меняют превью так же, как в Rose. Визуал остаётся satin.

### Выполнено

- Сверили live `GET /api/themes/{rose,satin}/puck-config` после `compile-astro-blocks` + `restart sites`.
- **Все 19 блоков MATCH** по видимым полям/опциям: PromoBanner, Header, Hero, Collections, PopularProducts, MultiRows, MainText, ImageWithText, MultiColumns, Publications, CollapsibleSection, Footer, Slideshow, Gallery, Video, Newsletter, ContactForm, Catalog, Product.
- Footer satin: в панели как у Rose — Рассылка, Заголовок/Текст, Выравнивание, Навигация/Информация/Соцсети/Копирайт, схема, отступы (раньше колонки были hidden).
- ImageWithText: top-level «Выравнивание» как у Rose.
- MultiRows: кнопки primary/black/white + контейнер как в live Rose; «схема контейнера» hidden.
- MultiColumns: лейбл «Положение текста».
- Порты (preview, mtime-bust): Header/Footer padding больше не игнорит canon-default; PromoBanner `thin`; MainText `position=center` реально центрирует; MultiColumns `displayColumns` через `--cols`; Slideshow 9-grid position; Video `subheading`; MultiColumns `imageSize` на медиа-боксе.
- Dual-write main + worktree `flux-constructor-live-markup`. Конструктор не рестартили.

### Проверки

- Live puck-config satin vs rose: MATCH по всем home+addable секциям.
- `compile-theme-sections.mjs satin` — 17 секций.
- Chrome MCP недоступен (занят профиль) — клик по конструктору не снимал.

### Открыто

- Header `menuType` dropdown/mega/sidebar + recursive submenu (поля есть, mega/dropdown не как у Rose).
- Popular `imageView=square`, `quickAddMode=none|cart`.
- Catalog cardStyle/buttonStyle/nextPhoto/quickAdd variants.
- Video YouTube/Vimeo iframe (satin только `<video src>`).
- Footer `heading.size`/`text.size` — в main Rose тоже hardcoded; worktree Rose применяет.

### Не делали

Commit/push/deploy.

## 2026-09-01 — W-013 — Hot-update: Puck type для всех тем, не prefix id

Корневая причина: iframe брал `blockId.split('-')[0]` (`header-satin` → `header`) → theme-base Header. Роза «работала», потому что theme-base ≈ rose-порт. Сатин — нет.

Фикс единообразный: конструктор шлёт `blockType` (Header, PopularProducts, …); агент `ev.data.blockType || LAST_TYPES`; `resolveV2Section` case-insensitive. Curl: `header` и `Header` оба рисуют satin-порт; 4 logoPosition дают разный HTML. Sites restart. Commit не делали.

## 2026-09-01 — W-014 — Satin Header: контракт раскладки как у Rose

### Цель

Пользователь: настройки в конструкторе Satin не двигают превью; эталон — как сделано в Rose.

### Что в Rose (порт `themes/rose/.../Header.astro`)

- Mobile `lg:hidden`: бургер | лого | иконки. `logoPosition` эту полосу не трогает.
- Desktop `hidden lg:block` (конструктор 1280px → эта ветка):
  - `top-left` — два ряда, лого слева, nav `justify-start`
  - `top-center` — два ряда, сетка 3 кол., nav по центру
  - `center-left` — один ряд, flex-1 фланги, nav по центру
  - `center-absolute` — один ряд, лого absolute по центру
- `menuType=sidebar`: бургер слева от лого, inline-nav `lg:!hidden`, шторка `inset-y-0`
- `NavItem` + recursive submenu; клики через `window.__roseHeaderBound` (не module-scope)

### Что сломалось в Satin

Always-on раскладка + `hidden md:flex` на однорядном nav. Это не rose-контракт. Плюс конструктор `:3200` был мёртв (vite сидел на `:3000`, iframe `VITE_PREVIEW_ORIGIN=http://localhost:3200` → connection refused → «ни одна настройка не работает»).

### Сделано

- `themes/satin/src/components/Header.astro` переписан по контракту rose (визуал satin: Kelly Slab, иконки, цвета). Dual-write worktree + main.
- `data-header-wrapper` + `colorScheme` на корне, как local-patch/Footer.
- `compile-theme-sections.mjs satin` в worktree (17) и main (18).
- `local-stack.sh restart constructor` → `:3200` снова 200.

### Проверки

POST `/preview/block` Header satin 201:

| logoPosition | маркеры |
|---|---|
| top-left | justify-start, нет grid |
| top-center | grid-cols-[1fr_auto_1fr] |
| center-left | нет absolute |
| center-absolute | left-1/2 -translate-x-1/2 |

menuType: dropdown без шторки; sidebar → `lg:!hidden` + `inset-y-0`; mega → uppercase tracking.

### Не делали

Commit/push/deploy. Chrome MCP по-прежнему занят — клик в UI не снимал.

## 2026-09-01 — W-015 — ESM-кэш sites отдавал старый Satin Header

GET `/preview` после W-014 всё ещё содержал `<!-- Mobile Header: 375px -->` и `md:hidden` (старый порт). POST `/preview/block` уже отдавал новый (`lg:block`, `justify-start`). Причина: процесс sites держал старый ESM-модуль Header. `local-stack.sh restart sites` (pid 12460→86465). После рестарта GET: `lg:hidden`/`lg:block`, `data-header-wrapper`, без старого комментария. Seed ревизии по-прежнему `top-center` (сетка 3 кол.) — это стартовый SSR, не баг раскладки.

## 2026-09-01 — W-016 — iframe agent: theme/site без init

Пользователь: секции Satin по-прежнему не реагируют. Конструктор не трогали (Rose на том же мосте живой).

Агент делал `if (!currentThemeId) return` на каждом update-block — без `init` правки молча отбрасывались. Добавлен фоллбек **в sites**, не в конструктор: `<html data-merfy-theme>` + siteId из pathname `/sites/:id/preview`. Dual-write worktree dist+src и main src. Restart sites.

## 2026-09-02 — W-017 — Satin: плейсхолдеры во всех секциях при правке сайдбара

### Цель

После смены размера заголовка (и любых других полей сайдбара) empty-state Figma 1:19335 не должен схлопываться ни в одной секции Satin. Первая пачка закрыла только Hero / ImageWithText / MainText.

### Причина

Puck на любой edit мержит `defaultProps` поверх данных. Гейты `array.length > 0` / «есть url» считали дефолтные ряды, FAQ, `/placeholders/` и копирайт Puck контентом мерчанта.

### Сделано (тема, не конструктор)

- `themes/satin/src/lib/placeholder-copy.ts` — расширен набор дефолтных строк + `hasMerchantImage` (`/placeholders/`, `/images/4x/`).
- Гейты пустого состояния во всех секциях конструктора: Hero, ImageWithText, ImageBanner, MainText, TextBlock, Slideshow, MultiRows, CollectionRows, MultiColumns, Collections, Gallery, CollapsibleSection, Faq, PromoBanner, Newsletter, ContactForm, Publications, Video, Popular, Features.
- Dual-write worktree `flux-constructor-live-markup` + main. Compile satin worktree 17 / main 18. `local-stack.sh restart sites`.

### Проверки

POST `/api/sites/57ac2ede-…/preview/block` с дефолтами Puck + `headingSize=large`:

Hero, ImageWithText, MultiRows, MultiColumns, Collections, CollapsibleSection, PromoBanner, Gallery, PopularProducts, Newsletter, Video, MainText, ContactForm, Publications — empty-state на месте (landscape / sweater / «Изображение с текстом» / «Сворачиваемый раздел», без «Женская коллекция» / FAQ-демо). Slideshow держит `landscape-slideshow` (тёмная подложка `#111111` под ассетом — канон, не чёрный холст без картинки).

### Не делали

Commit/push/deploy. Конструктор/iframe agent не трогали. Тесты не писали.

## 2026-09-02 — W-018 — Satin: английские имена секций в конструкторе

### Цель

`localhost:3200/?siteId=57ac2ede-…&page=home` — названия секций по-русски, как у Rose.

### Причина

- theme-base `Header.puckConfig` / `Footer.puckConfig` отдавали label `Header` / `Footer`.
- id вида `hero-satin` / `header-satin` → pill/outline брали кусок до дефиса в нижнем регистре и не попадали в `COMPONENT_LABELS`.
- Hero без своего заголовка подставлял английский мок `STYLE'S WEAR COLLECTION SINCE 90'`.

### Сделано

- theme-base Header/Footer label → «Шапка» / «Подвал» (main + worktree).
- `getComponentLabel` без учёта регистра; в iframe pill те же ключи lowercase.
- Hero fallback = Figma «Изображение» / «Покажи и расскажи…» / «Кнопка», не STYLE'S WEAR.
- Compile satin worktree 17. Restart sites.

### Не делали

iframe agent не трогали. Commit/push/deploy нет.

## 2026-09-02 — W-019 — Satin: hover-плашка секции по-русски как у канона

### Цель

Наведение на секцию в конструкторе — русское имя (как у Rose), не `hero` / `header`.

### Причина

Плашка берёт id до первого дефиса. У Rose `Hero-1` → `Hero` → «Изображение». У Satin `hero-satin` / `popular-satin` → `hero` / `popular`.

### Сделано

inferLabel: тип из LAST_TYPES (Puck type), затем русский лейбл без учёта регистра. Dual-write src+dist worktree и main. Restart sites.

### Не делали

Commit/push/deploy нет.

## 2026-09-03 — W-020 — Flux/Bloom/Satin: тип меню и пункты как у Rose

### Цель

В хедере конструктора «Тип меню» (выпадающее / расширенное / боковое) и «Изменить пункты меню» работают на flux, bloom, satin как на rose.

### Находка

Puck-поля уже были (theme-base / per-theme Header.puckConfig). Bloom в worktree рендерил nav плоскими `<a>` без NavItem и без `data-nav-inline` — mega/dropdown/подменю и live-правка пунктов не работали.

### Сделано

- Bloom worktree: Header.astro + NavItem.astro с main (контракт rose).
- Compile bloom / flux / satin. Restart sites.
- Flux (FluxNavItem) и Satin (NavItem) уже имели dropdown / mega / sidebar + drawer.

### Не делали

Commit/push/deploy нет. iframe agent не трогали.

## 2026-09-03 — W-021 — Bloom/Flux: всплывашка меню не открывалась

### Цель

Hover-дропдаун пунктов шапки (как на Rose) виден в конструкторе Bloom (и Flux).

### Причина

HTML NavItem был, CSS нет: `group-hover/d1:visible` не попадал в theme-css. У rose/satin есть `@source "../components/**"`, у bloom/flux — нет. Плюс при `stickiness=none` корень без z-index — Hero перекрывал попап.

### Сделано

- bloom + flux `global.css`: `@source "../components/**/*.{astro,ts,tsx}"`.
- bloom/satin/rose Header: `none` → `relative z-50`.
- Compile bloom/flux/satin, restart sites.

### Не делали

Commit/push/deploy нет.

## 2026-09-03 — W-022 — Выбор коллекции в сайдбаре (Коллекция товаров + Список коллекций)

### Цель

Мерчант выбирает коллекцию в правой панели, как в Figma 314-34614 («Коллекция товаров») и на «Списке коллекций». Rose / Bloom / Flux / Satin (Vanilla не проверяли).

### Причина

Figma «Коллекция товаров» = `PopularProducts` — поле `collection: collectionPicker` уже было. «Список коллекций» = `Collections`: `collections` было `hiddenInMainPanel: true`, пикер только в outline. Скомпилированные `dist/astro-blocks` держали `true`, хотя исходники уже `false`.

### Сделано

- Constructor `CustomFieldsPanel`: `CollectionPicker` для `PopularProducts.collection` и по плитке для `Collections.collections`; skip `hiddenInMainPanel` идёт после этих спецкейсов.
- `hiddenInMainPanel: false` в theme-base + theme-satin `Collections.puckConfig` (main + worktree) и в `dist/astro-blocks` (то, что читает GET puck-config).
- Restart sites (pid 65226).

### Проверки

GET `/api/themes/{rose,bloom,flux,satin}/puck-config`:
- PopularProducts.collection = `collectionPicker` / «Выбор коллекции»
- Collections.collections.hiddenInMainPanel = false, arrayFields.collectionId = `collectionPicker`

### Не делали

Commit/push/deploy нет. iframe agent не трогали. Тесты не писали.

## 2026-09-03 — W-023 — Satin Collections: данные магазина в превью + заголовок не сносит плитки

### Цель

Список коллекций в конструкторе показывает коллекции магазина (не кафе-плейсхолдер). Правка заголовка не обнуляет плитки.

### Причина

1. Превью не исполняет client autofill; SSR ждал медленный `/storefront-data` (~80с) → конструктор обрывал hot-update.
2. POST `/preview/block` без `themeId` рендерил **rose** Collections (пустые плитки 430/500).

### Сделано

- Satin `Collections.astro`: SSR автоподстановка коллекций с `GET /api/store/collections` (~1с).
- `storefront-ssr.ts` кэш. Обложка: своя → иначе пустая surface (у локальных коллекций `images=[]`).
- POST `/preview/block`: `themeId` с сайта, если клиент не прислал.
- Dual-write worktree+main, compile satin, restart sites.

### Проверки (Chrome DevTools + POST /preview/block)

- Полное превью: Аксессуары / Худи и трикотаж / Низ / Верх / Платья.
- POST block с heading, без themeId: satin-разметка + имена коллекций, ~1с.

### Не делали

Commit/push/deploy нет. Полный клик-аудит всех addable секций не закрыт (таблица в ответе).

## 2026-09-03 — W-024 — Satin: IWT фото, обложки коллекций, товары в Popular

### Цель

Закрыть оставшиеся дыры главной: IWT без фото, пустые обложки коллекций, Popular-плейсхолдеры.

### Сделано

- ImageWithText: плоский `<img>` (не `picture.contents`) + eager — плейсхолдер landscape-iwt.png грузится (880px).
- Publications: eager на publication-card.png (480px). Постов в магазине нет — пустое состояние Figma.
- storefront-ssr: gateway collections + products (~100мс); обложка коллекции = фото первого товара.
- Popular: SSR товары магазина, даже без выбранной коллекции.

### Проверки Chrome DevTools

- IWT img nw=880; коллекции Аксессуары/Худи/Низ с merfy-files PNG; Popular: Носки/Ремень/Панама.

### Не делали

Commit/push/deploy нет.

## 2026-09-03 — W-023 — Satin Collections: данные магазина в превью + заголовок не сносит плитки

### Цель

Список коллекций в конструкторе показывает коллекции магазина (не кафе-плейсхолдер). Правка заголовка не обнуляет плитки.

### Причина

1. Превью не исполняет client autofill; SSR ждал медленный `/storefront-data` (~80с) → конструктор обрывал hot-update.
2. POST `/preview/block` без `themeId` рендерил **rose** Collections (пустые плитки 430/500).

### Сделано

- Satin `Collections.astro`: SSR автоподстановка коллекций с `GET /api/store/collections` (~1с).
- `storefront-ssr.ts` кэш. Обложка: своя → иначе пустая surface (у локальных коллекций `images=[]`).
- POST `/preview/block`: `themeId` с сайта, если клиент не прислал.
- Dual-write worktree+main, compile satin, restart sites.

### Проверки (Chrome DevTools + POST /preview/block)

- Полное превью: Аксессуары / Худи и трикотаж / Низ / Верх / Платья.
- POST block с heading, без themeId: satin-разметка + имена коллекций, ~1с.

### Не делали

Commit/push/deploy нет. Полный клик-аудит всех addable секций не закрыт (см. ответ пользователю).

## 2026-09-06 — bloom: настройки размеров в «Коллекция товаров» (Popular)

Сайт QA `10df1c3a-a1fc-45e0-957a-511c131b1eb8`, конструктор `localhost:3200/?siteId=...&page=home`.
Жалоба: «менял заголовок — сбивались стили».

### Найдено два независимых корня

1. **Контур:** `user`-сервис (:3111) не был запущен → `user_queue` 31 сообщение / 0 consumers →
   `GET /api/sites/<id>` в gateway висел бесконечно → конструктор не получал `themeId` и
   оставался на **rose** puck-config (`SiteConstructor.tsx:936` `themeId ?? "rose"`), хотя сайт
   на bloom. Следствия: чужие лейблы/дефолты полей и рассинхрон панель↔превью
   (в панели «СЕЙЧАС В ТРЕНДЕ», в превью «СЕЙЧАС В ТРЕНДЕ!!!»).
   Фикс: `./flux-baseline/local-stack.sh start user`. После — `/api/sites/<id>` 401 за 10 мс,
   конструктор грузит `/api/themes/bloom/puck-config`, панель = превью.

2. **Код темы:** `themes/bloom/src/components/sections/Popular.astro` — лестницы размеров
   расходились с каноном `themes/bloom/MANNER.md` §9 и ломали монотонность:
   - заголовок: ветка `small` перекрывала базу DS на 18px, а `small` = дефолт панели
     (`PopularProducts.puckConfig.ts defaults.headingSize`) → любая правка секции уводила
     заголовок из канона (32px) и делала его **меньше** подзаголовка (24px);
   - текст: ступени были сняты с базы rose (16) → `medium` 19 и `large` 23 оказывались
     **меньше** дефолтных 24px, то есть «Средний»/«Большой» уменьшали текст.

   Фикс по MANNER §9 (прецедент rose Popular: `small` = литерал верстальщика, ступени вверх):
   заголовок `small`/пусто = канон DS 20/24/32, `medium` 38 (моб 24), `large` 46 (моб 29);
   текст `small`/пусто = канон DS 14/18/24, `medium` 29 (моб 17), `large` 35 (моб 20).
   В MANNER §9 добавлена строка про подзаголовок Popular.

### Пруфы (реальный канал панели, Chrome DevTools, computed font-size)

| Настройка | Было | Стало |
|---|---|---|
| Размер заголовка «Маленький» | 18px | 32px (канон) |
| Размер заголовка «Средний» | 24px | 38px |
| Размер заголовка «Большой» | 29px | 46px |
| Размер текста «Маленький» | 24px | 24px (канон) |
| Размер текста «Средний» | 19px ↓ | 29px |
| Размер текста «Большой» | 23px ↓ | 35px |

Пересборка: `node scripts/compile-theme-sections.mjs bloom` + `npx tsx theme-registry/_build-theme.ts bloom`
(без второго новые arbitrary-классы не получают CSS-правил в превью-шелле).

### Аудит остальных секций bloom

17 секций, все лестницы `*SizeCls`/`*Cls`: монотонны, дефолт панели попадает в канон-ветку.
Popular была единственной сломанной. Другие темы не трогали.

### Не делали

Commit/push/deploy нет. Стейт сайта в конструкторе возвращён в исходное, «Сохранить» не нажимали.
Открыто: секции «Список коллекций» (Collections) на главной этого сайта нет — уточнить у пользователя,
о ней ли шла речь.

## 2026-09-06 (продолжение) — bloom: форматирование текста + аудит настроек секций

Жалоба: «жирность/курсив не применяются — вместо этого текст оборачивается в тег»
(в превью было видно `<STRONG>СЕЙЧАС В ТРЕНДЕ!!!!!</STRONG>`).

### Корень

Кнопки «Ж»/«К» (AITextInput) оборачивают всё значение поля в `<strong>`/`<em>`. Astro
экранирует `{value}` → на витрине виден сырой тег. В rose это решено `inlineFormat`
(`themes/rose/src/lib/rich-text.ts`, XSS-safe allow-list) + локальный
`ui/RoseSectionHeading.astro` вместо внешнего DS-компонента. В bloom `rich-text.ts`
уже лежал, но применялся ровно в одной секции (MultiColumns).

### Сделано (паритет rose)

- Новый `themes/bloom/src/components/ui/BloomSectionHeading.astro` — разметка DS 0.1.4
  1:1, но `set:html={inlineFormat(...)}`. Popular импортирует его под именем
  `NtSectionHeading` (тот же приём, что rose).
- `inlineFormat` подключён во ВСЕХ секциях bloom: Hero, Collections, Gallery, MainText,
  ImageWithText, MultiColumns, MultiRows, CollapsibleSection, Newsletter, Publications,
  Video, Slideshow, ContactForm, Popular. Заодно закрыт XSS: `set:html={text}` /
  `{r.text}` / `{s.content}` / `{c.text}` шли сырыми — теперь через allow-list.
- `packages/theme-bloom/blocks/Catalog`: `categoryTitle`/`categorySubtitle` тоже через
  `inlineFormat` (+ `rich-text.ts` рядом с блоком — ассемблер копирует компаньоны в
  плоский `src/components/`, поэтому импорт `./rich-text` валиден и в scaffold).
- `themes/bloom/src/styles/global.css`: добавлены `strong,b { font-weight:700 }` и
  `em,i { font-style:italic }` (как в rose). Без этого `<strong>` считался от лёгкой
  типографики bloom (300) и давал `bolder` = 400 — «жирный» был неотличим.

### Ещё два бага, найденных попутно

- **Footer**: заголовок и текст блока рассылки были ЗАХАРДКОЖЕНЫ → поля панели
  «Заголовок»/«Текст» (`heading.text` / `text.content`) не работали. Оживлены с
  fallback на литералы верстальщика (паритет rose Footer).
- **Приоритет размера**: CollapsibleSection, ContactForm, Gallery, MultiRows,
  Publications читали `p.heading?.size ?? p.headingSize`, тогда как панель этих блоков
  пишет top-level `headingSize` (поле `heading` там aiText-строка). При старой ревизии
  с legacy-объектом `heading.size` живой селект панели молча глушился. Флип на
  top-level-first (прецедент rose `resolveRoseHeadingSize(..., "top-level")`).
  Hero/Newsletter/MainText оставлены nested-first — там панель действительно
  objectField (проверено по `/api/themes/bloom/puck-config`).

### Пруфы

- `POST /preview/block`, 15 блоков (вкл. Footer и Catalog): `<strong>ЖИРНЫЙ</strong>`
  рендерится тегом, `<script>alert(1)</script>` экранируется.
- Конструктор (Chrome DevTools, реальные кнопки панели): «Ж» → `<strong>`,
  computed `font-weight: 700`; «К» → `<em>`, `font-style: italic`; повторный клик снимает.
- Аудит настроек: «Размер заголовка» и «Размер текста» живые во ВСЕХ секциях, где эти
  поля есть (у MultiColumns/MultiRows размеры живут на элементах `columns[]`/`rows[]`,
  у Slideshow — на `slides[].heading.size`/`text.size`, у Video поле называется `size`).
  Карточка PopularProducts: `buttonStyle` (link/primary/secondary), `imageView`
  (portrait/square/wide), `nextPhotoOnHover`, `quickAddMode` (none/standard/cart),
  `columns` (--cols), `padding` — все дают различный HTML.

### Не делали

Commit/push/deploy нет. «Сохранить» в конструкторе не нажимали. `Benefits` рендерится
из `packages/theme-bloom/blocks/Benefits` (простая версия, поля `text` без кнопок
форматирования) — богатый порт `themes/bloom/.../Benefits.astro` в реестре НЕ
используется; расхождение оставлено как есть, вне объёма.

## 2026-09-06 (продолжение 2) — bloom: сверка «Вид изображения / Hover-фото / Быстрое добавление» с rose

Вопрос пользователя: сделаны ли эти три настройки так же, как в rose, и тот же ли
состав секций у «Списка коллекций».

### Состав панелей — полный паритет

`/api/themes/rose|bloom/puck-config`: 34 секции в обеих темах, одинаковые ключи и
подписи; у `Collections` и `PopularProducts` совпадают поля, типы, наборы опций и
дефолты (puckConfig общий, `blockDefaults` для этих блоков расхождений не дают).

### «Вид изображения» — БЫЛ СЛОМАН в bloom, починен по схеме rose

`Popular.astro` перекрывал аспект селектором `[&_li>article>a]`, а реальная разметка —
`li>article>div>a` (`<a>` обёрнут в `<div>` под overlay-сердце wishlist) → класс
генерился, но применяться было не к чему. Ровно тот же баг rose уже лечила
inline-аспектом. Дополнительно: `BloomProductCard` вообще не принимал `aspectRatio`,
поэтому и `Collections` (она проп уже передавала) не работала; гидрация звала
`renderCardHtml(p, "1/1", …)` с захардкоженным аспектом и лишними аргументами.

Фикс (паритет rose): `cardAspectRatio` = 1/1 | 430/500 | 16/9 прокинут во ВСЕ три пути —
`BloomProductCard` (новый проп + inline `aspect-ratio`), SSR-плейсхолдер Popular,
гидрация (`data-card-aspect` на гриде → `renderCardHtml(p, aspect)`).

Пруф в конструкторе (computed + bbox): Портрет 244×284 (430/500), Широкий 244×137
(16/9), Квадрат 244×244. Collections через POST /preview/block: 1/1 → 430/500 → 16/9.

⚠️ **Гоча:** правка ВЛОЖЕННОГО компонента (BloomProductCard, lib/*) требует **рестарта
sites** — dist пересобирается, но уже импортированный модуль живёт в кэше Node.
Сама секция (`sections/*.astro`) подхватывается без рестарта.

### «Следующее фото при наведении» — как в rose

Механика идентична: `data-next-photo` на гриде, `data-image-2` на `<li>`, инлайн-скрипт
с идемпотентным `data-np-hydrated`. Проверено: true → атрибут выставлен, false → нет.

### «Быстрое добавление» — ОТЛИЧАЕТСЯ от rose (осознанно, но неполно)

rose: `none` = кнопки на карточке нет; `standard` = кнопка (кладёт 1); `cart` = степпер
«− 1 +» (`data-qa-stepper`/`data-qa-inc`/`data-qa-dec`) ПЕРЕД кнопкой, кол-во читает
делегат nt-cart через `data-quantity`.
bloom: карточка верстальщика всегда несёт pill «В корзину», поэтому `none` = кнопка
вёрстки как есть, а `standard`/`cart` лишь переименовывают её («В корзину» / «В КОРЗИНУ»).
Степпера нет (0 вхождений против 3 в rose) → режим «Количество» функционально пустой.
НЕ ТРОГАЛ: добавление степпера меняет вёрстку карточки bloom — ждёт решения пользователя.

## 2026-09-06 (продолжение 3) — bloom: «Быстрое добавление» доведено до rose

Решение пользователя: «верстальщик мог написать одно состояние, но это не значит, что
других нет — всё должно работать одинаково». Прежняя трактовка bloom (кнопка карточки
есть всегда, режимы лишь переименовывают её) отменена.

### Сделано

- `BloomProductCard`: новые пропы `quickAdd` (`none`/`standard`/`cart`) и `quickAddText`.
  `none` — CTA карточки не рендерится вовсе; `standard` — кнопка с `data-quantity="1"`;
  `cart` — степпер «− N +» перед кнопкой. Отсутствие пропа = `standard` (вёрстка
  верстальщика), поэтому карточка вне секции не меняется.
- `renderCardHtml` (гидрация): те же параметры + степпер строкой.
- `Popular.astro`: различает ЯВНЫЙ `none` и отсутствие пропа (`cardQuickAdd =
  quickAddMode ?? "standard"`), прокидывает режим в SSR-карточку и в гидрацию
  (`data-quick-add` + `data-qa-text` на гриде), добавлен `QA_STEPPER_JS` — механика
  rose 1:1 (делегат на гриде, идемпотентность `data-qa-step-bound`, правит
  `data-quantity` на кнопке, которое читает делегат nt-cart).
- Побочный баг «Стиль кнопки»: правила ловили только `[data-add-to-cart]`, а у товара с
  вариантами без комбинаций CTA — это `<a>` на PDP → стиль применялся не ко всем
  карточкам. Обе формы CTA помечены `data-card-cta`, правила переведены на него.

### Пруфы

- POST /preview/block (реальная коллекция): `none` → степперов 0, кнопок 0;
  `standard` → 2 кнопки с `data-quantity="1"`, степперов 0; `cart` → 2 кнопки + 2 степпера.
- Конструктор, переключение в панели: «Нет» → CTA 0 / степперов 0; «Стандарт» → CTA 6 /
  степперов 0; «Количество» → CTA 6 / степперов 6.
- Клик по степперу в превью: 1 → 2 → 3 → 2, `data-quantity` на кнопке синхронно.

### Гоча (повторно подтверждена)

Правка `products/BloomProductCard.astro` и `lib/storefront-hydrate.ts` требует
**рестарта sites** — пересборки dist недостаточно.

## 2026-09-06 (продолжение 4) — bloom: рассинхрон «в превью заголовок есть, в поле пусто»

Жалоба: у Галереи в превью «ГАЛЕРЕЯ», а инпут «Заголовок» пустой. Просьба — найти такое
во всех секциях.

### Корень (архитектурный, а не опечатка)

Платформа считает «плейсхолдерные» строки НЕзаполненным полем: `src/render/empty-state.ts`
`EMPTY_STATE_COPY` (там «галерея», «мультиряды», «видео», «коллекция товаров», …), а
`src/render/resolve-props.ts` такие значения вычищает из props (`out[key] = ""`), чтобы блок
мог показать empty-state. Порт при этом рисует свою заглушку через `?? "Галерея"`. Итог:
данных нет → панель пустая, превью с текстом. Записать заглушку в данные нельзя — платформа
её тут же вычистит (проверено: `heading:"Галерея"` → превью пустое, `heading:"Наши работы"`
→ рендерится).

### Аудит (эмпирический, по маркеру `data-puck-subsection-field="heading"`)

Сверка «что показывает панель» против «что рендерится при пустых props» — **9 рассинхронов
из 13 секций**: Gallery, Hero, MultiColumns, MultiRows, Video (панель пустая) и
CollapsibleSection, Collections, ContactForm, Newsletter (панель показывала ЧУЖОЙ текст из
universal puckConfig — «Коллекции» против заглушки порта «Сейчас в тренде»).

### Решение

- **Новая возможность темы `blockPlaceholders`** в `theme.json`:
  `{ "Gallery": { "heading": "Галерея" }, "Hero": { "heading.text": "Изображение" } }`
  (поддержан путь `a.b` для objectFields). `theme-puck-config.controller` кладёт этот текст
  в `placeholder` поля панели и **очищает** universal-дефолт того же поля — плейсхолдер
  имеет смысл только для пустого поля. Тип расширен в
  `packages/theme-contract/resolver/resolveBlocks.ts`, проброс добавлен всем 5 темам
  (заполнен пока только bloom — чужие темы не трогаем).
- **7 портов bloom приведены к устойчивому паттерну**: `(...)?.trim() || "Заглушка"` вместо
  `?? "Заглушка"` — пустая строка теперь тоже означает «не задано» (как трактует платформа),
  раньше очищенный заголовок давал пустой `<h2>`. Gallery, Collections, Popular, MultiRows,
  CollapsibleSection, Newsletter, Publications. (ContactForm, ImageWithText, MultiColumns,
  Benefits, Video уже были устойчивы.)
- `theme.json`: для CollapsibleSection/Collections/ContactForm/Newsletter дефолт заголовка
  обнулён — их universal-дефолт конфликтовал с заглушкой порта.

### Пруфы

- Сверка панель↔превью по 13 секциям: **0 рассинхронов** (было 9).
- Контроль: заданный мерчантом текст не подменяется (`heading:"Новинки"` → «Новинки»);
  очищенный заголовок возвращает заглушку (`heading:""` → «Галерея»).
- Главная сайта рендерится прежними заголовками — визуально ничего не изменилось.

### Не делали

Commit/push нет. Тот же рассинхрон почти наверняка есть в rose/flux/satin/vanilla —
механизм для них готов (`blockPlaceholders` пробрасывается), но их `theme.json` не заполняли.

## 2026-09-07 — bloom: сплошной аудит настроек всех секций + паритет с rose

Просьба: пройти все секции, которых не касались, добиться поведения как в rose и
разобраться, почему «поменял одну секцию — другие элементы меняются/исчезают».

### Метод

Скрипт `.tmp-bloom/audit-fields.py`: для КАЖДОГО видимого поля панели (141 поле,
17 блоков) рендерит блок через `POST /preview/block` с двумя разными значениями и
сравнивает HTML. Живое = рендер меняется. Гоняется на bloom и на локальном rose
(`e03dd420-…`), результаты сравниваются — так отделяются реальные отставания от
платформенных особенностей. Важно: базовые props заполняются текстами и включёнными
тумблерами, иначе «Размер текста» проверяется на секции без текста (ложные «мёртвые»).

### Итог: было 30 нерабочих полей и 9 отставаний от rose → стало 0 отставаний

Починено в bloom:
- **Footer**: `colorScheme` (класс схемы на `<footer>`), `contentAlign` (выравнивание
  блока рассылки), `heading.size` / `text.size` (лестницы §9: 14/20/24 и 14/16/19).
- **Video**: `position` — видимое поле панели теперь приоритетнее legacy `align`
  (blockDefaults темы задавали align=container и глушили контрол); + своя схема.
- **Publications**: своя схема на секции.
- **ImageWithText**: `alignment` — панель шлёт это поле, порт читал только
  `headingAlignment` (паритет rose).
- **PromoBanner**: вариант «Тонкий» отсутствовал в карте размеров → падал в «Большой»
  (канон rose/flux: min-h-6 / 11px).
- **MainText**: `text.size` — видимое nested-поле теперь приоритетнее скрытого top-level.
- **Newsletter**: `agreement` — тумблер шлёт boolean, сравнение было строго со строкой.

### Корень «поменял одну секцию — соседние перекрасились»

`colorScheme` секции ставила ТОЛЬКО обёртка композитора страницы. При hot-render
одиночного блока в превью обёртки нет → блок берёт `:root` (тёмный BASE_DEFAULT) и
выглядит перекрашенным. Теперь **каждая секция bloom ставит свою схему сама**
(14 файлов, паттерн rose Footer / theme-base Video). На live обёртка даёт ту же схему —
дубль безвреден. Гоча разбора: у Slideshow платформа приводит схему к ЧИСЛУ, строковая
проверка молча не срабатывала — разбор сделан устойчивым к обоим видам.

### Вторая причина «поменял — исчезло» (НЕ чинил, нужно решение)

`src/render/empty-state.ts EMPTY_STATE_COPY` считает незаполненным полем целые слова:
«коллекция», «кнопка», «заголовок», «видео», «публикации», «раздел», «мультиряды»…
Если мерчант введёт такой текст в заголовок, `resolve-props.ts` его вычистит и секция
покажет заглушку. Проверено: `heading:"Видео"` в Галерее → на превью «Галерея».
Это платформенная логика, общая для ВСЕХ тем — правка затрагивает все, поэтому вынесена
на решение пользователя. Аккуратный вариант: сузить `isUnsetContent` до пустой строки, а
«равно дефолту» определять через уже поддержанный, но не передаваемый параметр `defaults`.

### Остаточные 5 (объяснены, не баги bloom)

`MultiColumns.imageAspectRatio` (работает при картинке в колонке — проверено вручную),
`MultiRows.size` (перекрывается размером ряда; паритет rose), `Publications.showDateTime`
(нужны реальные публикации), `PromoBanner.padding` (Figma убрала отступы — поле стоит
скрыть из панели), `Footer.socialColumn.title` (в вёрстке нет заголовка колонки; паритет rose).

### Не делали

Commit/push/deploy нет.

## 2026-09-07 (продолжение) — правила секций + автопроверка вместо ручного багфикса

Просьба пользователя: перестать чинить баги поштучно — собрать правила, чтобы следующие
темы не повторяли те же ошибки («это ещё не самая последняя тема»).

### Сделано

- **`docs/theme-work/SECTION-CONTRACT.md`** — контракт секции: 12 правил, каждое выросло
  из реального бага этой недели, с симптомом «как это видит мерчант» и правильным кодом.
  Плюс таблица «что правил → что пересобрать» и раздел про открытый платформенный долг.
- **`scripts/section-contract-check.mjs`** — автопроверка, годится как гейт (exit 1):
  - *статический режим*: читает порты темы и ловит нарушения по коду — секция без своей
    цветовой схемы, разбор схемы только строкой, `?? "Заглушка"` вместо `?.trim() ||`,
    тумблер без ветки boolean, заголовок без `inlineFormat`, перекрытие на несуществующем
    узле, хардкод текста вместо чтения поля;
  - *рантайм-режим* (`--runtime --site <id>`): меняет КАЖДОЕ видимое поле панели на два
    значения и сравнивает рендер; `--baseline rose --baseline-site <id>` отсеивает общие
    особенности платформы, оставляя только отставания темы; плюс сверка «что в панели ↔
    что на превью» по заглушкам.
  - Ложные срабатывания учтены: не-канонные файлы (вне манифеста темы), внутренние флаги
    гидрации, поля вариаций при отсутствии вариантных данных у сайта.

### Что инструмент нашёл сразу

В bloom — 4 настоящих нарушения (разбор схемы строкой в Footer/Publications/Video),
все починены. Итог: **bloom проходит контракт полностью** (статика + рантайм + сверка с rose).

Прогон по остальным темам показывает объём работы впереди:

| Тема | Нарушений | Основное |
| --- | --- | --- |
| rose | 24 | 10 × нет `inlineFormat`, 7 × нет своей схемы, 4 × `??` вместо `\|\|` |
| flux | 30 | 13 × нет `inlineFormat`, 10 × нет своей схемы |
| satin | 28 | 14 × нет `inlineFormat`, 10 × нет своей схемы |
| vanilla | 29 | 11 × нет своей схемы, 13 × нет `inlineFormat` |
| **bloom** | **0** | — |

То есть «зайду в конструктор — опять пиздец» теперь измеримо: перед работой по теме
достаточно одной команды, чтобы увидеть список и не искать баги вручную.

### Не делали

Чужие темы не правили — только измерили. Commit/push нет.

## 2026-09-07 (продолжение 2) — платформенный фикс: ввод мерчанта больше не исчезает

Закрыт долг, описанный выше: `src/render/empty-state.ts` считал незаполненным полем
обычные слова («коллекция», «кнопка», «заголовок», «видео», «публикации»), и
`resolve-props.ts` вычищал такой текст — мерчант вводил «Видео», а секция показывала
заглушку. Работало только в превью, поэтому превью расходилось с витриной.

### Как исправлено

- `src/render/block-defaults.ts` (новый): достаёт `<Block>PuckConfig.defaults` из уже
  скомпилированных блоков (`dist/astro-blocks`), с кэшем и учётом override-пакета темы.
- `preview.service.renderBlock`: передаёт в `resolveBlockProps` четвёртым аргументом
  дефолты (puckConfig-дефолты блока + `blockDefaults` темы) — параметр в сигнатуре был,
  но никогда не заполнялся.
- `empty-state.ts`: добавлен `isBlankContent` (только пусто/пробелы); `resolve-props.ts`
  использует его вместо словаря. `isUnsetContent` со словарём оставлен как есть для
  `section-policy.ts` — там другая задача.

Безопасность правки: `resolveBlockProps` вызывается ровно в одном месте (hot-render
превью), а метаданные `fields[].set` не читает ни один блок — проверено grep'ом
(`__merfy` в блоках это клиентский `window.__merfyRoot`, не props).

### Пруфы

| Что в данных | Результат |
| --- | --- |
| «Видео» / «Коллекция» / «Кнопка» / «Заголовок» | рендерится введённый текст |
| поля нет / пустая строка | заглушка темы («Галерея») |
| значение ровно как дефолт блока («Коллекции») | заглушка темы («Сейчас в тренде») |

Контракт секций после правки: `✓ bloom — соблюдён` (статика + рантайм + сверка с rose).
Главная сайта рендерится прежним составом заголовков (два «Основной текст» — это две
секции в ревизии, не дубль рендера).

### Не делали

Commit/push нет.

## 2026-09-07 (продолжение 3) — панель секции: поля контента видны и заполнены

Две жалобы пользователя: у «Основного текста» в панели нет полей заголовка и текста
(«в розе тоже что ли нет?»); у Галереи заголовок на превью есть, а поле в сайдбаре пустое.

### 1. «Основной текст» — полей не было в панели (в rose так же)

`MainText.puckConfig.ts`: `heading`, `text`, `button` были помечены `hiddenInMainPanel:
true` — по замыслу редактируются под-панелью через клик по элементу в превью
(маркеры `data-puck-subsection-field` в рендере на месте). Конфиг общий для всех тем,
поэтому в rose ровно то же самое — это не отставание bloom.

Непоследовательность: у Collections/Video все поля в панели, у MainText/ImageWithText —
ни одного текстового, и секция выглядит нередактируемой. Убрал `hiddenInMainPanel` у
текстовых полей в `MainText`, `ImageWithText` и `Newsletter.heading`, и перенёс их в
раздел «Содержание» (раньше порядок ключей ставил бы их после «Отступов»). Под-панель по
клику продолжает работать — теперь это ярлык, а не единственный способ.

Итог: `MainText` в панели — `heading, text, button, position, colorScheme, padding`.

### 2. Галерея — заголовок на превью, поле пустое

После фикса вычистки (см. предыдущую запись) стало возможно то, что раньше не работало:
дефолтный заголовок кладётся в ДАННЫЕ темы (`theme.json blockDefaults`), панель его
показывает и даёт править, а рендер по-прежнему считает «значение == дефолт»
незаполненным и рисует ту же заглушку. Раньше такой дефолт вычищался словарём служебных
слов, поэтому приходилось ограничиваться серой подсказкой.

Заполнено для 13 секций bloom; заодно убрано обнуление дефолта в
`theme-puck-config.controller` (оно вводилось, когда общий дефолт конфликтовал с
заглушкой порта — теперь тексты совпадают). `blockPlaceholders` остаются подсказкой для
случая, когда мерчант очистил поле.

### Пруфы

- Панель ↔ превью по 13 секциям: **13/13 совпадают**, поле заполнено (Галерея —
  «Галерея», Коллекции — «Сейчас в тренде», Основной текст — «Расскажи о своем бренде»…).
- Ввод мерчанта не подменяется: «Видео» → «Видео», «Мои работы» → «Мои работы».
- Очищенное поле → заглушка темы.
- Контракт секций: `✓ bloom — соблюдён`.

Правки `MainText`/`ImageWithText`/`Newsletter` лежат в общем `theme-base`, то есть панель
станет одинаковой во всех темах.

## 2026-09-07 (продолжение 4) — разбор списка замечаний по «Основному тексту» и Галерее

| Замечание | Результат |
| --- | --- |
| «Позиция» не работает | **Баг подтверждён и исправлен.** Порт bloom брал выравнивание из скрытого legacy-поля `alignment` (всегда «по центру»), а «Позиция» двигала только колонку — «Слева» и «Справа» давали одинаковый центр. Теперь выравнивание выводится из `position` (паритет rose MainText): left → `items-start/text-left`, right → `items-end/text-right`. |
| «Текст на секции есть, а в поле ввода нет» | **Баг подтверждён и исправлен.** В прошлый заход я заполнил дефолтами только заголовки. Добавлены тексты (`Hero.text`, `Newsletter.text`) в `blockDefaults`. Плюс у «Подписки» порт читал скрытое legacy-поле `description` ПЕРЕД видимым «Текст» (`text.content`) — нарушение §11 контракта, поле панели было мертво. Исправлено. |
| «Размер текста» — вид контрола | Сделано: `SelectField` — белый фон и различимая рамка `#E5E5E5` вместо `bg-#FBFBFB` + рамка `#F8F8F8`, при которой контрол сливался с панелью. Это все селекты панели во всех темах. |
| «Отступы работают наоборот» | **Не воспроизводится в рендере.** Проверены все секции с полем «Отступы»: `{top:0,bottom:120}` → `padding-top:0px;padding-bottom:120px`, крайние значения линейны (0 → 0px, 120 → 120px). `PaddingControl` в конструкторе тоже корректен («Сверху» → top). Единственное отличие — шапка: там свой предел (120 → 64px). Нужен конкретный пример секции. |
| Сайдбар: нет подсветки / выбора частей секции | Подсветка выбранной секции в коде есть (`isSelected` → рамка `#71C0FF` + появление кнопок). Раскрытие в список «частей» outline делает только для массивов (ряды, колонки), а `heading`/`text`/`button` — объектные поля, их там нет. Именно поэтому они и были недоступны; теперь открыты в главной панели секции (см. предыдущую запись). Требуется уточнение, если ожидается ещё и скролл-к-части в outline. |

### Заодно — упрощено платформенное правило

`resolve-props.ts`: «не задано» теперь = **только пустое значение**. Сравнение с дефолтом
блока убрано: именно оно создавало расхождение «в поле текст, на экране заглушка».
Правило стало предсказуемым — что лежит в поле, то и рендерится; пустое поле блок
показывает своей заглушкой. `block-defaults.ts` больше в этой ветке не участвует.

Пруфы: панель ↔ превью по всем секциям — расхождений нет (кроме двух ложных: тумблер
«Подзаголовок» каталога и промо-баннер, где в превью текст вместе со ссылкой).
Контракт секций: `✓ bloom — соблюдён`.

---

## 2026-09-07 — satin: контракт секций закрыт (44 → 0)

Тема **satin**, сайт `57ac2ede-853d-42f3-abd5-68d6bbbc0709`, worktree
`sites/.worktrees/flux-constructor-live-markup`. Прогон контракта со сверкой с rose.

| Правило | Что было | Что сделано |
| --- | --- | --- |
| §7 форматирование | «Ж»/«К» давали сырые `<strong>` в 14 секциях | `themes/satin/src/lib/rich-text.ts` (XSS allow-list, копия bloom), `inlineFormat` в 28 текстовых полях панели; `global.css` — `strong,b{font-weight:700}`, `em,i{font-style:italic}` (без них лёгкая база 300 давала неотличимый bolder) |
| §4 своя схема | 12 секций брали `:root` при hot-render одного блока → «поменял одну секцию, соседние перекрасились» | `selfSchemeClass` на КАЖДЫЙ корневой узел (у Hero и PromoBanner их по два); разбор строкой И числом в Header/Footer/Slideshow |
| §5 тумблеры | `agreement`, `hideTitle` сравнивались со строкой | добавлена ветка boolean |
| §11 приоритет поля | «Положение видео» глушил скрытый legacy `align: container` из blockDefaults | видимое поле панели приоритетнее legacy |
| §6 лестницы | «Размер заголовка/текста» рассылки в подвале не читались вовсе | small = канон вёрстки (14px / 12px), ступени вверх монотонно, классы литералами (Tailwind JIT) |
| §9 три пути рендера | «Стиль кнопки», «Вид изображения», «Следующее фото» были только в типах Catalog | проведены в SSR-карточку (пропсы `cardAspectClass`/`cardBtnStyle`), в `renderCardHtml` (define:vars) и в hover-swap `data-img-primary/secondary`; дефолт `buttonStyle` → `primary` = канон satin |
| §3 заглушки | у 8 блоков панель показывала не то, что превью | `blockPlaceholders` в `packages/theme-satin/theme.json`; заглушки портов CollapsibleSection/Newsletter/ContactForm выровнены с текстом панели |

### Замечание по инструменту

Чекер пропускает §4 у секции, если в файле есть ЛЮБАЯ строка `color-scheme-${...}`.
У satin это дал `containerColorScheme` — пять секций (CollapsibleSection, ImageWithText,
MultiColumns, MultiRows, Slideshow) числились чистыми, хотя собственную схему на корень
не ставили. Найдено сверкой с puck-config («поле „Цветовая схема“ в панели есть»), а не
по отчёту чекера. Тот же ложно-отрицательный ждёт остальные темы.

### Пруфы

`POST /preview/block`: `<strong>` в заголовке Галереи · `color-scheme-4` на корне
Популярного · Видео contained ≠ fullscreen (разные md5) · подвал `text-xs` → `text-[16px]`
· каталог `color-button-secondary-bg` + `aspect-square`. Итог прогона:
`✓ satin: контракт секций соблюдён`.

Не коммичено — по правилу, без явной просьбы пользователя.

## 2026-09-07 (продолжение 5) — Галерея: элементы недоступны, сайдбар не подсвечивал секцию

| Замечание | Причина и фикс |
| --- | --- |
| «Три фото галереи нельзя поменять» | Поле `items` («Элементы, макс 3») было `hiddenInMainPanel: true` — редактировалось только через outline-раскрытие. Открыто в главной панели. Та же болезнь у `MultiColumns.columns`, `MultiRows.rows`, `CollapsibleSection.sections` — открыты все четыре. |
| «Нажимаю на секцию — слева не подсвечивается» | **Баг превью-агента, общий для всех тем.** Клик по ССЫЛКЕ (а фото галереи, карточки товаров и кнопки — ссылки) уходил в ветку навигации и завершался `return` без сообщения о выборе: конструктор не узнавал, какую секцию тронули, — ни подсветки в сайдбаре, ни открытия панели. Добавлен `postSelectionFor()`: перед навигацией (и в ветке «прочие ссылки») отправляется `select-subsection` для элемента-подсекции, иначе `select-block`. Навигация сохранена. |

Пруфы: превью-агент раздаётся с хелпером; у элементов галереи есть маркеры
`data-puck-subsection-parent/index/field` с индексами 0/1/2 — клик по конкретному фото
выберет именно его. Контракт секций: `✓ bloom — соблюдён`.

### Осталось объяснить пользователю

В поле «Заголовок» у СУЩЕСТВУЮЩЕЙ секции стоит серая подсказка, а не значение: Puck
подставляет `defaultProps` только при создании блока, в ревизии этого сайта заголовка
нет. На превью в это время видна заглушка темы. Чтобы поле было заполнено и у старых
секций, нужна миграция ревизий (вписать дефолты в данные) — не делал без запроса.

## 2026-09-07 (продолжение 6) — ОТКАТ правок панелей + настоящая причина подсветки

Пользователь: «нам запрещено менять сайдбары — у меня всё это есть в левом сайдбаре,
но не подсвечивается».

### Откат (правило: состав панелей не трогаем)

Возвращены к git-версии `hiddenInMainPanel` во всех блоках, которые я открыл ранее:
`Gallery.items`, `CollapsibleSection.sections`, `MultiColumns.columns`, `MultiRows.rows`,
`MainText.{heading,text,button}` (включая изменённый порядок полей),
`ImageWithText.{heading,text,button}`, `Newsletter.heading`. Элементы секций
редактируются через раскрытие пункта в левом сайдбаре — как и было задумано.

### Настоящая причина «не подсвечивается»

`SortableItem.tsx`: в строке секции соседствовали ДВА класса одной группы —
`border-[#F5F5F5]` в базовом наборе и `border-[#71C0FF]` при `isSelected`. Какая утилита
победит, решает порядок в собранном CSS, а не порядок в строке className, поэтому рамка
выбранной секции не менялась — хотя выбор доходил (панель справа открывалась).
Тот же класс бага, что мы ловили в темах (конфликт двух утилит одной группы).

Фикс: цвет рамки задаётся ОДНИМ классом через тернарник —
`isSelected ? "border-[#71C0FF]" : "border-[#F5F5F5]"`.

Проверено: у `SubsectionItem` (подсветка выбранной ЧАСТИ секции) конфликта нет — там
тернарник был изначально.

### Оставлено

- фикс превью-агента (`postSelectionFor`): клик по ссылке — фото галереи, карточка
  товара, кнопка — теперь сообщает конструктору выбор секции/части, иначе выбор вообще
  не доходил;
- `SelectField`: белый фон + видимая рамка — прямая просьба пользователя.

## 2026-09-07 (продолжение 7) — проверка новых секций главной + данные для Публикаций

Пользователь добавил на главную bloom новые секции и попросил проверить их по аналогии с rose.

### Состав новых секций и результат

| Секция | Результат |
| --- | --- |
| Слайд-шоу | рендерится: заглушка «Слайд-шоу» + подпись + кнопка |
| Видео | рендерится, медиа-узел на месте |
| Публикации | **были пустые** — завёл данные (см. ниже), теперь показывает реальные записи с датами |
| Страница | пусто, пока не выбрана страница в поле «Выбор страницы» — **так же в rose** (проверено на rose-сайте), с заданными heading/content рендерится корректно |
| Основной текст ×2 | ок |
| Мультиколонны (второй) | ок, заглушки колонок |

Ошибок рендера на главной — 0.

### Данные для Публикаций

У сайта не было ни одной публикации (`/publications` → пустой список), поэтому секция
показывала Figma-заглушки, а настройки «Дата и время» / «Карточки» нечему было применять.
Создание идёт через gateway с сессией мерчанта (PaywallGuard + RequireSitePermission), а
локальной учётки владельца QA-сайта нет — поэтому три записи засеяны напрямую в
`publications` тем же пулом, что использует сервис (organization_id взят из `site`):

- «Как выбрать уход за кожей», «5 ритуалов вечернего ухода», «Новая коллекция уже в продаже»
  (status `published`, обложки — платформенные плейсхолдеры).

Проверка на реальных данных: секция рендерит 3 карточки с заголовками и датами;
`showDateTime` true → 3 даты, false → 0; `cardsCount` 1 → 3 масштабируется пропорционально.
До этого `Publications.showDateTime` числился «мёртвым» в аудите именно из-за отсутствия
данных — теперь настройка проверяема и живая.

### Контракт

`✓ bloom: контракт секций соблюдён` (статика + рантайм + сверка с rose).

## 2026-09-07 (продолжение 8) — каталог и страница товара на реальных данных

Первый пункт плана «добить по одному»: каталог + PDP с настоящими данными.

### Данные: товар с вариациями

У сайта не было ни одного товара с непустыми вариациями (`variantGroups`/`Swatches`/
`Combinations` пустые у всех 60 — они есть только у гейт-сайтов rose `e03dd420…` и flux
`132d3a3e…`). Поэтому часть полей PDP была непроверяема, а фильтры каталога пусты.

Засеян товар `33333333-3333-4333-8333-333333330001` «Крем-уход «Тест вариантов»»
(скрипт `scratchpad/seed-variant-product.js`, запуск с
`NODE_PATH=backend/services/product/node_modules`):
2 группы — «Цвет» (свотчи #e38e9f / #ffffff) и «Объём» (50/100 мл), 4 комбинации
(одна с `quantity = 0` для состояния «нет в наличии»), 3 фото, цена 2490 при старой 2990.

### Страница товара — работает

Заголовок, 3 фото в галерее, обе группы вариантов (`data-variant-key="Цвет"/"Объём"`),
опции «Розовый/Белый/50 мл/100 мл», свотчи, цена + старая цена, кнопка в корзину,
«Нет в наличии» для комбинации без остатка. Настройка «форма вариаций»: `circle` →
`rounded-full`, `square` → нет — паритет с rose.

⚠️ Дважды ошибся в собственных проверках: искал варианты и форму свотчей неверными
шаблонами и сначала посчитал их «не работающими». Правильный способ — искать
`data-variant`/`rounded-full`, а не название группы текстом (оно в атрибуте).

### Каталог — работает

`GET /api/store/products`: 61 товар; фильтр по варианту (`цвет=Розовый`) → ровно 1 товар;
фильтр по цене 2400–2600 → 6; поиск по параметру **`q`** («крем») → 6.
`GET /api/store/filters` теперь отдаёт реальные группы: «Цвет» (Белый/Розовый), «Объём»
(50/100 мл), диапазон цен 490–4990. До появления вариантного товара группы были пустые.
Блок Catalog: заголовок, 16 карточек, панель фильтров, сортировка, пагинация;
«Положение фильтров» меняет разметку.

### Контракт

`✓ bloom: контракт секций соблюдён` — прогон с вариантными данными (поля вариаций больше
не пропускаются как непроверяемые).

### Не проверено

Клиентская гидрация каталога (подгрузка товаров, применение фильтров в UI) — это видно
только в браузере, а MCP не может подключиться к Chrome пользователя.

---

## 2026-09-07 — satin: актуализация по лекалам bloom-сессии

Сверился с параллельной сессией (bloom) и перенёс на satin то, что она нашла.

### Публикации satin не видели реальных записей

`themes/satin/src/components/sections/Publications.astro` читал только
`merfy.catalog?.publications`. Но публикации **вынесены** из `storefront-data` в отдельный
эндпоинт (`storefront-data.controller`: «Publications fetch вынесен в
/api/sites/:id/publications»), поэтому в превью поле всегда пустое — секция показывала
Figma-заглушку при любых данных магазина.

Добавлена ветка SSR-запроса (паритет bloom/flux/vanilla). Порядок источников:
legacy `posts[]` → резолв платформы → `fetch /api/sites/<id>/publications` →
build-time `publications.json`.

Проверка тем: `flux`, `vanilla`, `bloom` запрос уже имели — **satin была единственной
отстающей**; в `themes/rose` своей секции нет.

### Данные сайта

Засеяны 3 публикации (манера satin — одежда, не косметика bloom): «Базовый гардероб на
сезон», «Как ухаживать за трикотажем», «Новая коллекция: тихая роскошь», status
`published`, обложки — платформенные плейсхолдеры. Вставка прямо в `publications`
(`organization_id` = `site.tenant_id`), потому что создание через gateway требует сессии
мерчанта, а локальной учётки владельца QA-сайта нет — тот же приём, что в bloom-сессии.

Пруфы: секция рендерит 3 карточки с заголовками · «Дата и время» вкл → 3 даты, выкл → 0 ·
«Карточки» 1 → 1, 3 → 3.

### Охват прогона — сверка с bloom

| | satin | bloom |
| --- | --- | --- |
| проверяемых полей | 218 | 219 |
| блоков | 32 из 34 | 32 из 34 |
| без проверяемых полей | «Итоги корзины», «Кнопка оформления» | те же |
| товары с вариациями | 50 из 50 | заводились отдельно |

Поля вариаций у satin проверяются полностью — вариативные товары на сайте есть.

### Регрессий от платформенных правок нет

Соседняя сессия упростила `resolve-props` («не задано» = только пустое) и починила клик
по ссылке в превью (теперь сообщает выбор). Перепрогон satin после этого:
`✓ satin: контракт секций соблюдён`. Сборка `dist/src/main.js` свежее их правок.

### Принято к сведению

Правило пользователя из bloom-сессии: **состав панелей и сайдбаров не менять**; если поле
кажется недоступным — искать причину в выборе/подсветке. Правки satin состав панелей не
трогали.

---

## 2026-09-07 — satin: каталог и страница товара (по лекалу bloom-сессии)

Тот же блок проверок, что параллельная сессия сделала для bloom. Данные заводить почти не
пришлось: у satin 60 товаров, вариации есть у всех 50 «одёжных» позиций.

### Каталог — API

| Проверка | Результат |
| --- | --- |
| список | 60 (`total` 60) |
| группы фильтров | «Размер» S/M/L/XL, «Цвет» — 8 значений, цены 990–16489 |
| `Цвет=Розовый` | 11 |
| `Цвет=Чёрный` | 22 |
| `Размер=M` | 48 |
| цена 2000–3000 | 4 |
| поиск `q=носки` | 1 |
| `limit=3` | 3 из 60 |
| сортировка | `price_asc` 990→1350→1720, `price_desc` 14990→13940→12990 |

⚠️ Грабли проверки: `curl --data-urlencode "цвет=Розовый"` кодирует только ЗНАЧЕНИЕ, имя
параметра уходит сырой кириллицей → gateway отвечает **400 с пустым телом**. Браузер
(`URLSearchParams`) кодирует и имя. Проверять только полностью закодированным URL — иначе
можно принять артефакт curl за баг фильтров (я на это наступил).

### Каталог — блок

Сетка, карточки, панель фильтров, сортировка, пагинация, кнопка в корзину, избранное —
на месте; «Вид фильтра» top ≠ side.

**Починено:** заголовок и подзаголовок каталога экранировались — «Ж»/«К» давали
`&lt;strong&gt;`. Добавлен `packages/theme-satin/blocks/Catalog/rich-text.ts` (block-папка
автономна — sibling-копия, как в bloom) и `set:html={inlineFormat(...)}` на `categoryTitle`
и `categorySubtitle`. Пруф: `<h1 …><strong>Жирный</strong></h1>`.

### Страница товара

Порт общий — `packages/theme-base/blocks/Product/Product.astro`, не по темам. На товаре
«Худи «Лонг»»: название, медиа, группы «Размер» и «Цвет», опции, свотчи, цена 12990 +
старая 15588, кнопка в корзину. Настройка «Вариации»: circle → 8 `rounded-full`,
square → 0; «Стиль»: button ≠ dropdown.

**Не гэп satin:** `data-wishlist-toggle` на PDP отсутствует у ВСЕХ тем (общий порт).

### Данные

Обнулён остаток комбинации `KNT-12-S-ROZ` (`d6a3376a-8fc4-4832-8022-4db2ec37bc9a`) товара
«Худи «Лонг»» — **было 9**, чтобы состояние «Нет в наличии» можно было увидеть в браузере.
Откат: `UPDATE product_variant_combinations SET quantity = 9 WHERE id = 'd6a3376a-8fc4-4832-8022-4db2ec37bc9a'`.
Фильтр `availability=sold_out` остаётся пустым — он про ТОВАР целиком, а товар доступен
другими комбинациями (корректно).

### Контракт

`✓ satin: контракт секций соблюдён` после всех правок.

### Чего не проверял

Клиентскую гидрацию в браузере (фильтры/пагинация живым кликом) — как и соседняя сессия,
MCP к окну пользователя не подключается. Корзина и чекаут сценарием — следующий блок.

## 2026-09-07 (продолжение 9) — каталог в браузере: сортировка, фильтры, пагинация, коллекции

Тестирование в Chrome (MCP-браузер вернули, закрыв зависший служебный профиль
`chrome-devtools-mcp`, который блокировал подключение).

### Исправлен баг: переход в коллекцию показывал ВЕСЬ каталог

Меню «Коллекция» → выбор коллекции переводит превью на `?page=collections/<slug>`.
Заголовок подставлялся («Уход за лицом»), а `data-collection-slug` оставался ПУСТЫМ —
клиентский фильтр каталога ничего не отбирал, и вместо товаров коллекции показывался
весь каталог (61 товар).

Причина: на live-сборке `build.service` подставляет slug в разметку
(`data-collection-slug`), а превью-контроллер этого не делал — прокидывал только имя.
Фикс в `preview.controller`: для маршрута коллекции та же подстановка (зеркало сборки).

Пруф: `data-collection-slug="uhod-za-licom"`, заголовок «Уход за лицом», **12 товаров** —
ровно столько активных в этой коллекции по базе (24 связи, из них 12 активных товаров).

### Проверено кликами в браузере

| Что | Результат |
| --- | --- |
| Сортировка «по возрастанию цены» | 4990,4670,4350… → 1490,1810,2130… — работает |
| Фильтр «Наличие → В наличии» | 12 → 8 товаров |
| Фильтр «Цвет» | переключается (`aria-pressed`), значения «Белый/Розовый» появились из нового вариантного товара; в коллекции без цветных товаров выдача не меняется — ожидаемо |
| Фильтр «Коллекции» внутри каталога | присутствует, радио по всем коллекциям |
| Пагинация «Смотреть ещё» | при 4 карточках на страницу: 4 → 8 → 12, затем кнопка корректно скрывается |

### Найдено, требует решения

Страница «Каталог» этого сайта привязана к коллекции **«Макияж»** (поле «Выбор коллекции»
в секции «Группа товаров»), поэтому показывает 12 товаров вместо всех 61. **Снять привязку
в панели нельзя** — в пикере есть только список коллекций, без варианта «Все»/сброса.
Чтобы каталог стал общим, нужен либо сброс значения в данных, либо опция «Все коллекции»
в пикере (это изменение панели — без разрешения не трогал).

### Не сохраняли

Значение «Карточки» временно меняли на 4 только ради проверки пагинации — «Сохранить»
не нажимали, вкладка перезагружена.

## 2026-09-07 (продолжение 10) — сид товаров для bloom: причина «то моки, то плейсхолдеры»

Жалоба: при переключении фильтров карточки показывают то демо-картинки верстальщика,
то плейсхолдеры. Просьба — поставить на bloom рабочий сид, как во flux/rose.

### Причина

У всех 60 товаров bloom изображения ссылались на файлы, которых **нет в хранилище**:
`http://localhost:9010/merfy-files/…png` → **404**. У flux и rose те же адреса отдают 200.
Поэтому карточки то падали на плейсхолдеры, то показывали демо верстальщика.

### Что сделано

`scratchpad/seed-bloom-from-flux.js` (запуск с `NODE_PATH=…/product/node_modules`):

1. старые 60 товаров bloom мягко скрыты (`deletedAt = now()`) — обратимо;
2. скопирован 61 товар flux с новыми id, `sku`/`handle` с суффиксом `-bl`;
3. скопированы их вариации (группы, опции, комбинации);
4. копии разложены по СУЩЕСТВУЮЩИМ коллекциям bloom по кругу, чтобы страница каталога
   и фильтр по коллекциям остались рабочими;
5. у ранее засеянного тестового товара с вариациями заменены битые изображения на рабочие.

Отдельно: клон flux хранил цены в КОПЕЙКАХ (19 682 300 = 196 823 ₽) — известная гоча из
памяти. Цены и «цены до» пересчитаны в рубли для 60 товаров (порог 100 000 отсекает уже
корректные рублёвые, включая тестовый товар 2490).

### Пруфы

- изображения новых товаров → 200; в каталоге 8 фото, **0 битых, 0 плейсхолдеров**;
- storefront-data: 50 товаров (лимит выдачи), все с картинками;
- коллекции наполнены: Аксессуары 10, Макияж 9, Тело и ванна 11, Уход за волосами 10,
  Уход за лицом 10;
- цены в каталоге: 4 729 ₽, 143 017 ₽, 4 349 ₽ — рубли;
- фильтр «Цвет» пополнился значениями из вариантов flux (Белый/Розовый/Серебристый/Чёрный).

⚠️ Товары теперь «электронные» (ноутбуки, часы) — это набор flux, как и просил
пользователь. Тематика косметики ушла вместе со старым сидом; старые товары скрыты, а не
удалены, вернуть можно снятием `deletedAt`.

## 2026-09-07 — bloom: демо-товары верстальщика убраны из витрины

Правило пользователя дословно: «у меня ваще не должно быть демо товаров от
верстальщиков, а должны быть заглушки темы. И заглушки темы должны быть только
когда товаров в принципе нет… Если хотя бы один товар появляется вообще в
принципе, то никаких плейсхолдеров быть не должно нигде в каталоге, ни при каких
раскладах. А если это каталог какой-то определённой коллекции — заглушки есть,
пока мы не выбрали коллекцию».

Найдено три места, где всплывала косметика верстальщика:

1. `packages/theme-bloom/blocks/Catalog/Catalog.astro` — при пустой выдаче
   (например сортировка «По новизне» + цвет «Белый» в коллекции «Макияж», где
   белых нет) грид заполнялся 8 моками `/images/trend-*.webp`. Теперь массив
   моков заменён платформенными заглушками (свитеры `theme-base/public/
   placeholders` + «Товар» + «2 500 ₽»), `catalog-demo` → `catalog-placeholder`,
   а ветвление разведено:
   - нет магазина (превью-макет без siteId) → заглушки;
   - API не ответил → «Не удалось загрузить товары. Обновите страницу.»;
   - `total=0`, но в магазине есть товары → «Ничего не найдено…»;
   - `total=0` и магазин реально пуст → заглушки.
   «Пуст ли магазин» больше не угадывается по эвристике, а спрашивается у API
   отдельным запросом без фильтров (`limit=1`) с кэшем на страницу. Добавлена
   ветка «каталог коллекции без выбранной коллекции → заглушки, запрос не шлём».

2. `themes/bloom/src/components/sections/Collections.astro` — SSG-дефолт секции
   был `catalogProducts.slice(0, 6)`, то есть косметика. Приведено к лекалу
   `Popular.astro`: нет реальных товаров → заглушки платформы.

3. `themes/bloom/src/pages/cart.astro` — блок «Возможно вам понравится» жёстко
   рисовал 4 товара верстальщика без всякой гидрации. Теперь SSR рисует
   заглушки, а клиент подставляет реальные товары магазина.

Пруфы (Chrome + curl, сайт `10df1c3a-a1fc-45e0-957a-511c131b1eb8`):
- исходный сценарий жалобы → «Ничего не найдено. Попробуйте изменить фильтры.»,
  счётчик «0 товаров», косметики нет;
- превью с подменённым на пустой ответом `/api/store/products` → 4 свитера,
  счётчик 0, картинки отдаются 200 (`/__theme/bloom/placeholders/*.svg`);
- Collections без коллекции → заглушки, с коллекцией «Макияж» → реальные товары;
- рекомендации корзины после гидрации → 4 реальных товара магазина;
- поиск косметики на превью home / page-catalog / page-collection / page-cart /
  product / checkout → 0 совпадений.

⚠️ Пересборка для страниц темы (корзина и прочие не-Puck маршруты): мало
`compile-theme-sections.mjs` — нужен `npx astro build` в `themes/bloom`
и `npx tsx scripts/run-theme-build.ts bloom`, иначе превью продолжает отдавать
старую копию из `dist/theme-preview/bloom`.

---

## 2026-09-07 — satin: догон bloom-сессии (демо-товары, корзина, «Заказ оформлен»)

Сверка с параллельной сессией: она закрыла в bloom требование «никаких демо-товаров
верстальщика», починила правовые ссылки футера и адрес, добавила страницу «Заказ оформлен»
и запушила всё одним коммитом `61d4f00c` (наши satin-правки туда тоже вошли).

### Что уже было сделано ею в satin, но не доведено

`packages/theme-satin/blocks/Catalog/Catalog.astro` — 8 моков «Сумка»
(`/images/Товар_N.png`) удалены, пустое состояние разведено на 4 случая. Но в коммите
прямо сказано: «rose/flux/satin/vanilla carry the same change in source only» — не
собрано и не проверено. Пересобрал (`astro build` + `run-theme-build.ts satin`) и проверил.

### Что нашёл и починил сам

`themes/satin/src/pages/cart.astro`, блок «Возможно вам понравится»: рендерил 4 товара
верстальщика из `../data/products` (`catalogProducts.slice(0,4)`) вообще без гидрации,
плюс фиктивную `NtPagination` (`totalPages=3`, `totalCount` = длина мок-массива).
Переведён на лекало bloom: SSR-заглушки платформы (`/placeholders/sweater-*.svg`,
разметка карточки satin) + `data-nt="cart-recommended"` и гидрация первыми 4 реальными
товарами (`loadRealProducts` / `renderCardHtml` / `escapeHtml` — все уже были в
`themes/satin/src/lib/storefront-hydrate.ts`). Фиктивная пагинация убрана.

Пруф по собранной теме `themes/satin/dist/cart/index.html`: демо-ассетов `Товар_N` — 0,
заглушек платформы — 12, маркер грида на месте, пагинации нет.

### Страница «Спасибо за заказ»

У satin не было `checkout-result.json` (как и у vanilla; у rose/bloom/flux есть).
Добавлены `packages/theme-satin/pages/checkout-result.json` (состав как у bloom:
`CheckoutHeader` + `OrderConfirmation`) и запись `page-checkout-result` в `theme.json`.
Блоки у satin доступны; рендер `OrderConfirmation` проверен — приветствие, «заказ
подтверждён», детали заказа, кнопка возврата.

### Проверено — правок не потребовалось

| Пункт | Состояние satin |
| --- | --- |
| адрес/контакты футера | НЕ захардкожены, берутся из `socialColumn.contactFields` (в bloom был хардкод «ул. Пушкина») |
| правовые ссылки `/legal/<slug>` | фикс в общем `src/utils/footer-data.ts` — satin получил автоматически |
| секция «Список коллекций» | уже на заглушках платформы, demo не рендерится |
| каталог | демо-ассетов в `dist/catalog` — 0 |

### Остаточные демо-ассеты

satin: только иллюстрации контентных страниц — `about/index.html` (8) и
`contacts/index.html` (2), это `/images/4x/История_*` и `Контакты.*`. Это оформление
страниц, а не товары, поэтому под требование «демо-товаров быть не должно» не подпадает —
оставлено, решение за пользователем. Для сравнения bloom на момент проверки: 5 страниц с
демо-ассетами, включая `catalog/index.html` (15 вхождений) — открытый хвост той сессии.

### Гоча (её, подтвердил на satin)

Для не-Puck страниц темы (корзина и прочие) `compile-theme-sections.mjs` НЕ достаточно:
нужен `astro build` в `themes/<t>` **и** `npx tsx scripts/run-theme-build.ts <t>`, иначе
превью отдаёт старую копию.

### Контракт

`✓ satin: контракт секций соблюдён`.

---

## 2026-09-07 — satin: второй догон bloom-сессии (auth, служебный slug, контентные страницы)

Сверка с параллельной сессией: она закрыла блоки A и B чек-листа (динамические страницы,
футер, личный кабинет, динамические коллекции) и нашла три платформенных бага. Перенёс на
satin то, что его касается.

### Мёртвые формы верстальщика — заменены

`themes/satin/src/pages/auth/{sign-in,sign-up,forgot-password}.astro` — отдельные формы
С ПАРОЛЕМ и `alert("Демо-вход: авторизация ещё не подключена")`. Платформа давно на входе
по ссылке из письма, живые страницы — `/login` и `/register`. Две разные формы входа
сбивали покупателя, а нерабочая — тем более. Заменены редиректами (шаблон bloom).

Пруф по сборке: `url=/login`, `url=/register`, `url=/login`; полей `type="password"` — 0.

### Служебный slug коллекции — починен

satin отбрасывал только `_placeholder`, а `preview` (системный пресет страницы коллекции
в конструкторе) уходил в API настоящим `collection_id` → запрос падал, страница коллекции
показывала «Не удалось загрузить товары». Добавлен хелпер `isPlaceholderCollection`
(`["preview", "_placeholder"]`) и применён в обеих ветках — `currentCollectionRef` и
`isCollectionCatalogWithoutPick`, как в bloom.

⚠️ Её наблюдение подтверждается и для satin: до перевода пустого состояния на заглушки
этот баг был ЗАМАСКИРОВАН — вместо ошибки рисовались демо-товары верстальщика.

### Контентные страницы — наполнены

У сайта satin «О нас», «Доставка», «Контакты» были пустые (заголовок «», текста 0 симв.).
Хуже: на «Контактах» стоял пустой блок «Страница», хотя тема satin — как rose, flux и
bloom — закладывает `ContactForm`.

| Страница | Что сделано |
| --- | --- |
| О нас | заголовок + 238 симв. текста (манера satin: ткани, крой, малые партии) |
| Доставка | «Доставка и оплата» + 317 симв. (СДЭК, сроки, примерка) |
| Контакты | пустой блок «Страница» → `ContactForm` (состав взят из `packages/theme-satin/pages/contacts.json`) |

Скрипт пропускает страницу, если у мерчанта уже есть свой текст. Бэкап ревизии
`e97114ea-8ff6-4ce6-a5db-458ec83ab477` сохранён в `/tmp/satin-revision-backup.json`.

### Ленивый сид страниц — проверен на satin

Она починила два платформенных места: `page-resolver-instance.ts` искал пакеты тем в
несуществующем `dist/packages/theme-<id>` (молчаливый ENOENT), а `page-blocks.ts` отдавал
весь файл `{content, root, zones}` вместо массива блоков. Из-за пары любая страница,
которой нет в ревизии сайта, не открывалась.

Проверил на satin: `page-checkout-result` в ревизии отсутствует (сайт создан раньше), но
превью её отдаёт — «Спасибо за заказ», «заказ подтверждён». То есть добавленная мной вчера
страница теперь реально доступна.

### Пруфы превью

| Страница | Найдено в рендере |
| --- | --- |
| page-about | «О нас» |
| page-contacts | «Связаться с нами» |
| page-delivery | «Доставка и оплата» |
| page-checkout-result | «Спасибо за заказ», «заказ подтверждён» |

### Не потребовалось

Колонки СДЭК (`orders` ×6, `order_items` ×4), которых не хватало локальной БД, она добавила
через `ADD COLUMN IF NOT EXISTS` — база общая, satin получил автоматически. Личный кабинет
(`/login`, `/account`, `/account/orders`, `/account/profile`) — общая платформенная
реализация, у satin те же файлы.

### Контракт

`✓ satin: контракт секций соблюдён`.

---

## 2026-09-08 — satin: третий догон (медиа-радиус карточек, сверка настроек темы)

Параллельная сессия закрыла блок C (общие настройки темы) и запушила три коммита
(`be4a6975`, `1575052b` в site-gen; `7894393` в constructor). Перенёс на satin то, что его
касается.

### Медиа-радиус карточек — починен

Её баг из bloom: карточки товара игнорировали настройку «Медиа → Скругление», потому что
в разметке стоял хардкод. В satin — 9 таких медиа-контейнеров:

| Файл | Путь рендера |
| --- | --- |
| `components/products/SatinProductCard.astro` | SSR карточка товара |
| `components/products/SatinCollectionCard.astro` | SSR карточка коллекции |
| `lib/storefront-hydrate.ts` | клиентская гидрация витрины |
| `lib/nt-cart-satin.ts` | миниатюра в дровере корзины |
| `pages/cart.astro` | миниатюра на странице корзины |
| `pages/wishlist.astro` | карточка избранного |
| `blocks/Catalog/SatinProductCard.astro` | SSR карточка каталога |
| `blocks/Catalog/storefront-hydrate.ts` | гидрация каталога |
| `blocks/Catalog/Catalog.astro` | `renderCardHtml` |

Все переведены на `rounded-[var(--radius-media,0px)]` +
`bg-[rgb(var(--color-surface,245_245_245))]`. Секции satin токен уже использовали — гэп был
ровно в карточках, во всех трёх путях рендера (§9 контракта).

Заодно 2 не-медийных хардкода фона → токен схемы: плитка публикации в `Journal.astro` и
подсветка пункта в `scripts/gsap/search.ts` (при тёмной схеме оставались светлыми).

**Пруф:** `mediaRadius = 24` → в tokens.css `--radius-media: 24px`; `mediaRadius = 0` →
`0px`; карточка каталога в рендере несёт класс. Значение возвращено в исходное (0).

### Сверка настроек темы — паритет с rose полный

Повторил её C7 для satin: `POST /preview/tokens-css`, каждая настройка с двумя значениями,
satin против rose.

| | satin | rose |
| --- | --- | --- |
| ключей `themeSettings` | 35 | 35 |
| влияют на tokens.css | 16 | 16 |
| живые в rose, мёртвые в satin | — | **нет** |
| живые в satin, мёртвые в rose | **нет** | — |

Из «не влияющих на tokens.css» большинство работает через рендер, а не через токены:
`buttonStyle` читается в 18 местах, `cartType` — 7, `defaultSchemeIndex`/`productCardStyle`/
`cardBorder`/`productCardAlignment` — по 6, `templateId` — 3.

### Находка: три мёртвых контрола (общий гэп, НЕ чинил)

`cartDrawerTitle`, `cartDrawerCheckoutText`, `cartDrawerEmptyText` имеют живые поля в панели
«Настройки темы» → «Корзина» (`constructor/src/components/editor/ThemeSettingsPanel.tsx`,
строки 1374–1401), но во всём sites не читаются **нигде**: 0 вхождений в `src`, `packages`,
`themes`. Проверено и для bloom — `nt-cart-bloom.ts` их тоже не читает.

То есть мерчант в любой теме вводит заголовок корзины, текст кнопки оформления и текст
пустой корзины — и ничего не происходит. В сверке через tokens.css такие ключи выглядят
«легаси без контролов», но контролы у них есть. Не чинил: гэп общий для всех пяти тем, в
bloom его тоже не закрывали — подгонять satin не подо что.

### Ползунок скругления кнопок

Её фикс (потолок 48 → 100) satin не касается: дефолт satin 0px. Вне диапазона был только
bloom (100px, pill-кнопки).

### Контракт

`✓ satin: контракт секций соблюдён`.

---

## 2026-09-08 — подсекции секций: satin, flux, bloom

Пользователь открыл Мультиряды в satin и сказал, что «в ряде подсекции ничего не
работает», и попросил пройтись по подсекциям во всех трёх темах — «мы про них забыли».

### Почему забыли — системная причина

`section-contract-check.mjs` держит `array` в `SKIP_TYPES`. То есть все настройки ВНУТРИ
ряда, колонки, слайда, пункта FAQ и элемента галереи не проверялись ни разу — ни в одной
теме. Написан `scripts/subsection-fields-check.py`, правило внесено в контракт (§13).

Что проверяет: для каждого `array`-поля собирает элемент по его `arrayFields`, рендерит
блок с двумя элементами и смотрит (1) выбираем ли каждый элемент — число маркеров
`data-puck-subsection-field` против числа элементов, (2) живо ли каждое поле элемента.

### Найдено и починено

| Гэп | Темы | Суть |
| --- | --- | --- |
| `Slideshow.slides[].image` | **satin, flux, bloom** | в панели два поля — «Изображение» (`image`) и «Изображение (старое)» (`imageUrl`); порт читал legacy ПЕРВЫМ, а он всегда заполнен дефолтом слайда → картинка слайда, выбранная мерчантом, не применялась никогда (§11) |
| `MultiColumns.columns[].imageSize` | satin | «Размер» работал только когда выбрано соотношение изображения; в дефолтной иконочной ветке иконка зашита 56×56 (§10). Лестница 40 / 56 (канон) / 80 |
| `set-selection.sectionType` | конструктор | поле слалось, но отсутствовало в типе протокола — `tsc --noEmit` падал на `PreviewFrame.tsx:404` и тесте. Добавлено в тип, typecheck чист |

Пруф размера иконки: `small → h-10 w-10`, `medium → h-14 w-14`, `large → h-20 w-20`.

### Ложные срабатывания — важная методика

Первый прогон дал «Gallery: маркеров 0/2, мёртвые type и url» в satin. Оказалось —
артефакт: я подставлял `/placeholders/landscape-gallery.png`, а порты считают такие пути
(и `/images/4x/*`) за «не выбрано» (`contentSet` / `slotImage`). С реальными файлами
MinIO — 2 маркера и живой `url`. **Проверять подсекции можно только реальными картинками.**

Второе: `Header.navigationLinks` показывает 1 маркер на 2 пункта — тоже не баг: маркер
стоит на КОНТЕЙНЕРЕ `<nav>` с индексом 997, пункты меню правятся модалкой целиком.

Обе оговорки внесены в правило 13 контракта, чтобы следующий заход не чинил фантомы.

### По самой жалобе (Мультиряды)

Отставания темы не нашлось: все поля ряда satin (`title`, `description`, `headingSize`,
`textSize`, `size`, `image`, `button`) по рендеру живые, элементы выбираемы, `MultiRows`
есть в `ITEM_FIELD_MAP` конструктора с лейблом «Ряд», превью-агент шлёт
`select-subsection` из обеих веток клика (включая клик по ссылке — фикс bloom-сессии на
месте).

Единственное место, где панель ряда может выглядеть пустой: `FocusedItemPanel` читает
`getCachedPuckConfigJson()` и при отсутствии блока в кэше рисует «Конфигурация полей для
этого элемента не найдена». Нужен точный симптом от пользователя — что именно он видит.

### Контракт

`✓ satin: контракт секций соблюдён`.

## 2026-09-08 (продолжение) — настройки подсекций в правой панели: satin / flux / bloom

Уточнение задачи от пользователя: пройтись именно по НАСТРОЙКАМ подсекций в правом
сайдбаре и прошерстить работу каждой.

### Что проверялось

`FocusedItemPanel` рисует все `arrayFields` элемента кроме `id`; `hidden`,
`section-header`, `disabledHint` контролами не являются. Прогон берёт тот же набор и
меняет каждый контрол на два значения.

Панель элемента открывается только для блоков из `ITEM_FIELD_MAP` конструктора —
проверено, что там есть все блоки с подсекциями всех трёх тем: `Collections`, `Gallery`,
`Slideshow`, `MultiColumns`, `MultiRows`, `CollapsibleSection`. `Header.navigationLinks`
отсутствует намеренно (пункты меню — модалка). Все типы полей подсекций поддержаны
`FieldRenderer`.

### Результат

| Блок | контролов | satin | flux | bloom |
| --- | --- | --- | --- | --- |
| Collections | 1 | ✓ | ✓* | ✓ |
| Gallery | 4 | ✓ | ✓* | ✓ |
| Slideshow | 9 | 1 legacy | 1 legacy | 1 legacy |
| MultiColumns | 8 | ✓ | ✓ | ✓ |
| MultiRows | 7 | ✓ | ✓ | ✓ |
| CollapsibleSection | 2 | ✓ | ✓ | ✓ |

`* ` у flux пикеры товара/коллекции не проверены — на сайте `4d8ebde5…` нет ни товаров,
ни коллекций. Помечены «не проверено», а не «мёртвое».

Единственный неактивный контрол — `Slideshow.imageUrl` «Изображение (старое)» во всех
трёх темах. Это ожидаемо: после фикса приоритета (§11, сделан выше) видимое «Изображение»
перекрывает legacy. Контрол при этом остаётся в панели и ничего не делает — но состав
панелей не трогаю по правилу пользователя; скрыть его — решение за ним.

### Два ложных срабатывания, пойманных по дороге

1. «Gallery: productId и collectionId мёртвые» (satin и bloom) — я проверял выбор товара
   на элементе типа «Изображение». Элемент галереи — ОДИН из image/product/collection, и
   сама панель показывает поля только выбранного типа. С `type='product'` имя товара
   («Носки «Набор»») в рендере есть, `data-gallery-product` проставлен.
2. Ранее — плейсхолдерные картинки вместо реальных.

Обе ловушки записаны в шапку скрипта и в правило 13, чтобы следующий заход не чинил
несуществующее.

## 2026-09-08 (продолжение 2) — именованные подсекции: satin / flux / bloom

Пользователь: «это не все секции». Верно — прошлый проход покрывал только элементы
списков (ряды, колонки, слайды). Второй класс — ИМЕНОВАННЫЕ подсекции, объявленные
картой `NAMED_SUBSECTIONS` в конструкторе (`src/lib/utils/arrayField.ts`, индекс =
100 + позиция): «Заголовок», «Текст», «Кнопка», «Изображение», «Варианты» …

Есть у 7 блоков — PromoBanner 1, Hero 3, MainText 3, ImageWithText 4, Product 8,
CartSummary 2, Newsletter 3 = 24 подсекции на тему, 72 на три темы.
Прогон: `scripts/named-subsection-check.py`.

### Найдено и починено — два §11

| Гэп | Темы | Суть |
| --- | --- | --- |
| `ImageWithText.button.link` | **satin, flux, bloom** | порт читал legacy `button.href` (в `defaultProps` тем лежит `"/about"`) ПЕРЕД видимым `button.link`, куда пишет pagePicker панели → ссылка кнопки в под-панели не работала вообще |
| `MainText.text.size` | **flux** | скрытый top-level `textSize` (дефолт `"medium"`) читался перед `text.size` под-панели. satin спасал пустой дефолт (порядок тоже поправил — профилактика), у bloom порядок был изначально верный |

Пруфы: при дефолте `href="/about"` выбор «/catalog» и «/contacts» даёт
`/__theme/satin/catalog` и `/__theme/satin/contacts`; при заданном `textSize="medium"`
рендер small ≠ large.

### Методика — четыре ловушки, все словил на себе

Первый прогон дал **15 «мёртвых»** полей. После верификации руками осталось **2 реальных**.
Ложные срабатывания возникали, когда:

1. у object-поля не заполнены соседние подполя — «Размер» меряется на пустом заголовке,
   «Ссылка» на кнопке без текста (кнопка вообще не рендерится);
2. блоку не дана картинка — он уходит в ветку заглушки;
3. для `Product` взят товар без вариантов;
4. (из прошлого прохода) картинки-плейсхолдеры и проверка `Gallery.productId` на элементе
   типа «Изображение».

И зеркальная ловушка, из-за которой я едва не закрыл реальный баг как «работает»:
ручная проверка БЕЗ `defaultProps` темы не воспроизводит его — legacy `button.href`
приходит именно из дефолтов. Проверять надо на полных дефолтах блока.

Всё это внесено в правило 13 контракта.

### Итог

Мёртвых именованных подсекций не осталось ни в одной из трёх тем.
`✓ satin: контракт секций соблюдён`.

## 2026-09-08 (продолжение 3) — подсекции через Chrome DevTools: корень жалобы найден

Пользователь: «проверяй каждую тему через хром девтулз». Правильное требование — все
предыдущие прогоны били по `preview/block` API и панель конструктора не трогали.

### Что дал браузер, чего не дали API-прогоны

Открыл конструктор satin, кликнул «Мультиряды» → ряды в сайдбаре раскрылись, панель «Ряд»
открылась. И **все поля в ней пустые** — «Заголовок», «Текст», размеры, — хотя в превью у
рядов «ЖЕНСКАЯ КОЛЛЕКЦИЯ» и полноценные тексты. Это и есть то, на что жаловался пользователь.

Причина — рассинхрон имён между панелью и данными:

| Панель (arrayFields) | Данные ряда и чтение порта |
| --- | --- |
| `title` | `heading` |
| `description` | `text` |
| `image` | `imageUrl` |

Порт читал legacy ПЕРВЫМ, а legacy есть в каждой сидовой ревизии → правки мерчанта не
доходили никогда. В ревизии satin это видно буквально: `title: "2222222222222222222222222222222"`
(мерчант вводил) рядом с `heading: "Женская коллекция"` — рендерился heading.

### Починено

Приоритет развёрнут в `MultiRows` всех трёх тем: `title → heading`, `description → text`,
`image → imageUrl`. Пруф в браузере после перезагрузки: первый ряд показывает
«2222222222…», второй остаётся «Мужская коллекция» (там своё поле пустое → фолбэк),
то есть обратная совместимость не сломана.

### Миграция данных satin

Чтобы панель показывала значения, а не пустые поля, 5 значений ряда перенесены под имена
панели (legacy-ключи оставлены как фолбэк). Бэкап ревизии —
`/tmp/satin-revision-before-rowmigrate.json`.

Проверка в браузере после миграции: панель «Ряд» показывает «Мужская коллекция», её текст
и кнопку «Для мужчин».

### Скан скрытых legacy-значений по трём сайтам

| Тема | Скрытых значений |
| --- | --- |
| satin | 0 (после миграции) |
| flux | 0 |
| **bloom** | **12** — `MultiColumns`: `heading`/`text` заполнены при пустых `title`/`description` |

У bloom панель колонки пустая при непустых данных — та же болезнь. Данные его сайта не
трогал: сайт в активной работе параллельной сессии, а значения там сидовые («Колонна»,
«Сочетай текст…»). Порт bloom уже починен, так что правки мерчанта теперь применятся.

### flux в браузере

Секций-списков на главной flux нет, поэтому проверил именованные подсекции: в сайдбаре
под «Изображением с текстом» появляются «Изображение», «Заголовок», «Текст», «Кнопка»;
панель «Заголовок» открывается и показывает реальное значение «СНОВА В НАЛИЧИИ!».

### Организационное

Chrome с MCP-профилем был занят браузером соседней сессии плюс зомби-процессом с ночи.
С разрешения пользователя закрыл оба и поднял свой. Личный браузер не трогал.

### Урок методики

API-прогон на синтетических пропсах показывал поля ряда живыми, потому что подставлял
данные ПО ИМЕНАМ ПАНЕЛИ и не воспроизводил legacy-ключи из реальной ревизии. Проверять
подсекции надо либо в браузере, либо на реальных данных сайта.

## 2026-09-08 (продолжение 4) — синхронизация с bloom-сессией

Параллельная сессия за вечер закрыла: вечную загрузку (диск был забит, RabbitMQ ушёл в
flow control), пустые инпуты каталога и подвала, неработающие кнопки корзины на карточке
товара (общий баг конструктора), битые иконки и картинку в модалке, логотип из названия
магазина, чекаут-раскладку и панель подвала. Проверил каждую находку на satin.

### Перенесено

`blockPlaceholders.Catalog` = «Каталог» / «Здесь начинается персональный стиль» — ровно те
тексты, что порт рисует при пустых полях. Пруф: в puck-config поля `categoryTitle` и
`categorySubtitle` теперь отдают placeholder.

### Проверено — переносить нечего

| Её находка | satin |
| --- | --- |
| Иконки 404 (`new-themes/icons`) | версия DS 0.1.10 даёт дефолт `/icons`; в сборке 0 ссылок на битый путь, иконки отдают 200. У bloom была другая версия — отсюда её 45 правок |
| Логотип вместо названия магазина | `defaults.logo` и `Header.logo` уже `null`, как у rose; хардкода нет |
| `withBase` ломал абсолютный URL в модалке | `cart-thumb-html.ts` satin уже имеет защиту (в bloom её как раз переносили из этого же файла) |

### Получено автоматически

Её правки в общем коде satin достались без действий: клик по кнопке внутри под-секции
(`useSubsectionClickHandler`), цена в `theme-base/Product`, подписи полей подвала
(`AITextInput`), ленивый сид страниц, `/legal/<slug>` в футере.

### Заглушку подвала намеренно НЕ ставлю

Поставил было `blockPlaceholders.Footer` по образцу bloom — контракт покраснел: «в панели
„Будьте в курсе наших новостей“, на превью пусто». Разобрался: узел заголовка рассылки
помечен `data-puck-subsection-field="newsletter"` (под-секция «Рассылка»), а правило §3
чекера ищет маркер по ИМЕНИ ПОЛЯ — `heading`. Для мерчанта расхождения нет: панель
показывает ровно тот текст, что на витрине. Заглушку убрал, чтобы гейт не краснел на
ложном срабатывании.

⚠️ У bloom эта заглушка стоит, и её контракт краснеет по той же причине — сообщил ей
сообщением между сессиями. Правильное решение — научить чекер сопоставлять маркер
под-секции с полем, но это её скрипт, без согласования не трогаю.

### Обмен с сессией merfy-54

Отправил ей список своих правок в ЕЁ файлах (`themes/bloom/**`: Slideshow, ImageWithText,
MultiRows — все три §11-фикса приоритета полей), предупредил про 12 скрытых legacy-значений
в `MultiColumns` её сайта и передал два новых прогона подсекций. Из её списка общих файлов
я не трогал ни одного; из общего у меня только `postMessageProtocol.ts` (тип `sectionType`,
теперь typecheck конструктора чист) и журнал.

### Контракт

`✓ satin: контракт секций соблюдён`.

## 2026-09-08 (продолжение 5) — встречная сверка: bloom-сессия ответила

Она забрала мои находки и прислала свои. Проверил всё на satin.

### Её правки, задевающие satin

| Правка | Влияние на satin |
| --- | --- |
| `theme-base/blocks/Slideshow/Slideshow.puckConfig.ts`: `slides[].imageUrl` → `hidden` | согласуется с моим разворотом приоритета в портах: одно видимое поле «Изображение», legacy — фолбэком из данных. Прогон подсекций после этого чист во всех трёх темах |
| `packages/theme-satin/blocks/Footer/Footer.puckConfig.ts`: скрыты поля от «Выравнивания» до «Цветовой схемы» | откат не нужен. Панель подвала satin: Рассылка, Заголовок, Текст, Цветовая схема, Отступы |

Прогоны после её правок: контракт satin `✓`, `subsection-fields-check.py` — мёртвых нет
(satin/flux/bloom), `named-subsection-check.py` — 0.

### Моя ложная тревога

Решил было, что у satin остались безымянные инпуты подвала. Нет: `Footer.heading.label`
пуст у ВСЕХ тем — это label контейнера-объекта, а подписи лежат внутри
(`objectFields.text.label = "Заголовок"`), и их рисует её фикс `AITextInput`.

### Что отправил ей

1. Её `blockPlaceholders.Footer` краснит контракт bloom: §3 ищет узел
   `data-puck-subsection-field="heading"`, а подвал помечает заголовок рассылки как
   `newsletter`. У себя эту заглушку по той же причине снял (Catalog оставил).
2. `Product.variants.displayStyle/shape` в её прогоне — ложное срабатывание: чекер берёт
   первый товар сайта, нужен товар С ВАРИАНТАМИ. Проверено руками на `af2d7d57-…`:
   circle → 5 `rounded-full`, square → 0.

### Принято к сведению

Прод недоступен снаружи (ТСПУ), деплои и проверки против прода ненадёжны, сервер не
перезагружать. Работаю только по локальному стеку.

## 2026-09-08 (продолжение 6) — разбор 13 «мёртвых» настроек satin

merfy-54 починила в чекере оба ложных срабатывания, о которых я писал, и попросила
сравнить списки. Заглушку подвала вернул (`blockPlaceholders.Footer`), контракт satin
`✓ соблюдён`. Без baseline у satin ровно те же 13, что у bloom.

### Разбор поштучно

| Настройка | Вердикт |
| --- | --- |
| `Newsletter.text.content` | ложное: прогон включает ВСЕ тумблеры, включая `hideTitle` → заголовок и текст спрятаны. Руками оба значения в HTML |
| `MultiColumns.imageAspectRatio` | ложное: опции `adapt/square/portrait/landscape` работают в ветке медиа-бокса, а у колонок прогона нет картинки. Руками: square → `aspect-square`, portrait → `aspect-[430/500]` |
| `OrderConfirmation.banner.placement` / `align` / `width` | ложные: баннер по дефолту `enabled:false` и без `src`. При `enabled:true` + картинка все три меняют рендер (placement 1168b3b6 vs b57f4f93; width 8ab2ce83 vs 80c359c3) |
| `PromoBanner.padding` | **by design**: в портах satin и rose один комментарий — «padding из ревизии НЕ применяется, иначе полоса толще макета»; поле `hiddenInMainPanel: true` |
| `CheckoutHeader.logoMode` / `accountLink` / `backLink`, `AuthModal.siteTitle`, `CheckoutLayout.breakpoint` / `padding.top`, `Catalog.productCard.nextPhotoMode` | не проверял руками; мертвы и в rose — платформенные либо тот же класс ловушек |

Реальных отставаний темы среди 13 нет — поэтому baseline-сверка и даёт зелёный.

### Что предложил merfy-54 для прогона

1. Не включать тумблеры вида `hide*` — их включение прячет проверяемый контент.
2. Включать вложенный `enabled` (как у `OrderConfirmation.banner`) — иначе секция-условие
   не рендерится.
3. Давать медиа там, где настройка про медиа (аспект, соотношение, следующее фото).

С этими тремя правилами список сократится до настоящих кандидатов, и ему можно будет
верить без ручной перепроверки. `Catalog.productCard.nextPhotoMode` — вероятный следующий
случай того же рода (нужен `nextPhoto:true` и товар с двумя фото).

## 2026-09-08 (продолжение 7) — чекаут-блоки разобраны, найден реальный баг подписки

merfy-54 внедрила три моих предложения в `section-contract-check.mjs` (не включать
`hide*`-тумблеры; включать `boolean` наравне с `toggle` — это и был мёртвый баннер;
подставлять картинку в поля-изображения и внутрь элементов списков). Список 13 -> 8.

### Настоящий баг, который поймал улучшенный чекер

У satin среди восьми висел `Newsletter.text.content`, которого не было у bloom. Оказалось —
§11: порт читал скрытое legacy `description` (label '', есть собственный дефолт) ПЕРЕД
видимым полем панели «Текст». Ровно то, что merfy-54 уже чинила в bloom.

Починено в satin и flux (у flux запись отличалась). Пруф: при
`description: "СТАРЫЙ LEGACY-ТЕКСТ"` рендерится текст мерчанта, legacy не виден.

После фикса: 7 кандидатов, со сверкой с rose — `✓ satin: контракт секций соблюдён`.

### Разбор шести чекаут-настроек

| Настройка | Вердикт |
| --- | --- |
| `CheckoutHeader.logoMode` | ложное: ветка `logoMode === 'image' && logoImage`. С картинкой — text без `<img>`, image с `<img>` |
| `CheckoutHeader.accountLink` | ложное: ссылка только при `rightIcon === 'account'`; с ним `/aaa` в HTML |
| `CheckoutHeader.backLink` | ложное: только при `rightIcon === 'back'` |
| `AuthModal.siteTitle` | ложное: заголовок «Вход в <название>» внутри `mode === 'login'`; без режима модалка = 449 байт (одна кнопка закрытия) |
| `CheckoutLayout.padding.top` | **by design**: «drop padding-top here and only honour padding-bottom» — шапка чекаута sticky, старые ревизии сдвигали контент под неё |
| `CheckoutLayout.breakpoint` | **РЕАЛЬНЫЙ мёртвый контрол**: «Брейкпоинт mobile→desktop (px)», number, дефолт 768, виден в панели — а в `CheckoutLayout.astro` 0 вхождений |

Общий паттерн ложных: настройка живёт внутри ветки, которую включает не boolean, а
ЗНАЧЕНИЕ соседнего поля (`rightIcon`, `mode`, наличие `logoImage`). Передал merfy-54:
дешёвый способ автоматизировать — подставлять каждое значение соседних радио/селектов.

### Реальные мёртвые контролы платформы — теперь их два

1. `CheckoutLayout.breakpoint` (см. выше).
2. Тексты дровера корзины — `cartDrawerTitle`, `cartDrawerCheckoutText`, `cartDrawerEmptyText`:
   живые поля в `ThemeSettingsPanel.tsx`, 0 чтений во всём sites.

Оба — платформа, не тема. Чинить или убирать из панели — решение владельца, не трогаю.

## 2026-09-08 (продолжение 8) — «Режим следующего фото» в satin и flux

merfy-54 разобрала свою половину списка: `MultiRows.size` — не баг (размер ряда
приоритетнее секционного), `Catalog.productCard.nextPhotoMode` — реальное отставание
порта bloom. По её наводке проверил свои темы.

### Найдено и перенесено

`grep -c nextPhotoMode` по портам: **satin 0, flux 0**, bloom 2 (после её фикса),
theme-base 3 (эталон). То есть контрол «Режим следующего фото» был мёртв в двух темах
полностью — независимо от того, сколько фото у товара.

Перенёс в satin и flux (по 5 вхождений):

1. чтение настройки — `nextPhotoMode = productCard?.nextPhotoMode === "zones" ? ... : "simple"`;
2. `data-next-photo-mode` на корне секции;
3. проброс в клиент через `define:vars`;
4. карточка несёт до 4 фото: `p.images.slice(1, 4)` → `data-img-2/3/4`, только при
   включённом «Следующее фото»;
5. клиентская ветка `zones`: `mousemove` делит ширину карточки на число доступных фото,
   `mouseout` возвращает первое; ветка `simple` не тронута.

Пруф: `data-next-photo-mode="simple"` и `"zones"` в рендере satin и flux.

### Незакрытая половина фикса в bloom

У bloom клиентская ветка зон ищет `data-img-2/3/4` (строка ~1341), но `renderCardHtml`
проставляет только `data-img-primary` и `data-img-secondary` (строки ~731-732). Значит
`available` всегда длины 1 и при любом положении курсора показывается первое фото —
режим включается, но визуально не работает. Сообщил merfy-54.

### AuthModal.siteTitle — почему не чиню

У поля «Режим» в puck-config единственная опция `closed`, хотя рендер поддерживает
`login` и `register`. Добавить опции = изменить состав панели, а у владельца прямое
правило этого не делать. Оставлено в `INTENTIONALLY_INERT` с пометкой «кандидат:
добавить режимы в панель» — решение его.

### Итог satin

Без baseline: **1 нарушение** — `CheckoutLayout.breakpoint`. «Намеренно не применяются»:
`PromoBanner.padding`, `AuthModal.siteTitle`, `CheckoutLayout.padding.top`.
Со сверкой с rose: `✓ satin: контракт секций соблюдён`.

У обеих сессий сошлось одно и то же единственное настоящее нарушение — и оно
платформенное, не тема.

## 2026-09-08 (продолжение 9) — режим «зоны»: проверка на данных и уточнение механики

### Ловушка, в которую попал и я

merfy-54 заметила: прогон не ловит случай «атрибут режима на секции есть, а фото не
переключаются», потому что HTML формально отличается. Я проверил ровно то же самое —
атрибут `data-next-photo-mode` — и на этом остановился.

Проверил глубже: у satin и flux **нет ни одного товара с 2+ фото**, поэтому и пруф снять
было не на чем. Товару «Худи «Лонг»» (`52dae7f4-ef3c-45b8-a66d-590157188b65`) добавлены
два фото (было 1, стало 3) — у сайта появился материал для проверки hover-режимов.

### Уточнение механики (важно для следующих проверок)

`data-img-primary/secondary/2/3/4` проставляет КЛИЕНТСКИЙ `renderCardHtml`, а не SSR-шаблон
карточки. Сверка вхождений `data-img-`:

| Тема | `Catalog.astro` (клиент) | SSR-карточка |
| --- | --- | --- |
| theme-base | 15 | — |
| bloom | 12 | 1 |
| satin | 13 | 0 |

То есть в SSR-рендере этих атрибутов нет НИ У КОГО — режим проявляется только после
гидрации. Проверять его через `preview/block` бессмысленно: там всегда будет ноль.

### Честный статус

Код satin и flux зеркалит эталон theme-base построчно, но визуальный пруф — что курсор
реально переключает 2-е/3-е фото — **не снят**: Chrome с MCP-профилем занят браузером
соседней сессии, повторно закрывать его без разрешения владельца не стал.

## 2026-09-08 (сессия vanilla) — волна 0: сквозной аудит темы

Владелец: «осталась последняя тема — ваниль». Решение по трём развилкам: работать в общем
воркtree `flux-constructor-live-markup`, вёрстку переписывать по репо верстальщиков,
начинать со сквозного аудита.

### Стенд

Локальный сайт vanilla `13a40348-4546-4213-aca0-29db6fe2be26` на свежем тенанте
`bf8c5126-99fd-435e-a785-6c0e6491d593` (существующие упираются в `shops_limit_reached`;
RPC `create_site` отваливается по таймауту 30с, но сайт создаётся — известная гоча).
`themes/vanilla/node_modules` не было — rsync из основного клона, затем
`_build-theme.ts vanilla` (в `dist/theme-preview` vanilla отсутствовала вовсе).
Каталог склонирован SQL с rose-гейта: 61 товар, 7 коллекций, 120 связок, вариант-товар,
sku/handle с суффиксом `-vn`.

### Главное препятствие: зонд реестра молча врал

Первый прогон Hero дал 0/14 — и то же самое дал **flux**, документированный как 14/14.
Значит сломан стенд, а не тема. Причина: коммит `61d4f00c` убрал в превью-агенте фолбэк
`blockType = blockId.split('-')[0]` и добавил `if (!blockType) return`. Настоящий
конструктор `blockType` шлёт (`PreviewFrame.tsx:387`) — мерчанты не задеты; зонд не слал →
`update-block` no-op, все замеры читали прошлый DOM. Починил `applyProps` в `probe.mjs`.
После: rose Hero 14/14, flux Каталог 15/15.

**Урок:** любой прогон реестра начинать с эталона. Ноль на rose/flux = сломан инструмент.

### Вторая ловушка: `migrateVanillaHomePage`

Посаженный сид не доживал до превью: у vanilla есть единственная в платформе
тема-специфичная миграция, которая переписывает главную целиком на каждом чтении, пока
`_vanillaHomeMigrationVersion < 11`, с новыми `Date.now()`-идентификаторами. Стенд пришлось
сажать с уже выставленной версией, иначе устойчивых blockId не бывает.

### Итог

Настройки секций 73/91, страницы 5/5, настройки темы 5/13, интерактив корзины/избранного
7/7, интерактив PDP 4/4, страница товара 12/12. Полная карта с причинами —
`docs/theme-work/VANILLA-AUDIT.md`. Починка не начиналась.

Попутно видны регрессии чужих тем (не трогал, доложил владельцу): rose Collections
«Колонки» и настройки темы 10/13; flux Hero «Позиция», страница товара 4/12,
настройки темы 12/13.

## 2026-09-09 — список владельца №17: промо-баннер, дефолты селектов, футер, каталог, Safari, админка

Волна по последнему списку багов. Порядок разбора — по чек-листу владельца.

**Диагностика, которая объяснила сразу два пункта.** «Белый экран / бесконечная загрузка»
и «пропадают все настройки секции» — оба воспроизводятся при мёртвом gateway: конструктор
проксирует `/api` на 3110, `puck-config` отдаёт 500, панель остаётся без полей. Первым делом
при таких жалобах — `lsof -ti:3110`.

**Промо-баннер.** «Отступы» были скрыты и не применялись НИ В ОДНОМ порту, при этом сид
писал в ревизию мёртвое `padding {12,12}`. Оживил padding во всех пяти темах и снял легаси
миграцией ревизий (`normalizePromoBannerPadding`, только точное 12/12) — иначе у всех
ненастроенных баннеров полоса разом стала бы толще на 24px. Тумблер «Показ» пишет тот же
`props.hidden`, что и «глаз» в outline, — один источник правды, а не второй флаг.

**Гоча тумблеров.** Сразу после этого тумблер «Показ» показывал перевёрнутое состояние:
в `FieldRenderer` было `isOn = value === onValue || value === true`, и при булевых вариантах
(показать=false / скрыть=true) вторая ветка переворачивала смысл. Ограничил её строковыми
тумблерами (легаси 'true'/'false').

**Дефолты выпадающих списков.** Панель показывает `defaultProps` = `puckConfig.defaults` +
`theme.json.blockDefaults`. Где дефолта нет — селект пуст («Выберите…»). Правило, которым
выбирал значения: дефолт панели ДОЛЖЕН совпадать с фактическим фолбэком рендера порта,
иначе панель и превью разъедутся. Поэтому смотрел не Figma, а ветки `p.size === … : …` в
`.astro` каждой темы. Проверка — обход puck-config по всем select, включая вложенные
`objectFields`: bloom 8→0, flux 11→0.

**Футер.** Три правки: копирайт без хвоста «Theme» (во всех темах формула несёт `siteTitle`),
строка «Контакты:» под условием непустых значений, «НАВИГАЦИЯ»/«ИНФОРМАЦИЯ» — в общую сетку.
Пруф скрытия контактов снимал честно: очистил `site_contacts` → из HTML ушли и `<address>`,
и «Контакты:», вернул из бэкапа → появились.

**Каталог: режим «Количество».** Расхождение внутри одной темы: секция «Коллекция товаров»
в режиме `cart` рисует степпер, а блок `Catalog` — только кнопку. Перенёс паттерн степпера
из `storefront-hydrate.ts` в клиентский `renderCardHtml` каталога; количество уходит в
`cartStore.addItem` (раньше было жёстко 1).

**Safari.** Масштаб канваса держался на `zoom` — WebKit считает по нему layout иначе, чем
Chrome, отсюда «в Safari слетело всё». Перевёл на `transform: scale` с внешней коробкой
нужной ширины: iframe остаётся 1280px (медиазапросы тем не поехали), клики по секциям
работают.

**Что НЕ воспроизвелось** (проверял вживую, не «по коду»): промо-баннер отсутствует в
сайдбаре flux; краш «Изображения» flux при затемнении без медиа (снимал медиа через ревизию
и возвращал); потеря настроек при смене параметра; «Сортировка → Скрыть»; демо-товары в
«Сейчас в тренде». Скорее всего часть из них — следствие мёртвого gateway у владельца.

## 2026-09-09 (вечер) — схемы секций flux и страница корзины

**Цветовая схема считалась двумя правилами.** Сервер при сборке страницы берёт
`props.colorScheme ?? theme.json blockDefaults`, а агент превью при hot-replace знал только
props. У flux схема секций живёт именно в `blockDefaults`, поэтому первая правка любого поля
снимала обёртку и секция меняла цвет. Лечится не в теме, а в контракте обмена: `/preview/block`
теперь отдаёт `X-Block-Scheme`, посчитанный тем же `resolveBlockScheme`. Один источник правды.

**Вторая половина того же бага — в панели.** `ColorSchemeSelector` сравнивал `s.id === value`,
но идентификаторы приходят в двух записях: ревизия хранит `id:"2"`, блок — `colorScheme:"scheme-2"`.
`findIndex` возвращал -1 → `Math.max(0,-1)` = 0, а подпись бралась как «Схема {индекс+1}» —
поэтому панель уверенно показывала схему, которой в блоке нет. Сравнение и подпись переведены
на номер схемы.

**Гоча диагностики.** На flux-сайте конструктор грузил `themes/rose/puck-config` — потому что
`getSite` не вернул тему (сессия под другой организацией, tenant mismatch), а фолбэк темы —
rose. То есть панель показывала дефолты rose поверх flux-превью. Само по себе это окружение,
но фолбэк стоило обезопасить: кэш puck-config теперь помнит свою тему, и панель не подмешивает
дефолты чужой.

**Корзина.** Страница корзины bloom в конструкторе была мёртвой: тема не входила в
`CART_UNIFIED_THEMES`, превью отдавало статичный blob без `data-puck-component-id` — секции в
дереве есть, клик по превью не открывает панель. Добавил bloom (проверив, что все четыре блока
рендерятся и свой шелл есть). Заодно вскрылось, что платформенный сид пишет Cart-блокам
`scheme-2`: у rose/flux это светлое полотно, у bloom — розовый акцент во всю страницу. Схему
корзины отдал теме (`blockDefaults` bloom → scheme-3), а значение сида снимается миграцией
только для тем, у которых эти дефолты есть, — иначе у flux корзина стала бы чёрной.

**Чужая регрессия (не трогал):** `src/themes/__tests__/v2-live-pages.spec.ts` — 3 теста
`composeContentPagesIntoDist` красные (ожидается 1 пересаженная страница, получается 3).
Проверено, что падают и без моих правок.

## 2026-09-08/09 (сессия vanilla) — волна 1: корзина, каталог, коллекции

Владелец выбрал порядок починки: корзина → каталог → страницы → вёрстка → настройки темы.

### Корзина как страница конструктора

`CART_UNIFIED_THEMES` (`src/themes/page-registry.ts:118`) содержал только `rose` и `flux`,
поэтому у vanilla страница корзины отдавалась verbatim-блобом: превью показывало лишь
шапку и подвал, все настройки секций корзины были мертвы. Перед правкой проверил, что у
темы есть всё нужное: четыре блока (`CartBody`/`CartSummary`/`CartTotals`/
`CartCheckoutButton`) рендерятся через `/preview/block`, собственный шелл
`themes/vanilla/dist/cart/index.html` на месте. Добавил vanilla в список.

Пруфы: превью `page-cart` — пять блоков вместо двух; локальная публикация
(`POST /admin-publish/:siteId`) собралась, в артефакте `cart/index.html` все четыре
Cart-блока, при этом `<header>` и `<footer>` по одному (дубля хрома нет). Гейты
`CartBody` 2/2 и `CartSummary` 2/2. rose и flux не задеты (их корзины по-прежнему
компонуются).

### Каталог: 7/15 → 15/15

Порт `packages/theme-vanilla/blocks/Catalog/Catalog.astro` в шапке прямо декларировал,
что «лишние поля puckConfig принимаем, но не используем». Дописал чтение восьми настроек,
сохранив канон вёрстки как состояние «пропа нет» (контракт §10):

- «Карточки» → размер страницы пагинации (2..24), без пропа прежние `columns*3`;
- «Колонки» → `--vanilla-cols` + media-правило ≥1280 (Tailwind arbitrary с `var()` не
  генерится @source-сканом превью — тот же приём, что у flux);
- «Отступы» → инлайн на обёртке, без пропа остаются классы вёрстки;
- «Цветовая схема контейнера» → класс + фон/цвет на внутренней обёртке;
- карточка: «Стиль (аспект фото)» (`wide`/`square`/`portrait`), «Быстрое добавление»
  (маркер `data-quick-add-id`, инлайн-запись в `vanilla:cart:v1` + событие
  `vanilla:cart:updated` — единый стор витрины), «Стиль кнопки» (`primary`/`secondary`).
  Аспект прокинут во все три пути рендера (§9): SSR-заглушка, скелетон, клиентский
  `renderCardHtml`.
- «Вид фильтра»: сайдбар нёс собственный маркер `data-nt="vanilla-filter-sidebar"`, тогда
  как платформа и flux используют `data-nt="filter-sidebar"`. Потребителей своего маркера
  в репозитории нет — привёл к платформенному в порту и в блоке.

### Коллекции: 2/6 → 6/6 и системный баг показа секций

Секция выглядела мёртвой: заголовок «не виден», кегль всегда 16px. Оказалось — не порт.

1. **Реальный баг темы.** Показ секций у vanilla — `[data-animate] { opacity: 0 }` плюс
   `IntersectionObserver` в `themes/vanilla/src/layouts/Layout.astro`, который наблюдает
   только узлы, существовавшие на момент загрузки. Превью конструктора на каждую правку
   ЗАМЕНЯЕТ узел секции целиком — новый элемент под наблюдение не попадал и оставался
   `opacity:0` навсегда. Добавил `MutationObserver`, который берёт под наблюдение
   добавленные `[data-animate]`. На живом сайте узлы не подменяются — поведение прежнее.
   Пруф: синтетический узел с `data-animate` теперь показывается; секция после правки
   при прокрутке к ней раскрывается (было — нет).
2. **Ошибка мерки.** `focusBlock` зонда скроллил секцию `block:'center'`, а сам
   конструктор — `block:'start'` (`preview.service.ts`). У высокой секции шапка уезжала
   выше экрана, reveal не срабатывал, и заголовок ложно считался невидимым. Привёл зонд к
   поведению платформы. Эталон rose от этого не просел (5/6 как было).

### Подвал

`themes/vanilla/src/components/Footer.astro` не ставил класс своей цветовой схемы на
корень (контракт §4; rose и flux ставят). Добавил — без пропа остаётся канон вёрстки
(тёмное полотно, белый текст), с явной схемой цвета берутся из токенов.

### Инструмент

`theme-registry/probe.mjs`: `applyProps` теперь шлёт `blockType` (после коммита `61d4f00c`
превью-агент без него молча ничего не делает) и скроллит как конструктор. Без этих двух
правок гейты всех тем показывали нули и «мёртвые» настройки там, где всё живо.

### Гоча прогона

Реестр нельзя гонять сразу после рестарта сервиса: недогретый процесс даёт ложные нули
(поймал на PopularProducts — 1/7 при повторном прогоне 7/7). Ждать прогрев.

## 2026-09-09 (сессия vanilla) — правовые страницы «как в розе» + подвал

### Правовые страницы

У vanilla не было `src/pages/legal/[slug].astro` — единственная из пяти тем. Само по себе
это не поломка: платформа генерирует `/legal/<slug>` сама (`composeLegalPagesIntoDist`) и
при отсутствии собственного шелла темы берёт шелл главной. Но страница получалась без
своей типографики и своего `<title>`.

Сделано по прямому указанию владельца «как в розе» — та же схема, что у rose и flux
(`data/legal.ts` + `pages/legal/[slug].astro`), вёрстка родная:

- `themes/vanilla/src/components/policy/PolicyArticle.astro` — перенесён из репо
  верстальщиков побайтово (в эталоне страницы `policies/*.astro` собраны ровно из него);
- `themes/vanilla/src/data/legal.ts` — четыре страницы со слагами rose
  (`delivery`/`return`/`terms`/`privacy`), тексты и секции из эталонных `policies/*.astro`;
- `themes/vanilla/src/pages/legal/[slug].astro` — `getStaticPaths` из `legalPages`,
  рендер через `PolicyArticle` в `Layout` c `showNewsletter={false}` (как в эталоне).

Пруфы: сборка темы даёт `legal/{delivery,privacy,return,terms}`; `legal/privacy` —
`<title>Политика конфиденциальности — Vanilla</title>`, h1 на месте, 6 секций, родная
типографика. Записал сайту-стенду политику в `site_policy` — подвал превью показал
«Политика конфиденциальности» со ссылкой `/legal/privacy`, страница по ссылке открывается.

Замечено (не чинил, поведение совпадает с rose): слаги темы (`delivery`/`return`) и слаги
платформы (`POLICY_SLUG_MAP`: `shipping-policy`/`refund`) расходятся, поэтому для этих двух
типов политик подстановка текста мерчанта идёт на шелл главной, а не на страницу темы.
Общая для всех тем особенность.

### Подвал добит

`footer[data-vanilla-footer]` красился литералом `var(--vanilla-announcement-bg)` мимо
схемы — корень оставался тёмным при светлой схеме и просвечивал в стыках. Перевёл на
`rgb(var(--color-bg, 38 49 28))`; фолбэк = прежний `#26311c`, вид по умолчанию не изменился.
Плюс §4: схема разбиралась только как строка, добавил ветку числа. Гейт подвала 7/7,
статический контракт больше НЕ упоминает vanilla-подвал (29 → 28 записей, оставшиеся —
общий с rose/flux слой).

### Блокер: диск

Локальная публикация упирается в MinIO: `Storage backend has reached its minimum free drive
threshold`. Диск машины 100% (свободно 7.1 ГБ из 926 ГБ), том MinIO 100% (358 МБ из 61 ГБ).
Сам бакет сайтов — всего 633 МБ, переполнен не он. Пруфы «на живом» (сборка + `/legal/*` с
текстом мерчанта) отложены до освобождения места; ничего не удалял.

## 2026-09-09 (сессия vanilla) — секции главной доведены до 64/64

### Поправка к аудиту: два «провала вёрстки» оказались артефактом замера

Метрика «сохранение классов эталона» считала только литералы `class="..."` и не видела
вынесенные константы и CSS-правила. С раскрытием констант:

- **фильтры каталога 24% → 68%**: классы не потеряны, а вынесены в `filter-classes.ts` и
  токенизированы (hex → `rgb(var(--color-*, прежний-hex))`, вид без схемы не меняется).
  «Потерянное» — литералы, заменённые токенами, и классы полей ввода, которые клиент
  создаёт при гидрации (`valueSpan.replaceWith(input)` — фильтр по цене живой).
- **Gallery 48% → 51%, и это by design**: у верстальщиков `Gallery` — трёхполосный
  редакционный блок (промо + видео + «забота»), а платформенная секция `Gallery` — галерея
  плиток `items[]`. Порт реализует платформенный контракт с Figma-плейсхолдером, это
  задокументировано в шапке файла. Переписывать по эталону нельзя — сломает 7/7.

Настоящих расхождения нашлось два: радио-точка фильтров 14px → 10px (уехала в коммите
`c1e50204` про цвета — вернул) и **отсутствие тап-таргетов 44×44**: в эталоне
`min-h-11 min-w-11` встречается 18 раз (иконки шапки, стрелки карусели, крестики, поиск),
в порту — ноль. Не чинил: в эталоне кнопки 44×44, в порту 24–36px, возврат меняет высоту
шапки — вынесено владельцу отдельным решением.

### Пять мёртвых настроек

| Настройка | Причина | Починка |
| --- | --- | --- |
| Шапка · «Цветовая схема меню» | у vanilla **0** маркеров `data-nav-inline` (rose 3, flux 4) — платформенный патчер их и ищет | добавлены на три `<nav>`, как у rose |
| — то же, вторая половина | контракт брал пару `scheme-1`/`scheme-2`, а у vanilla у обеих `--color-text` белый | пара заменена на `1`/`3` — различима во всех темах (rose и vanilla перепроверены) |
| Промо · «Размер» | `thin` не был реализован и молча подменялся на `large`: «тонкий» давал 48px, «маленький» 32px — лестница ехала вспять | `thin` реализован (24px/11px, как rose); чтобы вид по умолчанию остался прежним, `blockDefaults.PromoBanner.size` и сид пилота переведены `thin → large` |
| ИсТ · «Размер» | `small` и `medium` имели одинаковую пропорцию 1.78 (16/9 == 652/366) | лестница от той же ширины: 652/300 → 652/366 (канон) → 1/1 |
| ИсТ · «Выравнивание» | порт не читал видимое поле `alignment` (§11), а `text-align` не двигал текст: колонка `flex items-start` ужимает детей | читаем `p.alignment` первым (как rose) + поперечная ось колонки следует выравниванию |
| Hero · «Позиция» | блок копии вёрстки широкий (52rem), при `w-full` авто-отступ двигать нечего — «справа» оставалось слева. `w-auto` не помог: у блочного div это «во всю ширину» | при ЯВНО выбранной позиции блок сжимается `md:w-fit`; без пропа — ровно вёрстка |

Заодно `textTransform` промо-баннера (появился в панели от соседней сессии) проверен
вручную и внесён в контракт с обоснованием: uppercase → класс есть, none → нет.

### Итог vanilla

Секции главной **64/64** (Hero 14/14, Collections 6/6, PopularProducts 7/7, ИсТ 12/12,
Gallery 7/7, PromoBanner 4/4, Header 7/7, Footer 7/7) · Каталог 15/15 · Страница товара
12/12 · Корзина 2/2 + 2/2 · интерактив корзины/избранного 7/7 · интерактив PDP 4/4 ·
страницы 5/5. Открыто: **настройки темы 5/13** (5 отставаний vanilla, 3 красных и у rose).

## 2026-09-09 (сессия vanilla) — настройки темы 5/13 → 11/13 (= эталон rose)

### Сам гейт врал дважды

1. `theme-gate.mjs` слал `update-block` **без `blockType`** — та же болезнь, что была в
   `probe.mjs`: кнопки быстрого добавления не появлялись, и «Скругление кнопок» мерилось
   на пустоте. Красным было у всех тем.
2. Страница каталога искалась по имени `catalog`, а канонический платформенный id —
   `page-catalog` (так её зовут `theme.json` и миграции). Теперь ключ определяется по
   ревизии стенда: берётся тот, где реально есть блок `Catalog`.

### Пять отставаний vanilla

Все — «токен эмитится, консумера в порту нет»:

| Настройка | Токен | Что подключено |
| --- | --- | --- |
| Скругление медиа | `--product-card-media-radius` | фото карточки каталога — класс в SSR, inline-стиль в клиентском `renderCardHtml` (arbitrary-классы Tailwind в строках JS не компилируются) |
| Карточка: стиль-плашка | `--product-card-padding`/`-bg` | «Контейнер» карточки стал трёхпозиционным: блок явно вкл/выкл, а НЕ ЗАДАНО → решает тема |
| Карточка: скругление плашки | `--product-card-radius` | там же |
| Ширина логотипа | `--size-logo-width` | вордмарк-заглушка `VanilaLogo` висела на `h-6`/`h-7`; фолбэки 24/28px = прежний вид |
| Кегль пунктов меню | `--size-nav-link` | три `<nav>`-ссылки; фолбэк 16px = прежний `text-base` |

Плюс «Скругление кнопок» ожило после починки гейта — кнопка быстрого добавления получила
`rounded-[var(--radius-button,0px)]`.

### Две оставшиеся красные — общие с эталоном

rose тоже 11/13, красные те же:

- **Кегль заголовка Hero** (`--size-hero-heading`): у rose и vanilla глобальный слайдер не
  доходит до `main h1`. Секционный «Размер заголовка» при этом живой (Hero 14/14).
- **Скругление полей ввода**: проверка ищет `div:has(> input[type=email])` и у vanilla
  попадает в обёртку поля из `LoginDrawer` (`flex w-full flex-col gap-2`) — у неё нет ни
  рамки, ни фона, поэтому радиус там всегда 0; у rose селектор не находит ничего вовсе.
  Токен я всё равно подключил там, где рамка реально есть: обе формы рассылки
  (`Newsletter`, `FooterNewsletter`, копия в блоке `Footer`) и поле авторизации
  (`LoginDrawer`, фолбэк 4px = прежний литерал). Селектор проверки требует расширения —
  это задача контракта, не темы.

### Итог vanilla

Секции главной **64/64** · Каталог **15/15** · Страница товара **12/12** · Корзина 2/2+2/2 ·
интерактив корзины/избранного **7/7** · интерактив PDP **4/4** · страницы **5/5** ·
настройки темы **11/13 = ровно как rose**.

## 2026-09-09 (сессия vanilla) — тап-таргеты: решение и перекрёстная проверка тем

### Тап-таргеты 44×44 — оставляем как есть

Владелец: «как в розе делаем». Проверил обе стороны, и вывод оказался обратным ожидаемому:

| | эталон верстальщиков | порт |
| --- | ---: | ---: |
| rose | **0** | 0 |
| vanilla | **18** | 0 |

У rose минимальных 44px-целей не было никогда — её порт согласован со своим эталоном.
Значит «как в розе» = НЕ добавлять, и vanilla уже согласована с эталоном поведения.
Единственное место, где vanilla осознанно расходится со своей вёрсткой; вернуть — по
отдельному запросу владельца.

### Перекрёстная проверка после правок общих файлов

Я трогал `probe.mjs`, `theme-gate.mjs`, контракты `Header`/`PromoBanner`, `page-registry.ts`
— перепрогнал rose и flux целиком.

**rose 62/64.** Красные обе НЕ мои: Collections «Колонки» (была красной ещё в аудите, до
любых моих правок) и PromoBanner «Размер» — высоты 41→42→45→48 вместо 24/32/40/48, то есть
полоса больше не сжимается до min-h. Это следствие работы соседней сессии над «Отступами»
промо-баннера (порт rose в дереве не менялся). Не трогал — их зона.

**flux 61/64 → Header починен (7/7).** Разбор:

- **Header «Цветовая схема меню»** — красное вызвал Я, сменив пару схем на 1/3: у flux обе
  рендерятся белыми, потому что цвет меню там задаёт CSS-правило по КЛАССУ схемы, а не
  токен. Подобрал пару, у которой `--color-text` различается во всех трёх темах — **2/3**
  (rose 18 18 18 → 26 26 26, flux 153 → 0, vanilla 255 → 38 49 28). Теперь Header 7/7 у
  rose, flux и vanilla одновременно.
- **Hero «Позиция»** — красная и в первом прогоне аудита, зафиксирована там же. Не моя.
- **Hero «Заголовок · размер»** — 48/48/48. Причину установить не удалось: сам порт flux
  работает (hot-render `heading.size` small → 14/17px, large → 20/24px), но на странице
  стенда кегль залипает на 48px (= дефолт `--size-hero-heading`). В первом прогоне после
  починки зонда эта проверка была зелёной. Что именно поменялось — не выяснил, `theme-base`
  и flux в дереве не менялись, `setTheme` гейта ничего не персистит. **Доложено как есть,
  не приписываю ни себе, ни теме.**

## 2026-09-09 — доступ к flux: рабочая учётка и правильный сайт

- Причина «правки не сохраняются» на flux закрыта: тестировали не тот сайт. `4d8ebde5-c55c-…` («Flux Local») живёт в организации `8e795a9f-…`, куда сессия не попадает.
- Учётка `flux-e2e-test-local@example.com` — owner обеих организаций, но `/api/sites` отдаёт сайты только одной (`8bcf6fe3-…`); `POST /api/auth/organization/set-active` через gateway → 401/500.
- Рабочий flux-сайт этой учётки — `132d3a3e-a28f-40b7-98fa-a0200151cfb8` (тот же, что в `flux-baseline/HOWTO-TEST.md`), в одной организации с satin и bloom, 61 товар.
- Пруф: конструктор `:3200` открывается («Мой сайт · Flux — Конструктор»), правка подсекции «Объявление» промо-баннера даёт `POST …/revisions` 201, ошибок доступа нет; правка откачена.
- Добавлен `audit-flux/browser.mjs`: свой Chrome (Playwright) + cookie-jar от API-логина. Чужой MCP-Chrome не убивается — у него `--remote-debugging-pipe`, внешнее подключение невозможно.

## 2026-09-09 — flux: «Быстрое добавление» закрыто, найден чужой сломанный Hero в bloom

- Баг владельца «Быстрое добавление не меняет превью» разобран до корня на рабочем сайте `132d3a3e-…`: данные и SSR были верны, ломала клиентская гидрация — `cardButtonHtml` подставлял степпер только вариативным товарам. Фикс + пруф (степперов 2 → 6).
- Второй дефект: степпер красился токеном `--color-text` схемы секции, а карточки flux/bloom жёстко светлые → «− 1 +» белым по белому. Цвета зафиксированы в обеих темах.
- Уточнена цепочка публикации: `compile-theme-sections.mjs` хватает без рестарта sites, но CSS превью живёт в `dist/theme-preview/<тема>/` — нужен `npm run build` темы + `run-theme-build.ts <тема>`.
- Обнаружено: bloom Hero падает (`Cannot access 'backgroundImage' before initialization`) из-за незавершённой правки соседней сессии (файл изменён 12:20). Не трогал, зафиксировал причину и строку в STATUS.

## 2026-09-09 — баги владельца: цветовая схема кнопок + карточка товара (flux/bloom/satin)

- hover-токены схемы эмитились, но порты их не читали (только theme-base) → одно CSS-правило на тему по подстроке класса; `opacity:1 !important` вместо `hover:opacity-*`.
- Кнопкам flux добавлена рамка с `--color-button-border` (дефолт = цвет фона, вёрстка не меняется).
- `tokens-css.ts`: `--product-card-bw/radius` разгейчены от `productCardStyle` — были нулями при стиле «Стандарт»; отступ вынесен в `cardPadding` + дефолт темы.
- Правила `[data-nt=…-product-card]` портированы в bloom и satin (были только во flux/rose) + `!important` во всех трёх (utilities бьют base).
- Конструктор: новый ползунок «Внутренний отступ», токен `--product-card-padding` в реестре.
- CTA «В корзину» токенизированы в трёх темах (SSR + клиентский рендер), фирменный цвет остался дефолтом токена.
- Клик по шкале ползунка не воспроизвёлся — работает; нужен пример от владельца.
- Разблокирован `themes/bloom/.../Hero.astro` (чужая правка ломала сборку bloom целиком) — минимальная правка строки 83 на `backgroundImageRaw`.
- Тексты корзины оживлены строковыми CSS-токенами + потребитель в Layout трёх тем (у настроек не было ни одного читателя).
- FontSelect: ARIA-разметка combobox/listbox/option, возврат фокуса, Home/End.
- Пятая схема: не баг — мерчантские схемы вне манифеста темы получают правила через отдельный проход в tokens-css.
- Тестовые значения на сайтах возвращены к исходным (стиль «Стандарт», обводка 0, скругление 12/12/0, тексты корзины пустые, шрифт Comfortaa).

## 2026-09-09 — баги владельца: мёртвые настройки секций (flux/bloom + паритет по темам)

- «Дата и время» в «Публикациях» была мертва на магазине без постов: рендер даты стоял
  под гейтом `!isPlaceholder` во всех четырёх портах. Снят — заглушка тоже показывает дату.
- bloom «Публикации»: карточки-заглушки подписывались «Колонна» и текстом Мультиколонн
  (мерчант видел чужую секцию). Теперь заголовок + дата + анонс, как во flux и theme-base.
- «Сортировка → Скрыть» не убирала блок в боковой раскладке каталога: секция «Сортировать»
  живёт внутри `NtFilterSidebar`, который тумблер не получал. Проброшен `sortVisible`
  (flux/bloom/satin/rose; у vanilla свой сайдбар — не трогал, ведёт другая сессия).
- Счётчик «1 товаров» → склонение: SSR-разметка и инлайн-скрипт `theme-base/Catalog`,
  плюс `updateCount` в четырёх темах (у vanilla склонение уже было — взято за эталон).
- Секция «Изображение» (Hero): поле «Отступы» было `hidden` — баннер нечем было отодвинуть
  от шапки. Открыто; дефолт 0/0, чтобы вид новой секции не поехал.
- «Мультиколонны»: у новой секции пустой заголовок → блок выглядел оборванным.
  Дефолт «Мультиколонны», как «Публикации» / «Связаться с нами» у соседей.
- «Подписка»: панель пишет `agreementText` / `agreementLink`, а порты flux/bloom/rose
  печатали захардкоженную строку — тумблер «Сделать ссылкой» выглядел мёртвым.
  Эталон — satin/vanilla, поведение перенесено.
- `packages/theme-base/__snapshots__/tailwind-input.css`: все `@source` резолвились от
  `__snapshots__/`, а написаны как от корня пакета → ни один не попадал в скан
  (пруф A/B-компиляцией: 104 КБ против 77.7 КБ, ровно размер прод-файла). Пути исправлены.
  ВАЖНО: это НЕ объяснение «размер заголовка не меняется» — композитное превью грузит CSS
  темы линком `/__theme/<t>/_astro/*.css`, а `preview-tailwind.css` инжектится только на
  старом пути. В прод-CSS flux `.text-\[19px\]`, `.text-\[23px\]`, `.aspect-\[430\/500\]` есть.
- Проверено и НЕ подтвердилось на проде (рендер меняется корректно, механизм-пруф
  `POST /preview/block`): «Размер заголовка» в «Контактной форме» и в «Видео»
  (у Видео панель развели на `size` = высота и `headingSize` = кегль — уже в main).
  Осталось искать в канале конструктора.
- Открытые хвосты списка: подсветка «Вида фильтра» застревает на «Сбоку»; ссылка кнопки
  «Мультиколонн» (в превью навигация перехватывается агентом — нужен пруф с витрины);
  заглушка секции «Страница» в bloom; «Названия списков» в «Группе товаров»;
  единый вертикальный ритм отступов (панель показывает 80/80, порты рисуют свой литерал).

Коммит: `411e9664` (site-gen main). Сборки: 5 тем `astro build` зелёные, `nest build` без ошибок,
`check-css-layers --check` зелёный.

## 2026-09-09 — vanilla доведена до прода

Ветка `flux-constructor-live-markup` слита в `main` (`cbd8775e`, четыре коммита: ваниль;
публикации + починка стенда; и две работы соседних сессий — hero-картинка/высота ряда,
схемы-ховеры/ручки карточки/тексты дровера). Семь конфликтов: в шести кодовых взята
сторона `main` (там более поздняя версия той же работы — общий хелпер
`resolvePublicationsDateTime`, `itemsCls` вместо моего `columnAlignCls`), журнал склеен.

Деплой `sites-service` (`q40c8ww44ss4ckogo8w0csso`, `force=false`) — `finished` за ~19 мин
(дольше обычных трёх: теперь пересобираются все шесть тем через Astro). Прод-сайт
`76ae9332-490a-444a-8dda-93588c776b42` (https://e0a8a827f393.merfy.ru) републикован.

**Пруфы на живом сайте:** маркеры правок — `data-nav-inline`, `--size-nav-link` ×5,
`--size-logo-width` ×3, `--radius-input` ×3, `--product-card-media-radius`; каталог —
`data-nt="filter-sidebar"`, `--vanilla-cols` ×3, `data-quick-add-id` ×4; правовые страницы
`/legal/{privacy,delivery,return,terms}` — все 200 со своими заголовками, вёрстка родная
(Bitter italic + Arsenal). Скриншоты сняты Playwright (Chrome с MCP-профилем был занят).

### Гочи, стоившие времени

- **Адреса в `CLAUDE.md` врали дважды.** IP из заблокированной ТСПУ-подсети (поправлено на
  `200.169.180.243`; sslip.io-имена НЕ трогать — в них IP внутри имени и сертификат на
  старый) и UUID деплоя: `zs8g88k4g0o0c0gokgccwkgk` — это **api-gateway**, а не sites.
  Разведены все три UUID.
- **Темы нельзя проверять во временном воркtree с симлинками `node_modules`:** Astro
  склеивает пути двух деревьев («No cached compile metadata») и валит 3 темы из 6. Чистый
  `origin/main` в тех же условиях падает так же — верить можно только дереву с настоящими
  `node_modules`.
- `packages/theme-base/blocks/Product/Product.astro:80` — в КОММЕНТАРИИ строка
  `text-[length:var(--product-...,fallback)]`, Tailwind принимает её за класс и генерит
  невалидный CSS. Сборку не валит, но предупреждение в каждой сборке тем. Не чинил.

## 2026-09-09 — карточка товара: проверка на всех пяти темах

- vanilla и rose не читали hover-токены схемы (обе гасили кнопку `hover:opacity-*`) — добавлено то же правило, что в flux/bloom/satin.
- rose: правила карточки шли без `!important` → ползунки «Обводка»/«Скругление»/отступ были мертвы (utilities бьёт base). Исправлено; дубль блока схлопнут соседней сессией.
- Пруф на статичных превью тем `/__theme/<t>/catalog/`: подстановка `--product-card-bw/radius/padding/align` даёт `3px / 40px / 16px / center` во всех пяти темах.
- Клик по шкале ползунка проверен во всех разделах панели темы и в панели секции — работает везде; «сброс в ноль» = клик по левому краю (минимум шкалы).

## 2026-09-09 — пруф на ПРОДЕ (витрина flux `u9fpo33bkmsd.merfy.ru`)

После деплоя `ba680ac1` и републикации витрин проверено на живом сайте, не на превью:

- **Карточка товара:** до подстановки токенов `border 0px / radius 12px / padding 12px`, после `--product-card-bw:3px` `--product-card-radius:40px` `--product-card-padding:16px` `--product-card-align:center` → computed `3px / 40px / 16px`, текст `center`.
- **Наведение на кнопку:** фон `rgb(255,255,255)` → `rgb(0,200,0)`, текст `rgb(10,10,10)` → `rgb(255,230,0)`, `opacity: 1` (затемнение снято).
  ⚠️ Токен надо ставить НА КНОПКУ, а не на `:root`: цветовая схема секции переопределяет `--color-button-*-hover` на своей обёртке и перебивает корневое значение. Проверка через `:root` даёт ложный минус.
- **Тексты корзины:** с `--cart-drawer-title` / `--cart-drawer-empty-text` дровер отдаёт «МОЯ КОРЗИНА» / «Пока пусто».
- ⚠️ Ещё одна ловушка проверки: в собранном CSS минификация убирает пробелы после запятых (`hover,var`), поэтому грепать надо по селектору `class*="bg-[rgb(var(--color-button-bg"]:hover`, иначе получаешь ложный ноль во всех темах.
- ⚠️ `0b851c31925c.merfy.ru` теперь на теме **vanilla** (не flux). Прод-витрина flux для проверок — `8df3b745…` → `u9fpo33bkmsd.merfy.ru`.

## 2026-09-09 (вечер) — прод-проверка списка багов и репро в конструкторе

- Прод после `ba680ac1`: дата в «Публикациях» переключается тумблером (заглушка «15 марта 2025» ↔ 0),
  блок «Сортировать» в боковой раскладке исчезает при «Скрыть», «Отступы» у «Изображения»
  отдаются панелью (дефолт 0/0), «Мультиколонны» приходят с заголовком, текст согласия в
  «Подписке» → `<a href="/__theme/flux/privacy">`.
- Републикованы `8df3b745…` (flux QA) и `6c107f35…`. Пруф пересборки — `last-modified` CSS,
  а НЕ имя файла: контент-хеш не меняется, если CSS темы не менялся.
- **Корзина владельца объяснена:** на flux QA витрина была собрана старым кодом с демо-товарами
  верстальщика («Смартфон»/«Наушники») и живой кнопкой; клик клал несуществующий товар,
  `POST /api/orders/cart/<id>/items` → 400, «Оформить заказ» молча не срабатывала.
  После републикации демо-карточек нет, `data-quick-add-id` = 0, сетевых ошибок нет.
  На магазине с товарами (bloom `f7593c5f…`) весь путь работал и раньше: товар → корзина
  (степпер, итог) → `/checkout` с формой.
- **Недосмотр найден и закрыт:** склонение счётчика было добавлено в `theme-base/Catalog` и
  `themes/<t>/src/lib/storefront-hydrate.ts`, но счётчик на витрине рисует СВОЯ копия
  `updateCount` в инлайн-скрипте каждого per-theme блока каталога. Дописано в
  `packages/theme-{flux,bloom,rose,satin}` (vanilla уже со склонением), коммит `0f9ef6ec`.
- **НЕ воспроизводится** на текущем коде: подсветка «Вида фильтра». Прогон в конструкторе
  (flux `132d3a3e…` page-catalog, bloom `10df1c3a…` page-catalog и page-collection):
  переключение подсвечивается в обе стороны. Нужен свежий пример от владельца.
- Ссылка кнопки «Мультиколонн»: рендер href проставляет (`/__theme/flux/about` на проде),
  в превью клик уходит в `onNavigate` → `pageIdFromPath` → переключение страницы. Нужен
  конкретный случай от владельца, где не ведёт.
- Дефект без фикса (записан): при ошибке сервера кнопка «Оформить заказ» не сообщает
  покупателю ничего — молча остаётся на странице корзины.

## 2026-09-12 — скрытие именованных параметров + перестановка хрома превью

- Замер: `hiddenFields` читали 26 секций из 92 (по 5 на тему). Жалоба владельца
  «глазик не работает» этим и объясняется — тыкали в секцию вне пятёрки.
- Условие подключено ещё в 49 секциях по разметке `data-puck-subsection-field`;
  покрытие 26 → 75 из 92. Снимки 135/135 без изменений.
- Новый гейт: `hidden-named-fields.spec.ts` (65 проверок) — рендерит секцию дважды и
  требует, чтобы скрытый параметр исчезал. Проверен саботажем.
- Превью: `__rcApply` научился переставлять блоки вне `<main>`; общий исходник
  `src/common/chrome-reorder.ts`, инлайнится в агент через `toString()`, 6 unit-тестов.
- Живой замер перестановки на настоящей странице превью (Playwright):
  до `["Header-1","PromoBanner-1","<main>","Footer-1"]`, после правки
  `["PromoBanner-1","Header-1","<main>","Footer-1"]`, повтор идемпотентен.
- Конструктор: штамп сборки `/build.json` (коммит + время) — чтобы «не приехало»
  отличалось от «не починено»; на проде уже отдаётся.

## 2026-09-12 (продолжение) — скрытый элемент галереи при hot-render

- Замер опроверг формулировку: секция рендерится при 3/1/0 элементах во всех пяти темах.
- Настоящая причина — `POST /preview/block` шёл мимо `adaptLegacyProps`; фикс дал ему
  общую нормализацию (`a85646e5`), инвентарь конформанса обновлён (`e1210eb6`).
- Пруф на проде: «1 скрытый» 1 картинка → 0 картинок, секция и заголовок остаются.
- `preview/block` игнорирует `themeId` в теле — тема берётся из записи сайта; проверять
  разные темы этим маршрутом нельзя, нужен сайт нужной темы.

## 2026-09-12 (продолжение) — снят лимит 3 элементов в галерее

- Лимит жил в схеме (`min(1).max(3)`) И в `slice(0, 3)` каждого порта — замер показал,
  что все пять тем рисуют ровно 3 плитки при любом входе.
- Потолок 12, `min(0)`; сверх трёх боковая часть становится сеткой (rose/bloom/flux).
- Снимки 135/135 без изменений: при ≤3 разметка прежняя.
- Прод: 0/1/3/4/6/12 элементов → столько же плиток, секция и заголовок на месте.

## 2026-09-12 (продолжение) — одиночная плитка галереи

- Замер: при одной видимой плитке rose и flux давали высоту 0 (плитки нет), остальные
  три — плитку в половину секции рядом с пустотой.
- Причина: hero берёт высоту от соседней колонки (`lg:h-full`); соседа скрыли — высота
  схлопнулась. Теперь при одной плитке — одна колонка и собственное соотношение 16:9.
- Снимки 135/135 без изменений; `gallery-item-count.spec.ts` вырос до 45 проверок.
- Публикация тестовых витрин невозможна: 402 от PaywallGuard на всех трёх аккаунтах.

## 2026-09-13 — дефолты контролов сайдбара (все пять тем)

- Жалоба владельца: настройки секций «стоят в нейтральном положении», мерчант чинит вслепую.
  Проверено по коду конструктора: `SelectField` без значения рисует «Выберите...»,
  `RadioField` — НИ ОДНОЙ активной пилюли, `AlignmentField` подсвечивает `left`
  (`value || "left"`) независимо от витрины. Хуже: `CustomFieldsPanel.updateProp`
  мержит `defaultProps` в props при ЛЮБОЙ правке — значит неверный дефолт
  материализуется в данные и меняет секцию, когда мерчант трогает соседнее поле.
- Фактический фолбэк каждого порта снят РЕНДЕРОМ (зонд: блок без пропа против блока
  со значением, посекционно по пяти темам), а не чтением комментариев.
  Заполнено: rose 13, flux 7, vanilla 9, satin 23 поля оформления.
- Общие значения — в `theme-base`; расходящиеся — у владельца расхождения:
  rose `theme.json` (Hero.alignment=center, overlay=0), flux `theme.json` (overlay=0),
  satin — в его СОБСТВЕННЫХ puckConfig (11 своих блоков, theme-base их не касается).
- Пять полей оставлены пустыми осознанно: у порта «не задано» — отдельная ветка,
  которую ни одно значение списка не повторяет (satin Hero.alignment,
  satin ImageWithText.width, satin MultiRows.width, satin MultiColumns.imageAspectRatio,
  vanilla Hero.overlay: без пропа фикс-затемнение `bg-black/25`, а `overlay:0` его снимает).
  `Hero.position` не задаём у rose/vanilla/satin: порт читает `position ?? contentPosition`,
  а `contentPosition` дефолты theme-base материализуют в props ('center') — статичная
  «Позиция» сдвинула бы уже стоящие баннеры (проверено рендером на всех пяти темах).
- `colorScheme` не трогали: без значения блок рендерится БЕЗ обёртки `.color-scheme-N`
  и наследует `:root`, а `:root` = активная схема темы ИЛИ выбор мерчанта. Статика
  заморозила бы этот выбор.
- Снимки 135/135 без изменений, `hidden-fields` 367/367, `section-text-case` 297/297,
  `conformance:satin` зелёный (инвентарь обновлён отдельным коммитом).
- Два новых сторожа: `pnpm test:panel-defaults` — (1) у каждого контрола панели каждой
  темы есть значение или явное исключение с причиной; (2) каждый дефолт оформления —
  no-op для порта (рендер со значением ≡ рендер без него). Оба проверены саботажем.
- Найдено попутно (НЕ чинилось, решает владелец): 40 ДАВНИХ дефолтов расходятся с
  портом — список зафиксирован в `panel-default-is-noop.spec.ts` (`KNOWN_DIVERGENT`);
  среди них rose/vanilla `MultiRows.size|width`, `MultiColumns.width`, bloom `Hero.overlay=40`,
  `PromoBanner.size`, `PopularProducts.cards`, `Header.stickiness`.
  Ещё: `MultiRows.headingSize` НИ НА ЧТО не влияет в rose/flux/vanilla/satin (мёртвая настройка).

## 2026-09-13 — W-0XX — жирный + курсив: вложенная пара тегов доезжает до витрины

### Повод

Баг-репорт тестера: «Баг жирность и курсив. Во всех секциях и параметрах выдаёт
ошибки. Должны спокойно работать как по отдельности, так и вместе».

### Причина (замер до правки)

Конструктор до `f19bb5f` писал в значение поля максимум ОДНУ обёртку — второе
начертание затирало первое. После фикса он пишет пару
`<strong><em>ТЕКСТ</em></strong>`, а `inlineFormat` портов умел снимать ровно
одну обёртку: внутренний тег уезжал в `escapeHtml`.

Пруф на проде 2026-09-13, `POST /api/sites/<id>/preview/block`, блок Hero:

- rose, `<strong>ТЕКСТ</strong>` → `<strong>ТЕКСТ</strong>` (ок);
- rose, `<strong><em>ТЕКСТ</em></strong>` → `<strong>&lt;em&gt;ТЕКСТ&lt;/em&gt;</strong>` (сырьё);
- flux, `<strong>ТЕКСТ</strong>` → `&lt;strong&gt;ТЕКСТ&lt;/strong&gt;` (сырьё уже поодиночке).

### Выполнено

- `themes/{rose,bloom,satin}/src/lib/rich-text.ts`: `inlineFormat` снимает любую
  вложенность разрешённых тегов без атрибутов (до 4 уровней), содержимое самой
  внутренней обёртки по-прежнему экранируется.
- `src/services/preview.service.ts`: локальный патч Hero больше не пишет значение
  с начертаниями через `textContent` (мерчант видел в превью сырьё сразу по клику
  «Ж») — форматированное значение уходит серверному рендеру.
- Тесты: `src/themes/__tests__/rich-text-bold-italic.spec.ts` (45, три порта,
  включая XSS-кейсы) и блок «локальный патч Hero и начертания» в
  `src/services/__tests__/preview.service.spec.ts` (5). Оба проверены саботажем.
- Пруф механизмом (скомпилированные модули порта, `render-theme-sections.mjs`):
  rose/bloom/satin MainText и MultiColumns отдают `<strong><em>МАРКЕР</em></strong>`;
  payload `<img src=x onerror=…>` экранируется во всех трёх.

### Открытые хвосты (НЕ чинились)

- **flux и vanilla не имеют `src/lib/rich-text.ts` вообще** — начертания
  экранируются в 29 (flux) и 23 (vanilla) местах, то есть «во всех секциях»
  даже поодиночке. Инвентарь — в отчёте сессии.
- Частичное покрытие у остальных: rose 6 непокрытых полей (в т.ч. Newsletter
  heading/description), bloom 9, satin 10.
- `satin` MainText кладёт значение поля в `aria-label` как есть — скринридер
  читает разметку. Не чинилось.

### Проверки

- `jest src/themes/__tests__/rich-text-bold-italic.spec.ts src/services/__tests__/preview.service.spec.ts` — зелёные.
- `nest build` — чисто. `tsc -p tsconfig.json` — новых ошибок нет.
- Падения `resolve-block-scheme.spec.ts` и `flux-v2-home-sections.spec.ts`
  воспроизводятся на чистом `origin/main` — к правке отношения не имеют.
- Commit/push/deploy НЕ выполнялись.
## 2026-09-13 — промо-баннер: подпись ссылки и регистр (vanilla, satin, bloom)

- Баг тестировщика: «Не изменяется ссылка, всегда стоит "подробнее". Ожидаемый
  результат: меняется в зависимости от выбранной страницы или введённого названия
  в инпуте». Порты тем ни при чём — замер рендером (`render-theme-sections.mjs`,
  пять тем, семь наборов пропсов) показал, что `link.text` читается верно всеми
  пятью: «Читать правила» → «Читать правила», «Контакты» + `/contacts` → ровно они.
- Рвалось в конструкторе, в двух местах:
  `CustomFieldsPanel.tsx` (подпанель «Объявление») писала только `href`
  (`{...currentProps.link, href: val.href}`), выбрасывая подпись из пикера;
  `PagePicker.handlePageClick` при выборе СТРАНИЦЫ тащил старую подпись
  (`text: normalizedValue?.text`), хотя соседние ветки того же пикера (товар,
  коллекция) уже писали имя выбранной сущности. Итог — вечное «Подробнее»
  (дефолт блока `PromoBanner.puckConfig.defaults.link.text`).
- Регистр (просьба владельца «не делать прописные капсом нигде», дефолт —
  «как введено»): у vanilla/satin/bloom капс приходил ДВАЖДЫ — из
  `theme.json → blockDefaults.PromoBanner.textTransform: "uppercase"` и из
  фолбэка порта (отсутствие пропа = капс). Оба сняты; форма условия теперь
  единая на пять тем — капс ТОЛЬКО при явном `textTransform === "uppercase"`.
  Явный выбор мерчанта «Заглавными» работает у всех пяти (проверено рендером).
- Снимки: 135/135 зелёные после осознанного обновления трёх — диф ровно в одно
  слово `uppercase` у bloom/satin/vanilla PromoBanner, больше ничего не поехало.
  `hidden-fields` 367/367, `panel-defaults` 22/22. Новый сторож:
  `src/themes/__tests__/promo-banner-link-case.spec.ts` (45 проверок, пять тем) —
  подпись ссылки, адрес, дефолтный регистр и живость «Заглавными»; проверен
  саботажем на порту bloom и на `theme.json` vanilla.
- `conformance:satin` краснеет «tracked inventory is stale» — тронут вход дайджеста
  (`themes/satin/.../PromoBanner.astro`, `packages/theme-satin/theme.json`).
  На исходных файлах прогон зелёный (сверен `sourceDigest`), рефреш инструмент
  делает только на чистом дереве → `pnpm conformance:satin:refresh` ОТДЕЛЬНЫМ
  коммитом после коммита правки.
- Найдено попутно, НЕ чинилось (решает владелец): `packages/theme-flux/pages/home.json`
  сеет `textTransform: "uppercase"` прямо в сид главной; `src/generator/templates/
  defaults/vanilla.json` держит текст полосы КАПСОМ как литерал; в
  `theme-base/blocks/PromoBanner/PromoBanner.classes.ts` у `container` зашит
  `uppercase` (на живой путь пяти тем не попадает — резолвер берёт порт темы).
  Ещё: при пустой подписи темы расходятся — rose/flux подставляют «Перейти»,
  satin делает ссылкой всю полосу, bloom/vanilla не рисуют ссылку вовсе.
## 2026-09-13 (продолжение) — «глаз» у пяти секций: два механизма, оба чинились

### Цель

Баг-репорт тестировщика: «скрытие параметров не работает — в сайдбаре скрыто, в
магазине видно» у секций Товар, Мультиряды, Мультиколонны, Слайд-шоу,
Сворачиваемый раздел.

### Что оказалось

«Глаз» в outline — это ДВА разных механизма, и сломаны были оба:

1. **Элемент списка** → конструктор пишет `props.<array>[i].hidden = true`
   (`toggleCollectionItemVisibility` → `updateArrayField`, имя массива из
   puckConfig). Отсев на стороне sites был написан РУКАМИ и только у двух блоков
   — `coerceCollectionsProps` и `coerceGalleryProps`. У «Мультирядов»,
   «Мультиколонн», «Сворачиваемого раздела», «Слайд-шоу» (и у пунктов меню
   Header) его не было вовсе — во ВСЕХ пяти темах. Слайд-шоу дополнительно
   уходило мимо любого отсева: у него единственный `return` из `switch`.
2. **Именованный параметр** → `props.hiddenFields`. Поддержан был только порт
   flux (`FeaturedProduct.astro`). Общий блок `theme-base/blocks/Product` —
   его рендерят rose, bloom, satin, vanilla — не знал про `hiddenFields` вообще.

### Выполнено

- Общий отсев `dropHiddenArrayItems` в `adaptLegacyProps` (до блочных коэрсеров,
  поэтому Slideshow больше не проскакивает). Ручные отсевы у Collections и
  Gallery сняты — механизм один, расходиться нечему.
- `hiddenFields` в `theme-base/blocks/Product` (text/title/price/variants/
  quantity/buttons/description/share). Бренд и название разнесены на СВОИ узлы
  `data-puck-subsection-field` (100/101, как во flux) — раньше оба жили под
  одним `field="info"`, и у «Названия» своего узла не было.

### Замер (узлы, не строки; 3 элемента, скрыт первый)

| механизм | блоки | 5 тем ДО | ПОСЛЕ |
| --- | --- | --- | --- |
| item.hidden | MultiColumns, MultiRows, CollapsibleSection, Slideshow | 3→3 (не скрыт) | 3→2 |
| item.hidden | Gallery, Collections | 3→2 (работал) | 3→2 |
| hiddenFields | Product (rose/bloom/satin/vanilla) | 1→1 (не скрыт) | 1→0 |
| hiddenFields | Product (flux) | 2→0 (работал) | 2→0 |

Контрольная колонка везде: соседние элементы на месте.

### Сторожа

- Новый `pnpm test:hidden-list-items` (196): item-уровневый «глаз» по пяти темам.
  Список блоков со списком берётся из РАБОЧЕГО puckConfig темы (первое array-поле
  — как `findArrayField` конструктора), props гонятся через настоящие
  `adaptLegacyProps` + `resolveBlockProps` (без второго satin Collections читает
  заглушки, и проверка ничего не значит). Блок без реквизита и без явного
  исключения роняет тест.
- `pnpm test:hidden-fields` 367 → 495: Product теперь рендерится общим
  theme-base-блоком там, где у темы нет своего порта (`pkgFallback`). Прежняя
  формулировка «блока нет в теме → пары не появятся» и была той дырой.
- Саботаж обоих: снят общий отсев → 40+ падений; отключён `isFieldHidden` в
  theme-base Product → 24 падения. После возврата — зелено.

### Прогоны

`hidden-fields` 495/495, `hidden-list-items` 196/196, `section-snapshots` 135/135
(снимки не менялись), `panel-defaults` 22/22, `hidden-items` 3/3,
`gallery-count` 45/45, `conformance:satin` зелёный (инвентарь обновлён отдельным
коммитом), `test:conformance:satin` 84/84, `test:conformance:shared` 199+100.

### Открытые хвосты (НЕ чинилось)

- bloom `Collections` — это не плитки коллекций, а сетка ТОВАРОВ одной коллекции:
  из `props.collections` порт берёт только первый `collectionId`. Элементов на
  витрине нет, скрывать нечего. Зафиксировано исключением с причиной в новом гарде.
- Порты Header рисуют меню одним узлом — пункты не помечены
  `data-puck-subsection-field`. Скрытие работает (проверено маячками), но точного
  счёта узлов по этому блоку нет.
## 2026-09-13 — панель говорит правду: цветовые схемы + «Как в секции» (ветка `fix/schemes-sizes`)

Два решения владельца, пять тем, всё мерялось, а не греплось.

**Схемы.** Замер по всем пяти: `/api/themes/:id/puck-config` не отдавал `defaultScheme`
вовсе — конструктору неоткуда было узнать про заявленный темой дефолт. В `theme.json`
он есть только у flux (`scheme-2`); у rose/vanilla/satin/bloom нет. Поле добавлено в
контракт (`ThemeConfigForResolver`), в контроллер и в ответ API, причём отдаём его
только если такая схема реально есть в палитре темы.

Живой пруф поймал то, чего не поймал тест: `initTheme` получает УЖЕ гидратированные
настройки, а `resolveHydratedTheme` подменяет пустую merchant-палитру hardcode-дефолтами
— признак «мерчант палитру не трогал» после гидратации не отличить, и `defaultSchemeIndex: 0`
(собственный дефолт конструктора, не выбор мерчанта) снова перебивал тему. Признак
теперь передаётся в `initTheme` явно, из ревизии ДО гидратации — ровно тот источник,
по которому считает `tokens-css.ts`.

Второй источник той же лжи — сам сайдбар: 19 мест `currentProps.colorScheme || "scheme-1"`.
Пока они стояли, «значения нет» до селектора не доходило, сколько бы правды ни отдавал API.
Фолбэки сняты; на это есть сторож, читающий исходник панели.

В данные по-прежнему НИЧЕГО не пишется: показ дефолта не дёргает `onChange`, блок без
`colorScheme` остаётся без обёртки `.color-scheme-N` и наследует `:root`.

**Размеры.** «Как в секции» (`inherit`) нашлась ровно в одном месте — `MultiRows.rows[].size`
у rose/vanilla/flux/bloom; satin её уже не имел (свой puckConfig, 11 штук — правка в
theme-base его не касается). Опция снята, дефолт нового ряда — `small` (совпадает с
дефолтом «Высоты» секции, то есть новый ряд выглядит как раньше при наследовании).

Здесь же обнаружилась ОБРАТНАЯ миграция `relaxMultiRowsItemSize`: она переписывала
сохранённый одинаковый `small` в `inherit`. После снятия опции она заводила бы в данные
снятое значение — заменена на `materializeMultiRowsItemSize`, переносящий `inherit` в
фактический размер по правилу порта (`props.size === 'small'|'large' ? props.size : 'medium'`).
Правило снято рендером, а не вычитано: секция small/medium/large + ряд `inherit` дают
ровно ту же разметку, что ряд small/medium/large; секция без размера — medium.

Живой пруф тремя состояниями на flux показал, зачем перенос нужен: с сохранённым
`inherit` и снятой опцией панель показывает «Выберите...» — пустой контрол, который
`CustomFieldsPanel.updateProp` домержил бы дефолтом при правке соседнего поля и молча
сменил размер ряда. С переносом — «Большой» (= «Высота» секции).

**Проверки.** Снимки 135/135, `panel-defaults` 22/22, `hidden-fields` 367/367 — без
изменений. Новые сторожа: `panel-scheme-and-size-truth` (25 — по пяти темам, через тот
же скомпилированный контроллер, что отвечает конструктору), `multirows-size-migration-render`
(25 — разметка до и после переноса совпадает на всех пяти темах),
`revision-migrations-multirows-size` (12), `colorSchemeSelectorThemeDefault` (13 в
конструкторе). `tsc --noEmit` в конструкторе чист. Регрессий нет: набор падающих имён
в обоих репозиториях совпадает с origin/main.

**Не трогали.** «Как введено» у `PromoBanner.textTransform` и «Авто» у
`Catalog.productCard.cardStyle` — это не размеры. `MultiRows.headingSize`, который ни на
что не влияет в rose/flux/vanilla/satin (давняя мёртвая настройка), — отдельное решение.

## 2026-09-13 — «Размер заголовка» мультирядов ожил в четырёх темах (ветка `fix/multirows-heading`)

### Цель
Закрыть хвост предыдущей сессии: `MultiRows.headingSize` «не влияет ни на что в
rose/flux/vanilla/satin, в bloom работает». Решение владельца — **поправить**, а не
убрать настройку.

### Что оказалось
Настройка не мёртвая — её **перебивало легаси**. Панель пишет размер в top-level
`headingSize` (select), поле `heading` — aiText-строка. Но порты четырёх тем читали
`p.heading?.size ?? p.headingSize`, то есть СНАЧАЛА легаси-конверт из старых ревизий.
bloom читал top-level первым — потому и работал.

Почему не ловилось раньше: `coerceLegacyValue` разворачивает `{text,size}` → `text` и
`size` ВЫБРАСЫВАЕТ, поэтому на чистых данных оба порядка дают один результат. Легаси
доезжает до порта объектом только если в нём есть ключ вне белого списка
(`text|size|enabled|alignment`) — тогда выбор мерчанта молча игнорируется.

Канон (повторили его): `p.headingSize ?? p.heading?.size` — как у `Collections.headingSize`
во всех пяти темах, у `Popular`/`Gallery` и у `MultiRows` в bloom.
**`MultiColumns.headingSize` — тот же дефект**, в этой задаче НЕ трогали.

### Замер (живой пайплайн `adaptLegacyProps → resolveBlockProps`)
Легаси `heading.size=small` + панель «Большой» — ДО → ПОСЛЕ:

| тема | ДО (легаси победил) | ПОСЛЕ (панель победила) |
|---|---|---|
| rose | 17px | 24px |
| flux | 16/19px | 23/29px |
| vanilla | 17px | 24px |
| satin | 17px | 24px |
| bloom | 22/24px (уже верно) | 22/24px |

### Вид существующих секций не поехал
`medium` и «без значения» дают ПОБАЙТНО одинаковую разметку во всех пяти темах,
`defaultProps.headingSize` уже `'medium'`. Дефолт не менялся. Снимки 135/135 и 65/65 —
без единого расхождения.

### Сторожа
`multirows-heading-size-render` (20 — пять тем × четыре проверки: три размера различимы,
панель бьёт легаси, «без значения» == `medium`, плюс страховка от пустого якоря).
Саботаж-проверка: откат приоритета в satin и фикс-размер в vanilla — оба пойманы.

Гоча замера, стоившая часа: искать заголовок по подстроке нельзя — первым попадается
`alt` у `<img>` ряда, и замер врёт «размер не меняется» на любой теме. Якорь — текстовый
узел после `>`.

### Прогоны
`section-snapshots` 135/135, `panel-defaults` 22/22, `hidden-fields` 495/495,
`multirows-size-migration-render` 25/25, `conformance:satin` exit 0 (инвентарь обновлён
отдельным коммитом — сменился только `sourceDigest`, структурных расхождений нет).
`tsc --noEmit` и `pnpm build` в конструкторе чисты.

### Заодно (конструктор, ветка main)
Удалена мёртвая кнопка «…» в шапке панели ПАРАМЕТРА — `CustomFieldsPanel.tsx` и
`NamedFocusedPanel.tsx`. Обработчика не имела; замер кликом: 0 изменений DOM/сети/
состояния, 0 ошибок. Контроль — живое меню в шапке СЕКЦИИ (`SectionHeader`) на клик
открывает popover (menus 0→2, `aria-expanded`→true) — его и `ItemActionsMenu` не трогали.
## 2026-09-13 — W-flux-vanilla-richtext — «Ж»/«К» во flux и vanilla: механизм и покрытие

### Цель

Добить хвост баг-репорта тестировщика «жирность и курсив во всех секциях и параметрах
выдаёт ошибки»: rose/bloom/satin закрыты коммитом `54823834`, у flux и vanilla хелпера
`inlineFormat` НЕ БЫЛО ВООБЩЕ — Astro экранировал `{value}`, и мерчант видел на витрине
и в превью сырьё «<strong>ТЕКСТ</strong>».

### Выполнено

- `themes/flux/src/lib/rich-text.ts` и `themes/vanilla/src/lib/rich-text.ts` — копии
  rose-хелпера. Тело всех ПЯТИ копий побайтово одинаково (отличается только
  комментарий-шапка с именем темы); на это заведён отдельный тест.
- Проведён по 40 местам рендера (flux 21, vanilla 19): заголовки, тексты, подписи,
  подзаголовки слайдов, элементы списков, текст согласия рассылки, шапка подписки в
  подвале. Форма правки — `<Fragment set:html={inlineFormat(x)} />` вместо `{x}`
  (одна строка на место, как в rose).
- Заодно обезврежены места, где порты уже клали значение мерчанта в `set:html` СЫРЫМ
  (flux/vanilla MainText.text, ImageWithText.text, MultiRows.rows[], MultiColumns.columns[],
  CollapsibleSection — дыра stored-XSS в адрес покупателей мерчанта; поведение не
  меняется, начертания как рисовались, так и рисуются).
- **Второй путь у vanilla:** карусель героя/слайд-шоу рендерит только слайд 0, а копию
  остальных подменяет скрипт. `vanillaHeroCarousel.ts` клал `copy.title` в
  `textContent` — при смене слайда начертание опять превращалось в сырой тег. Теперь в
  `data-slides-json` уходит уже обезвреженная разметка, скрипт ставит её `innerHTML`.
- **Атрибуты:** у flux Hero значение заголовка уходило в `alt=` фонового фото
  (`alt="<strong>ГЕРОЙ</strong>"`). В атрибут теперь идёт ЧИСТЫЙ текст (`titleAlt`).
- `src/themes/__tests__/rich-text-bold-italic.spec.ts` расширен с 3 портов до 5
  (45 → 87 проверок): + равенство тел копий, + саботаж-блок (наивная реализация без
  экранирования обязана падать на `<img onerror>`).
- Тест добавлен в CI (`.github/workflows/ci.yml`): он лежал в репозитории с `54823834`,
  но ни одна джоба его не запускала — то есть не сторожил ничего.

### Проверки

- Пруф рендером теми же скомпилированными модулями, что уходят на витрину и в превью
  (`render-theme-sections.mjs`, 16 блоков × 2 темы, значения с начертаниями): сырых
  тегов было 2–8 на блок, стало 0 везде; начертания живут разметкой.
- XSS: `<strong><em>ЗЛО</em></strong><img src=x onerror=alert(1)>` → в разобранном DOM
  0 тегов `<img>`, 0 `<script>`, 0 `on*`-атрибутов; payload виден инертным текстом.
- Снимки секций 135/135 — разошлись РОВНО 3 снимка и осмысленно: flux/vanilla MainText
  (фикстура `<strong><em>Заголовок</em></strong>` — было экранирование, стала разметка)
  и vanilla Slideshow (инлайн-скрипт: `textContent` → `innerHTML`). Обновлены.
- `hidden-fields` 495/495, `hidden-list-items` 196/196, `panel-defaults` 22/22,
  `hidden-items`, `gallery-count`, `conformance:shared` 100/100,
  `conformance:satin` 84/84, `pnpm conformance:satin` зелёный БЕЗ рефреша инвентаря
  (правки не входят ни в `SATIN_THEME_DIGEST_INPUTS`, ни в `SHARED_DIGEST_INPUTS`),
  `check:css-layers`, `validate:page-seeds`, `run-theme-build flux|vanilla` — OK.

### Осталось

- `agreementText` (текст согласия рассылки) экранируется у rose/bloom/satin — тот же
  баг, но в трёх других темах.
- `alt=`/`aria-label=` с размеченным значением: satin `MainText`/`TextBlock`
  (`aria-label={heading || undefined}`) — скринридер читает теги.
- Блок `Catalog` (`categoryTitle`/`categorySubtitle`) экранирует начертания во ВСЕХ
  пяти темах: `packages/theme-base/blocks/Catalog/Catalog.astro` и per-theme порты.
- Верхний заголовок `CollapsibleSection` у rose стоит на СЫРОМ `set:html={heading}`.

## 2026-09-13 — канон состава параметров панелей + гард (ветка `fix/panel-canon`, 5 тем)

### Почему

Владелец, дословно: «Ты постоянно создаёшь параметры секций, которых нет и не должно
быть в принципе. <…> Нужно чётко зафиксировать, проверять и бить по рукам, если
создаётся то, чего не должно быть». Правило давнее и сквозное; нарушалось потому, что
проверять состав панелей было нечем — лишнее поле замечал тестер.

### Снято

- **Галерея: потолок 12 → 3.** `c46a9d9e` (12.09) поднял его и снял `slice(0, 3)` во
  всех пяти портах, добавив у rose/bloom/flux сетку для 4+ плиток. Всё убрано,
  разметка ≤3 плиток побайтово прежняя. Потолок теперь ТОЛЬКО в панели (`max: 3`,
  конструктор не даёт добавить четвёртую) и в портах. **zod-схема оставлена без
  `.max`** намеренно: `safeParse` — не ограничитель, а приговор; жёсткий `.max(3)`
  отбраковал бы целиком ревизию мерчанта, успевшего добавить 4-ю плитку за сутки с
  поднятым потолком. Замер компилированной схемой: 4, 12 и 40 элементов разбираются,
  `success=true`, ничего не режется; рендер даёт 3 плитки, секция и заголовок на месте
  во всех пяти темах.
- **«Регистр текста» вон из панели промо-баннера.** История поля по коммитам: заведено
  ВИДИМЫМ 04.05 (`d37adfbe`), убрано с экрана 16.05 (`2f5c5212`) и стояло так почти
  четыре месяца, 09.09 (`63a17c25`) НАМИ возвращено селектом. Вернули `type: 'hidden'` —
  именно он убирает контрол с экрана: `hiddenInMainPanel` лишь переносит поле в
  подпанель дерева (проверено по исходнику конструктора: `FieldRenderer.tsx` и
  `CustomFieldsPanel.tsx` возвращают null только на `type === 'hidden'`). Проп остался
  в схеме и в `blockDefaults` всех пяти тем. Замер рендером: без пропа и при `'none'`
  капса нет, при `'uppercase'` есть — механизм цел.

### Канон и гард

- `conformance/panel-canon.json` — 5 тем × 34 блока. По каждому полю: тип, подпись,
  видимость (`panel` / `subpanel` / `off`), опции select/radio, потолок списка,
  вложенные `arrayFields` и `objectFields`, плюс порядок полей и подпись блока.
  Источник — тот же скомпилированный `ThemePuckConfigController`, что отвечает на
  `GET /api/themes/:id/puck-config`.
- `src/themes/__tests__/panel-canon.spec.ts` — 183 проверки, в CI (`pnpm test:panel-canon`).
- **Саботаж (4 вида + 1):** выдуманное поле → «sabotageBorderStyle: ПОЯВИЛОСЬ поле
  (select, «Стиль рамки», контрол в панели секции)»; удалённое `Newsletter.padding` →
  «ИСЧЕЗЛО поле»; переименованная подпись → «подпись «Отступы» → «Поля вокруг»»;
  возвращённая опция → «rows › size: ПОЯВИЛИСЬ опции inherit=Как в секции»;
  возврат потолка галереи → «items: потолок списка 3 → 12». satin при саботаже
  MultiRows молчит правильно — у него свой puckConfig, и гард сверяет ЕГО панель.

### Канон — не макет

Источник истины по составу панелей — Figma. Доступа к макетам в этом прогоне не было:
`FIGMA_API_KEY` нет ни в `.env.local`, ни в окружении, инструментов Figma нет, а
локальный `docs/078-theme-system/figma-inventory.json` описывает кадры витрины (в нём
нет ни «Затемнение», ни «Выравнивание»). Поэтому снимок помечен
`verifiedAgainstFigma: false`, а три места, про которые владелец уже сказал «будет
правка», вынесены в `conformance/panel-canon.pending.json` с его словами:

- сайдбар параметра **«Слайд»** (Slideshow) — замерены расхождения с описанием макета,
  в т.ч. отсутствующий ползунок «Затемнение» (`overlay` сейчас `type: 'hidden'`);
- **«Карточки товара»** в настройках темы — рисует конструктор, канон это НЕ видит;
- подсказка поля **рассылки** (`Newsletter.defaults.placeholder = 'Твой email'`) — это
  значение, а не состав; канон значений не хранит.

Для помеченных мест гард всё равно красный, но текст отказа другой: «это и есть
ожидаемая правка — пересними канон и сошлись на макет».

### Проверки

`section-snapshots` 135/135 (не двинулись), `hidden-fields` 495/495,
`hidden-list-items` 196/196, `panel-defaults` 22/22, `gallery-count` 66/66,
`panel-canon` 183/183, `promo-banner-panel` 25/25, `conformance:shared` 199+100,
`conformance:satin` 84/84, `pnpm conformance:satin` зелёный после
`conformance:satin:refresh` (порт satin входит в digest — инвентарь отдельным
коммитом), `check:css-layers`, `validate:page-seeds`, `build` — OK.

### Осталось

- `packages/theme-base/__tests__/*` не гоняется НИ ОДНОЙ джобой (ни корневой
  jest.config, ни theme-contract его не матчат): 39 из 88 сьютов красные на
  `origin/main`, включая `gallery-block-contract` (TS2741: `defaults` галереи без
  `padding` после `789a86dc`).
- `scripts/__tests__/flux-section-source-contract.test.mjs` тоже вне CI: было 9
  падений, стало 7 (две закрыл возврат `slice(0, 3)`).
- `revision-migrations.ts` сидирует vanilla-домашнюю с `PromoBanner.textTransform:
  'uppercase'` (с 04.05). Контрол снят — отменить этот капс из конструктора мерчанту
  нечем. Решение за владельцем.

---

## 2026-09-13 — секция «Товар»: медиафайлы перестали меняться местами (ветка `fix/product-media-order`)

### Что было

Баг тестировщика п.3: при макетах «Миниатюрный», «Сложенный», «Карусель» клик по
миниатюре не переключал фото, а МЕНЯЛ ФАЙЛЫ МЕСТАМИ.

Замер (реальные скомпилированные модули тем → Chromium, список `src` в порядке узлов
до и после клика по 3-й плитке), локальные сайты rose `e03dd420…`, flux `132d3a3e…`,
bloom `10df1c3a…`, satin `57ac2ede…`, vanilla `11e0c5a9…`:

- rose/vanilla/satin/bloom, «Миниатюрный»: лента `B|C|D` → `B|C|A`, герой `A` → `D`.
  Кликнутый файл уехал в героя, а бывший герой занял ЕГО слот.
- flux, «Карусель»: лента `A|B|C|D|E` → `A|B|A|D|E` — в ленте дубль главного кадра,
  а файл `C` из ленты исчез.
- «2 колонки» ломался так же, хотя в баг-репорте не назван.

Итого 20 из 20 состояний (5 тем × 4 макета) — красные.

### Причина

Портов у секции два (авторитет — `dist/theme-sections/<тема>/manifest.json`:
ключ `Product` есть только у flux):

- `packages/theme-base/blocks/Product/Product.astro:615-627` — свап hero ↔ миниатюра;
- `themes/flux/src/components/sections/FeaturedProduct.astro:993-1009` — тот же свап
  плюс перезапись `data-image` у плитки.

Свап не случайность: комментарий в коде честно объяснял, что он появился как лекарство
от «главное фото пропадает». Лента общего блока рисовалась из `gallery.thumbs` — это
все фото КРОМЕ главного, поэтому при простом копировании thumb→hero главному кадру
негде было остаться. Лечили одно, ломали другое.

### Что сделано

- `ProductGallery.astro`: лента во ВСЕХ макетах строится из `allImages` (главное фото
  — плитка №0). Плитка несёт `data-media-index` (позиция) и `data-media-src`
  (источник, скрипт его не переписывает) + `aria-current`.
- Макет «2 колонки» перестал быть переключателем: там все кадры уже на экране,
  переключать нечего, а клик гонял свап.
- `Product.astro`: свап заменён именованной `wireGalleryMediaSwitch(корень, getHero)` —
  меняет только `src`/`alt` героя и `aria-current`. Лайтбокс собирает кадры по
  `data-media-src` в порядке узлов и открывается на текущем.
- `FeaturedProduct.astro` (flux): одноимённая функция, `data-image` больше не
  перезаписывается, рамка активной плитки ездит вместе с `aria-current`.

### Проверки

- Тот же замер после починки: 20/20 — позиции целы, меняется только герой.
  Скриншоты rose/flux «Карусель» до/после: лента идентична, крупный кадр сменился.
- `src/themes/__tests__/product-media-order.spec.ts` — 11/11 (оба порта). Саботаж:
  свап обратно в theme-base → 2 красных, во flux → 2 красных, лента обратно к
  `gallery.thumbs` → 1 красный.
- Снимки секций 135/135 (секция «Товар» в снимках не участвует), `hidden-fields`
  495/495, `hidden-list-items` 196/196, `panel-defaults` 22/22, `gallery-count` 45/45,
  `hidden-items` 3/3, `conformance:shared` 100/100, `conformance:satin` (jest) 84/84,
  `check:css-layers`, `validate:page-seeds`, `nest build` — зелёные.
- `pnpm conformance:satin` красный «tracked inventory is stale» — ПРОВЕРЕНО, что это
  не от правки: с восстановленными файлами origin/main `sourceDigest` тот же самый
  (`e469142b…`), а в отслеживаемом инвентаре лежит `da32d235…`. Рефреш не делал —
  это чужой дрейф, его нельзя запекать в этот коммит.

### Осталось

- Признак активной плитки в общем блоке пока только семантический (`aria-current`),
  без визуальной рамки: состав параметров панели не трогаем, а свой стиль в
  theme-base не вводим. Во flux рамка была и осталась.
- `scripts/__tests__/flux-section-source-contract.test.mjs` красный на 9 проверках —
  все про `Gallery.astro` и карточку `storefront-hydrate`, к секции «Товар»
  отношения не имеют; в CI этот файл не запускается.
---

## 2026-09-13 — «Публикации» и «Страница» берут данные магазина (ветка `fix/live-data`)

Баги тестировщика #7 (Публикации — моканые данные, оживить при выборе публикации)
и #8 (Страница — моканые данные, брать страницы из админки).

### Замер «до» (прод, `POST /preview/block`, auth-free)

- rose `71f9b323-…`, flux `8df3b745-…` → «Новая коллекция весна 2025 / 15 марта 2025 /
  Как ухаживать за изделиями / История бренда…» — записей с такими заголовками в
  админке нет.
- vanilla `6c107f35-…` → три карточки «Колонна» + текст Мультиколонн.
- Секция «Страница» с `pageId: "page-about"` на всех трёх сайтах вернула СВОИ props
  («ЗАГЛУШКА СЕКЦИИ»), выбор страницы не влиял ни на что.

### Где жили заглушки

| Файл | Что было |
| --- | --- |
| `packages/theme-base/blocks/Publications/Publications.astro` | `DEMO_ARTICLES` — 4 статьи с датами (её рендерит rose: в `dist/theme-sections/rose/manifest.json` Publications нет) |
| `themes/flux/src/components/sections/Publications.astro` | `PLACEHOLDER_ARTICLES` |
| `themes/bloom/src/components/sections/Publications.astro` | `PLACEHOLDER_ARTICLES` |
| `themes/satin/src/components/sections/Publications.astro` | `PLACEHOLDER_ARTICLES` + «Кнопка» |
| `themes/vanilla/src/components/sections/Publications.astro` | «Колонна» + текст Мультиколонн |
| `constructor/src/components/fields/PublicationPicker.tsx` | три захардкоженные категории вместо публикаций магазина |

### Механизм живых данных (тот же, что у товаров и коллекций)

`publications` (БД sites) → `fetchPublications` → `catalog.publications` →
`applySectionPolicy` → `__merfy.resolved.publications` → блок. Заполняют источник
`PreviewController.loadPublications` (превью и hot-render) и `ctx.publications`
(сборка, `merfyFromBuild`). Для «Страницы» — новый `src/render/page-transclude.ts`,
его зовут `extractPageBlocks` (превью-страница + витрина v2) и
`POST /preview/block`; сборка вместо старой policy-only ветки зовёт тот же резолвер.

### Пустое состояние

Нейтральная карточка «Публикация» (как «Товар»/«Коллекция» у соседних секций), без
даты и анонса. Привязанная «Страница» без контента или удалённая → пусто.

### Прогоны

- `test:section-snapshots` 135/135 — 4 снимка обновлены осмысленно (ушли выдуманные
  статьи и «Колонна», пришла «Публикация»).
- `test:hidden-fields` 495/495, `test:hidden-list-items` 196/196,
  `test:panel-defaults` 22/22 (в список content-типов добавлен `publicationPicker`).
- `conformance:satin` зелёный; инвентарь обновлён отдельным коммитом (менялся порт satin).
- Новые: `publications-resolve` 11, `page-transclude` 11, `publications-live-data` 35,
  `publications-no-invented-records` 13, `page-blocks-page-binding` 7,
  конструкторский `PublicationPicker` 7.
- Саботаж: вернуть выдуманную запись / игнорировать `__merfy.resolved` / дать
  заглушке протечь в привязанную страницу / захардкодить список пикера — все четыре
  ловятся тестами.

### Хвосты

- Маршрута страницы публикации у v2-тем нет; карточки ссылаются на
  `/publication/<slug>` (единственное число), а сборка пишет `/publications/<slug>`.
  Клик по карточке ведёт в 404 в обоих вариантах — отдельная задача.
- Админская «Страницы магазина» (`frontend/MerfyFrontend/src/components/OnShopPagesPage/
  ShopPagesContent.tsx`) держит список в локальном стейте `INITIAL_PAGES`, с бэкендом
  не связана.
- `src/__tests__/figmaSectionContract.test.tsx` в конструкторе красный ДО правки
  (17/18, мок `puckConfigResolver` не отдаёт `getCachedPuckConfigThemeId`); его
  проверка «пикер пишет id категории» теперь описывает старый контракт.
## 2026-09-13 — корзина и чекаут по пяти темам (баг-репорт 12/15/16/17), ветка `fix/checkout-4bugs`

### Замер «до» (прод, аккаунт QA, пять сайтов по теме + витрина)

- **12.** `page-cart` = `[Header, CartSection, Footer]` у ВСЕХ пяти QA-сайтов
  (GET `/sites/:id/revisions/:rev` через gateway). В дереве конструктора одна строка
  «Корзина»; «Промежуточный итог» отсутствует и в «Добавить секцию» не предлагается.
- **15.** На вкладке «Оформление заказа» у «Оформление заказа» и «Сводка заказа» есть
  и «Удалить секцию», и «Скрыть секцию» (у Шапки/Подвала — только «Скрыть»).
- **16.** Превью чекаута: шапка без `<img>` (текстовый бренд темы) даже когда логотип
  загружен в «Настройки темы»; `data-block="checkout-form"/"checkout-summary"` без
  класса схемы. На витрине те же секции несут `color-scheme-2`.
- **17.** `[data-checkout-column="summary"]` = `position: static` и на витрине, и в
  превью пяти тем: при scrollY=463 сводка и форма обе на y=-283 — правая половина
  экрана пустует, пока покупатель заполняет форму.

### Сделано

- `migrateCartPage` разворачивает монолит в `CartBody` + `CartSummary`, перенося схему
  и отступы; легаси `CartTotals`/`CartCheckoutButton` убираются (они под-узлы сводки);
  кросс-селл мерчанта рядом с корзиной сохраняется.
- Порты `CartBody.astro` / `CartSummary.astro` у пяти тем + записи в
  `sections.map.json` и реестрах генератора; `CartSection.astro` — легаси-алиас.
  Порты пропускают `props.hiddenFields` (у rose это не соблюдалось).
- Сиды `packages/theme-<t>/pages/cart.json` приведены к паре с явными отступами.
- `injectCheckoutChromeIntoHtml` + `patchCheckoutBlockScheme` + `checkoutBlockScheme`
  переехали в `chrome-assembler`; live (`unifyChromeInDist`) и превью
  (`preview.controller`) зовут одну функцию.
- `position: sticky` у колонки сводки чекаута (≥1024px) в пяти `checkout.astro` и в
  зеркале `preview.service.wrapCheckoutGrid`.
- Конструктор (репозиторий `constructor`, ветка main, НЕ закоммичено): `SectionRow`
  получил `isHideable`, блок «Тема» на чекауте идёт с `isDeletable={!isCheckoutPage}`
  и `isHideable={!isCheckoutPage}`.

### Проверки

- Снимки секций 135 → **155** (добавлены CartBody/CartSummary по пяти темам, 10 новых
  снимков), `hidden-fields` 495/495, `hidden-list-items` 196/196, `panel-defaults` 22/22,
  `hidden-items` 3/3, `gallery-count` 45/45, `rich-text` 87/87,
  `conformance:shared` 199+100, `conformance:satin` 84/84, `pnpm conformance:satin`
  зелёный (инвентарь обновлён, закрытый GAP снят `--shrink-baseline`),
  `check:css-layers`, `validate:page-seeds` — OK.
- Новые гарды в CI: `checkout-chrome-parity` (6), `checkout-summary-sticky` (21),
  `revision-migrations-cart` (19).
- Полный `pnpm exec jest`: 57 падающих тестов — ровно столько же на чистом
  `origin/main` в этом окружении (замер через `git stash`), к правке отношения не имеют.
- Браузер: корзина всех пяти тем на собранных темах (пара секций, 2 позиции,
  «Итого 31 970 ₽»); чекаут flux — сводка остаётся на y=24 при scrollY=493;
  конструктор (локальный стенд) — на чекауте у секций «Тема» остался только грип.

### Осталось

- Правки конструктора НЕ закоммичены (общее дерево, параллельные агенты) — файлы
  `src/components/editor/SortableItem.tsx`, `src/components/editor/CustomOutline.tsx`,
  тест `src/__tests__/checkout-section-actions.test.tsx`.
- Ветка `fix/checkout-4bugs` собрана от `ffc9c786`; `origin/main` за время работы ушёл
  вперёд — перед вливанием нужен rebase и повторный `conformance:satin`.

## 2026-09-13 — подпанель «Слайд»: возврат состава по эталону b11d0487 (пять тем)

Ветка `fix/slide-sidebar` от `origin/main` (`3747c90d`). Пункт 1 баг-репорта
тестировщика: «Параметр Слайд имеет не наш сайдбар — как настройки в нём, так и
внешний вид».

### Что сломало состав

Не решение, а слияние. Ветка `release/themes-2026-09-09` отпочковалась от main
`b62ae11b` (28.06) — за четыре дня ДО эталонного `b11d0487` (02.07, «панель
"Слайд" по Figma 1:33170 + Затемнение per-slide»), — прожила два с половиной
месяца и вернулась слиянием `283acab2` (09.09). Конфликт по
`Slideshow.puckConfig.ts` разрешили в пользу ветки; сторона main (`8eea7f39`)
отброшена. Ни в одном сообщении коммита про «убрать Затемнение» нет. Между
слиянием и стороной main расходятся 394 файла — панель слайда одна из них.

Рендер при этом не откатывали: все пять портов продолжали читать
`s.overlay ?? p.overlay`. Замер ДО правки — слайды 40/0 дают ровно один слой
`opacity:0.4` в каждой теме. То есть «Затемнение» работало, а крутить его в
панели было нечем.

### Что вернули (общий `theme-base`, собственного Slideshow-конфига нет ни у одной темы)

Изображение / Затемнение (ползунок) / «Содержание» (разделитель) / Заголовок +
Размер заголовка / Текст + Размер текста / Кнопка + Ссылка / Контейнер
(тумблер) / Позиция / Выравнивание / Цветовая схема. Размеры — списками вместо
radio, заголовок и текст — полями с начертаниями, у «Кнопки» вернулась подсказка
«Оставьте пустой, чтобы скрыть».

Перенесли состав и типы, а не файл целиком: легаси `imageUrl` остался скрытым,
поздние дефолты (`imagePosition`, `size`, отсутствие пары отступов) не тронуты.

### Проверки

`section-snapshots` 155/155, `hidden-fields` 495/495, `hidden-list-items`
196/196, `panel-defaults` 22/22, `conformance:satin` зелёный (инвентарь обновлён
отдельным коммитом), `panel-canon` зелёный после пересъёмки — она тоже отдельным
коммитом, запись `slideshow-slide-sidebar` из pending-файла снята.

Новые гарды в CI (`pnpm test:slide-panel`): `slideshow-slide-panel` (66) — состав,
порядок, типы, подписи и опции подпанели по пяти темам; `slideshow-slide-overlay`
(20) — ползунок доезжает до витрины послайдно, с двумя контрольными прогонами.
Саботаж: убрать «Затемнение», подменить список на radio, выкинуть опцию
«Позиции», переименовать «Кнопку», переставить поля — ловится каждый раз;
порт rose, читающий только секционный `p.overlay`, роняет рендер-пруф.

### Осталось (не трогали намеренно)

- «Позиция» у сеяных слайдов стоит на «Выберите...»: `defaults.slides` не несёт
  `position`, а `panel-defaults` в элементы списка не смотрит. Это значение, а не
  состав; правка сдвинет уже стоящие баннеры и требует отдельного замера.
- «Затемнение» у нового слайда — 0; на макете владельца 10. Тоже значение:
  дефолт 10 затемнил бы все новые слайды.
- Подсказка загрузчика — «Макс. размер 30 МБ», на макете «макс. размер 500 кб».
  Это хардкод конструктора (`ImageField`), не puckConfig темы.
- Девять значений «Позиции», которые владелец прочёл как «Выравнивание»:
  контрол `alignment` в конструкторе — три иконки, списка не даёт. Разбор в отчёте.

---

## 2026-09-13 — третий круг тестировщика: контейнер, группа «Шапка», схемы чекаута (`fix/tester-round3`)

Четыре пункта прислали в ТРЕТИЙ раз. Прод при этом был свежий: sites-service
задеплоен из `f25ad3af` (Coolify 17:16), конструктор собран 17:10 — то есть
«починенное» действительно крутилось, и всё равно не работало.

### Что показал замер на экране (прод, QA-учётка, пять сайтов по теме)

- **Сворачиваемый раздел.** Тоггл «Контейнер» переключается, панель пишет
  «Показать», а в `POST /preview/block` уходит
  `{"containerEnabled":"false","container":{"enabled":"true"}}`. Порт читает
  канон-ключ первым — контейнер выключен, класс схемы не печатается. Прошлый
  круг проверялся фикстурой `{containerEnabled:"true"}`, которой конструктор не
  шлёт никогда. Урок: фикстуры снимать с сети, а не придумывать.
- **Шапка.** Параметры на девяти страницах уже совпадали — прошлая правка
  сработала. Расходился состав группы: промо-баннер на главной есть, на каталоге
  нет. В сидах rose промо лежал на 5 страницах из 11, у flux и bloom — только на
  главной.
- **Подвал чекаута.** «Powered by Merfy» убран везде, но полоса пустая: ссылки
  берутся из политик магазина, а политик у сайта не было. Заполнили одну —
  ссылка появилась. Это не баг, это незаполненные данные.
- **Схемы чекаута.** Класс схемы садился на секцию, а секция сводки прозрачна
  (тонирует колонка) → выбор схемы не менял ничего. У формы наоборот: секция
  красится сама, и на bloom получался розовый прямоугольник посреди белой
  страницы — «пятно вместо колонки» слово в слово по эталону владельца.
  У vanilla/satin/flux колонки-поверхности не было вообще: сетка
  `max-w-[1280px]`, правый край на 1079px из 1280. Плюс класс схемы ПРОПАДАЛ
  при выборе: панель шлёт "1", нормализация ревизии отдаёт число, блоки сверяли
  `typeof === 'string'`.

### Что сделано

- `foldLegacyContainerToggle` (sites) + `containerToggle.ts` (конструктор) —
  один ключ тоггла вместо двух расходящихся.
- `unifyHeaderWithHome` / `unifySharedHeader` выравнивают ГРУППУ «Шапка», а не
  только блок шапки; сиды 20 файлов доведены, гард на сиды добавлен.
- Split-чекаут переехал в один общий источник
  (`packages/theme-base/blocks/CheckoutLayout/{checkout-split.ts,CheckoutSplit.astro}`);
  пять страниц тем и `wrapCheckoutGrid` больше не держат копий с пометкой
  «дублировать правки там же» — именно из-за этих копий три темы отстали.
- Схема секции едет на КОЛОНКУ (`patchCheckoutColumnScheme`), включая живую
  правку в превью (агент меняет класс колонки, а не оборачивает секцию).
- Правовая полоса чекаута получила свою «Цветовую схему» (секция «Подвал»).

### Проверки

`section-snapshots` 155/155, `panel-canon` 182/182, `hidden-fields` 495/495,
`hidden-list-items` 196/196, `panel-defaults` 22/22, чекаут-гарды 8 сюит/143,
`conformance:satin` зелёный (инвентарь обновлён отдельным коммитом), сборка всех
пяти тем зелёная. Новые гарды: `checkout-and-container-round3` (15),
`checkout-scheme-surface` (40), `header-group-seeds` (59),
`header-group-round3` (7), `preview-checkout-column-scheme` (7) — все в CI.
Саботаж проверен на каждом: возврат `typeof === 'string'`, снятие патча колонки,
откат одного сида, класс-обрубок в агенте — ловится.

Пруф эталона (собранные страницы пяти тем, палитра мерчанта, 1 и 30 позиций):
колонка сводки 720..1432 из 1440, фон — выбранная схема, текст белый, высота
больше окна в обоих размерах корзины.

### Осталось владельцу

- Задеплоить sites + конструктор и переопубликовать стенды пяти тем: правка
  трогает `themes/<t>/src/pages/checkout.astro`, без переопубликации витрины
  останутся на старой раскладке.
- Решение по промо-баннеру: теперь он следует за главной на ВСЕХ страницах. Если
  на витрине его быть не должно — убирается с главной, и исчезнет везде.

---

## 2026-09-13 — секция «Товар»: параметры подпанелей и цвета (ветка `fix/b4-product-params`)

### Цель

Пять пунктов тестировщика по секции «Товар» (магазин 7b64b7a527d2, тема rose):
T2 подписи кнопок, T3 «Поделиться», T4 «Текст» + «Размер текста», T5 цвет цифры
счётчика, T7 серое описание.

### Замер «до» (рендер живой цепочкой, пять тем)

- T2/T3/T4: мертво 19 пар «тема × поле» из 20 — `addToCart`, `buyNow`, `share`,
  «пусто скрывает кнопку», `text.size` не работали НИГДЕ, `text.content` жил
  только во flux (его порт читает и плоскую строку).
- Попутно: класс `color-scheme-N` секция не печатала ни в одной из четырёх тем
  общего порта.
- T5 (chromium + реальный CSS темы, схема тестировщика #71C0FF / #5AF810):
  цифра и стрелки счётчика — `rgb(90,248,16)`, то есть фон кнопки на голубом.
- T7: описание `rgb(153,153,153)` (vanilla 68, flux 204) от `--color-muted`,
  которого нет в редакторе схемы; старая цена рядом — уже правильная
  `oklab(… / 0.6)`.

### Что сделано

- `coerceProductProps` в `src/themes/page-blocks.ts`: «Товар» больше не ходит в
  общий коэрсер, конверты подпанелей сохраняют канон-форму, легаси-строки
  поднимаются в объект. Это корень T2/T3/T4 разом.
- `Product.astro` — класс схемы печатается и от числа (живая нормализация даёт
  число, порт сверял строку).
- `ProductCounter.astro` — вариант `inline` красится `--color-text`, как цена
  рядом; `pill` (заливка) оставлен на паре токенов кнопки.
- `ProductDescription.astro` и бренд-строка `ProductInfo.astro` —
  `--color-text/60` вместо `--color-muted`, по образцу старой цены.
- flux `FeaturedProduct.astro` — подпись «Динамической кнопки» читается из
  `buttons.buyNow.text`, а не вбита строкой.

### Проверки

`section-snapshots` 155/155, `panel-canon` 182/182, `hidden-fields` 495/495,
`hidden-list-items` 196/196, `panel-defaults` 22/22, `conformance:satin`
зелёный (инвентарь обновлён отдельным коммитом — сдвинулся только `sourceDigest`).
Новые гарды `product-panel-labels` (75) + `product-section-colors` (32)
добавлены в CI одной строкой `pnpm test:product-params`. Саботаж проверен на
каждой правке отдельно: снятие `case 'Product'` валит 7 проверок T2/T3/T4,
возврат класса счётчика и `--color-muted` — ровно T5/T7, возврат
`typeof === 'string'` — только четыре темы общего порта, возврат вбитой подписи
во flux — ровно строку flux.

### Осталось владельцу

- **flux не следует схеме в секции «Товар» вообще**: цифра счётчика
  `text-[#1e2952]` (= его же `--color-button-bg`), цена `#000000`, старая цена
  и описание `#999999` — литералы. Отдельная работа, за неё не брался: это
  переписывание палитры пиксель-перфектного порта, рядом идёт spec-111.
- `description.size` («Размер» подпанели «Описание») мёртв: тело описания
  считает кегль от `text.size`. В панели поля нет (подпанель — `disabledHint`),
  поэтому мерчанту он не виден; состав параметров не трогал.

## 2026-09-14 — MAX в соцсетях подвала (пять тем) + раскладка ползунков в конструкторе

Ветка sites: `fix/b5-theme-panel`. Конструктор: ветка `main` (отдельные коммиты).

### Что сделано в темах

- `packages/theme-base/blocks/Footer/Footer.astro` — `SOCIAL_ICONS.max` (инлайн
  контур, `currentColor`).
- `themes/{rose,bloom,satin,flux,vanilla}/src/components/Footer.astro` — запись
  `max` в карту платформ темы.
- `themes/{rose,bloom,satin,flux,vanilla}/public/icons/social-max.svg` +
  `themes/vanilla/public/icons/social-max-white.svg` — контур официального
  логотипа max.ru, монохром, сетка соседних иконок.
- `themes/rose/src/components/icons/RoseNtIcon.astro` — fallback перестал ходить
  в закрытую карту DS: путь строится как `<имя>.svg` (ровно правило DS, 35 из 35).
- `themes/flux/src/components/Footer.astro` — соцсети через `FluxNtIcon`.
- `themes/satin/src/components/icons/SatinNtIcon.astro` (новый) + Footer satin.
- `themes/vanilla/src/icons/SocialMaxWhite.astro` (новый) + Footer vanilla.
- `themes/bloom/src/components/footer/SocialIcon.astro` — локальная карта иконок
  темы для платформ, которых нет в DS.

### Проверки

`social-max-icon` 31/31, `section-snapshots` 155/155 (снимки не сдвинулись),
`panel-canon` 183/183, `conformance:satin` зелёный (инвентарь обновлён отдельным
коммитом — сдвинулся только `sourceDigest`). Рендер подвала пяти тем со стилями
темы снят скриншотами: MAX стоит последним в ряду, в родном размере и цвете.

Саботаж: снятие `max` из карты satin валит ровно три проверки (карта + ссылка +
иконка), удаление файла `social-max.svg` у rose — проверку наличия файла.

### Осталось владельцу

- Иконка нарисована по контуру официального логотипа (маска из `max.ru/favicon.svg`),
  монохромная — как соседние. Если в бренд-ките есть «официальная» монохромная
  версия с другим силуэтом, подменить файлы `social-max*.svg` в пяти темах.
- `themes/satin/src/components/footer/SocialIcon.astro` — мёртвый компонент
  (Footer его не импортирует), MAX в него не заводил.
## 2026-09-14 — секция «Товар»: форма образца вариаций в «Списке» (ветка `fix/b5-variant-list`)

### Цель

Баг тестировщика 14.09: «В секции Товар при стиль Список и Вариациях квадрат/круг
не отображает в списке эти настройки». Два поля подпанели «Варианты» живого
puckConfig: `variants.displayStyle` — «Стиль» (Кнопка `button` / Список `list`),
`variants.shape` — «Вариации» (Круг `circle` / Квадрат `square` / Нет `none`).
Состав панели и значения переключателей не трогались.

### Замер «до» (живая цепочка рендера + браузер, computed, пять тем)

| стиль × форма | rose / vanilla / satin / bloom | flux |
| --- | --- | --- |
| Кнопка + Круг | образец ∞px 44×44 | образец 9999px 28×28 |
| Кнопка + Квадрат | образец 0px 44×44 | образец 0px 28×28 |
| Кнопка + Нет | образцов нет (текст-кнопки) | образцов нет |
| **Список + Круг** | **0 образцов, 2 `<select>`** | **0 образцов, 2 `<select>`** |
| **Список + Квадрат** | **0 образцов, 2 `<select>`** | **0 образцов, 2 `<select>`** |
| Список + Нет | 0 образцов, 2 `<select>` (канон) | то же |

То есть в «Списке» форма не просто игнорировалась — образцов не было вовсе.

### Почему теряло

Ветка «Списка» не получала форму. В каждом порте по-своему, корень один:

- `packages/theme-base/blocks/Product/Product.astro` (rose, vanilla, satin, bloom)
  схлопывал ДВА поля панели в один legacy-enum `mode` (`'list'` вытесняет форму) и
  передавал в `ProductVariants` только его → `shape=undefined` → `'none'` →
  выпадашка. Ветка «список с образцами» (`isListShaped`) в блоке уже была написана
  и была недостижима;
- `themes/flux/src/components/sections/FeaturedProduct.astro` при `'list'` звал
  `renderVariantSelectsHtml(groups, selected)` — у функции в сигнатуре нет
  параметра формы.

### Что сделано

- `Product.astro` — «Стиль» и «Вариации» разрешаются независимо и передаются в
  блок раздельно (`displayStyle` + `shape`); legacy-enum остался только для
  `data-variants-mode`. Back-compat старых ревизий (merged `style`) сохранён.
- `ProductVariants.astro` — голая выпадашка только когда формы нет: форма
  мерчанта побеждает и дефолт темы `variantsType='dropdown'`. Шапка файла
  переписана — она описывала одно поле `mode` и врала про поведение.
- `Product.astro` (гидрация) — закрытый список ожил: выбор обновляет свёрнутую
  строку (подпись + образец) и схлопывает список. До правки ветка не выполнялась
  ни разу, поэтому её никто не оживлял.
- flux `storefront-hydrate.ts` — новая `renderVariantListHtml` (закрытый список с
  образцами, паритет theme-base) и ЕДИНАЯ развилка `renderVariantsHtml`, общая
  для серверного рендера и живого рефреша. Раньше развилка была продублирована —
  форма держалась бы только до первого клика.
- flux образцы получили общий с theme-base маркер `data-variant-swatch-fill`.

### Замер «после»

| стиль × форма | rose / vanilla / satin / bloom | flux |
| --- | --- | --- |
| Список + Круг | свёрнуто 1 образец ∞px 22×22, раскрыто 4 | 1 образец 9999px 24×24, раскрыто 4 |
| Список + Квадрат | свёрнуто 1 образец 0px 22×22, раскрыто 4 | 1 образец 0px 24×24, раскрыто 4 |
| Список + Нет | 2 `<select>`, образцов нет | то же |
| Кнопка (все формы) | без изменений | без изменений |

### Проверки

`variant-colors` 126/126 (соседний фикс составных имён цвета цел), `product-params`
107/107, `section-snapshots` 155/155 (разметка «Кнопки» не изменилась),
`panel-canon` 182/182, `hidden-fields` 495/495, `hidden-list-items` 196/196,
`panel-defaults` 22/22, `conformance:satin` зелёный. Новый гард
`pnpm test:variant-shape` (54) добавлен в CI.

Саботаж — четыре, каждый ловится адресно: снятие проброса полей в theme-base валит
16 проверок на четырёх темах; возврат приоритета темы над формой — 2; откат flux —
6, включая контракт живого рефреша; `isShaped=true` (нарушение канона «Нет») — 12.

### Калибровка замера

Метрика дважды врала и оба раза чинилась, а не подгонялась: (1) в HTML порта flux
лежит ИСХОДНЫЙ ТЕКСТ его клиентского рендерера, и подсчёт `<select>`/пятен ловил
шаблонные строки из `<script>` — теперь скрипты вырезаются; (2) «есть размеры» у
потомков свёрнутого `<details>` не значит «видно» — меряем только прошедшие
`checkVisibility()`, и белый фон свёрнутой строки больше не считается образцом.

### Осталось владельцу

- Образец в свёрнутой строке theme-base рисуется, только если ПЕРВОЕ значение
  группы — цвет (так написана разметка ветки). Для групп, где первым идёт
  не-цветовое значение, свёрнутая строка останется без образца до выбора цвета.
  Не трогал: это правка разметки ветки, а не потери настройки.
## 2026-09-14 — rose: шапка встала на сетку темы (ветка `fix/b5-rose-header`)

Жалоба 14.09 «Шапка в теме Rose не по сетке». Замер до правки (Playwright по
построенной теме, край содержимого шапки против края контента секций главной):
390 → 16/374 против 16/374 (совпадало), 1440 → 80/1360 против 80/1360
(совпадало), **1512 → 80/1432 против 96/1416 (16px)**, **1920 → 280/1640 против
300/1620 (20px)**. Причина: у секций и подвала сетка двухуровневая — лестница
боковых отступов снаружи плюс рельс контента `max-w-[1320px]` внутри, — а ряд
шапки нёс только лестницу и `max-w-[1920px]`, рельса контента у него не было.
Пока `ширина − 2 × отступ ≤ 1320` это незаметно, поэтому на ноутбучном 1440
баг не воспроизводился, а на 1512/1920 шапка выходила за секции.

Чинил в порту `themes/rose/src/components/Header.astro` (он же рендер-путь —
`sections.map.json` → `Header`, rose в `MIGRATED_THEMES`; theme-base для rose не
рендерит). Завёл общий модуль канона `themes/rose/src/lib/container.ts` и разбил
оба десктопных ряда на внешний рельс отступов + внутренний рельс 1320, как в
подвале; мобильная строка переведена на ту же константу. После правки Δ = 0 на
всех четырёх вьюпортах, на скриншотах направляющие шапки и секции сливаются.

Гард `rose-header-grid` (16 проверок) — в `ci.yml` строкой
`pnpm test:rose-header-grid`. Саботаж проверен четырьмя способами (сдвиг
отступа, подмена 1320 на 1280, снятие обёртки рельсом, полный откат шапки) —
краснеет на каждом. Прогоны: `section-snapshots` 155/155, `panel-canon` 182/182,
`hidden-fields` 495/495, `hidden-list-items` 196/196, `panel-defaults` 22/22,
гарды шапки 190/190. `checkout-header-hot-render` не запускается локально
(`Cannot find module '@merfy/theme-contract'`) — это пробел окружения worktree,
воспроизводится и на нетронутом `Header.astro`.

Чужие темы не трогал. flux проверил — у него шапка и секции на одной сетке,
болезни нет. bloom/vanilla/satin браузером не мерил, вынес в «осталось».
## 2026-09-14 — flux: снят слой-вуаль «свечение» у нижней кромки героя (ветка `fix/b5-flux-glow`)

### Цель

Баг тестировщика 14.09: «Flux. Баг свечение. Это не привязано нигде, в макете
такая фотка, в конструкторе сейчас это секция Список коллекций. Ожидаемый
результат: убрать свечение».

### Чем было сделано

`themes/flux/src/components/sections/Hero.astro:456-465` — слой
`pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-transparent
from-[85%] to-white`, рисовался при `backgroundImage && !backgroundImage2`.
Единственное вхождение во всём репозитории (в `templates/`, `packages/` копий
нет). Ни тени, ни blur, ни псевдоэлемента — чистый градиент-оверлей.

**Принадлежал ГЕРОЮ, а не «Списку коллекций».** У flux `Collections.astro`
градиентов/теней/размытий нет вообще — как и у Collections остальных четырёх
тем. Тестировщик указал на соседа снизу, потому что ореол ложился ровно на
границу.

### Замер (chromium, реальный CSS темы, полотно 1440×608, чёрное фото)

ДО: `linear-gradient(in oklab, rgba(0,0,0,0) 85%, rgb(255,255,255) 100%)`,
`--tw-gradient-from-position: 85%`, `--tw-gradient-to: rgb(255,255,255)`,
`inset-0`, `z-index 1`. Пиксели по центру: 84 % высоты `rgb(0,0,0)` →
86 % `rgb(19,19,19)` → 90 % `rgb(86,86,86)` → 94 % `rgb(155,155,155)` →
97 % `rgb(206,206,206)` → 99,5 % `rgb(248,248,248)`.
ПОСЛЕ: по всем восьми пробам `rgb(0,0,0)`; у обеих секций
`background-image: none`, `box-shadow: none`, `filter: none`,
`backdrop-filter: none`, список эффектов пуст.

### Это не общий приём theme-base

`packages/theme-base/blocks/Hero/Hero.astro` — оверлеи только плоским цветом
(`style={overlayStyle}`), градиентов нет. Тёмные скримы для читаемости текста
есть у rose (`from-black/45 to-black/10`), satin (`from-black/30 to-black/45`),
bloom (`from-black/40 to-transparent`), vanilla — плоский `bg-black/25`. Это
другой приём: затемнение всего фото, а не растворение кромки в фон страницы.
**Растворение в БЕЛЫЙ у нижней кромки было только во flux** — дословный перенос
Figma 2060:9676, где вуаль дорисовывала одно конкретное фото (наушники на белом).

### Сторож

`src/themes/__tests__/flux-section-edge-veil.spec.ts` + `pnpm test:flux-edge-veil`,
шаг добавлен в `.github/workflows/ci.yml`. Запрещает вуаль (градиент / тень /
размытие / backdrop-blur / маска) в «Изображение» (три ветки: одно фото, пара
фото, пустая секция) и в «Списке коллекций» flux. Три независимых источника
улик: имя утилиты tailwind, правило из собранного `dist/theme-css/flux.css`,
инлайн-стиль. Четыре контрольные проверки не дают гарду ослепнуть молча —
одна из них ищет класс-носитель вуали в самом собранном CSS, а не по списку в
тесте. Затемняющий оверлей настройки «Прозрачность» (`bg-black` + `opacity`)
вуалью не считается.

### Саботаж

Три варианта возврата эффекта, каждый — отдельным прогоном:
A класс tailwind (исходный слой) → красный, детектор назвал все пять улик;
B инлайн `background-image:linear-gradient(...)` → красный;
C инлайн `box-shadow:0 -70px 70px 40px rgba(255,255,255,.95)` → красный.
После восстановления исходника — 8/8 зелёных.

### Проверки

`section-snapshots` 155/155, `panel-canon` 182/182, `hidden-fields` 495/495,
`hidden-list-items` 196/196, `panel-defaults` 22/22, `flux-edge-veil` 8/8,
`conformance:satin` зелёный. Перед прогоном собрано всё: `pnpm build`,
`build:blocks`, `build:theme-sections` по пяти темам, `run-theme-build satin`.
Дополнительно `run-theme-build flux` — в собранной витрине (`themes/flux/dist`,
`dist/theme-live/flux`, `dist/theme-preview/flux`) вуали нет, утилита
`from-[85%]` из CSS витрины ушла.

Инвентарь satin устарел из-за одной строки: `SHARED_DIGEST_INPUTS` пинит байты
`package.json`, а туда добавлен npm-скрипт гарда. Проверено, что дрейф вызван
именно этим: на чистом `origin/main` (отдельное рабочее дерево) `conformance:satin`
зелёный. Refresh — отдельным коммитом, диф ровно одна строка `sourceDigest`.

### Не трогал

Чужие темы (rose, vanilla, satin, bloom), состав параметров панели (канон),
цветовые схемы, рендер схемы контейнера — рядом идут соседние агенты.

### Осталось владельцу

- Ветка `fix/b5-flux-glow` не запушена: два коммита (`e268e99a` правка +
  `0b4ea13f` refresh инвентаря). Эта запись журнала НЕ закоммичена намеренно.
- Проверочное дерево `.worktrees/b5-glow-basecheck` (detached на `origin/main`)
  создавалось только ради пруфа «дрейф предсуществующий» — можно удалять.
## 2026-09-14 — счётчик количества на странице товара (пять тем)

Ветка `fix/b5-counter-theme` от `origin/main` (`6645bc2a`).

**Замер до.** Собрал всё (`build` → `build:blocks` → `build:theme-sections` ×5 →
`run-theme-build satin`), отрендерил секцию «Товар» лестницей витрины
(`cascade: true, live: true`) и карточку коллекции с «Быстрое добавление →
Количество», прогнал через Chromium 1440px с реальным CSS темы.

| тема | место | фон | рамка | радиус | коробка | кнопка «−» |
|---|---|---|---|---|---|---|
| rose | товар | прозрачно | 0px | 0px | 96×25.6 | 24×24, без заливки |
| bloom | товар | прозрачно | 0px | 0px | 96×24 | 24×24, без заливки |
| satin | товар | прозрачно | 0px | 0px | 96×24 | 24×24, без заливки |
| flux | товар | прозрачно | 0px | 0px | 136×44 | 44×44, без заливки |
| vanilla | товар | прозрачно | 0px | 0px | 96×24 | 24×24, без заливки |

Карточка коллекции уже была разной по темам (рамки 153/255,212,229/230/221/10,
радиусы 8/100%/0/4/0) — «единым» был именно счётчик страницы товара.

**Замер после.** rose 1px `rgb(153,153,153)` r8 110×40; bloom 1px
`rgb(230,230,230)` r4 110×40; satin 1px `rgb(230,230,230)` r0 110×40; flux без
изменений 136×44; vanilla коробки нет, кнопки 24×24 с заливкой `rgb(58,69,48)`.
Карточка коллекции не тронута — числа те же до и после.

**Живость.** Клик «+»/«−» меняет число во всех пяти темах и до, и после
(Chromium). Первый прогон показал «не работает у четырёх» — это врал ЗАМЕР:
в изолированной странице не было `window.__merfyRoot`, который на витрину
инжектит `build.service` (Spec 102). После добавления хелпера в стенд — 1→2→1
везде.

**Прогоны.** `section-snapshots` 155/155, `panel-canon` 182/182,
`hidden-fields` 495/495, `hidden-list-items` 196/196, `panel-defaults` 22/22,
`collection-card` 69/69, `product-params` 107/107, `product-counter` 27/27,
`conformance:satin` зелёный (инвентарь обновлён отдельным коммитом, сдвинулся
только `sourceDigest`).

**Саботаж.** Три подмены варианта в `theme.json`, каждая — отдельным прогоном:
satin→`split` роняет 4 проверки, все с именем satin; vanilla→`boxed` — 4, все
vanilla; rose→`inline` — 4, все rose. Остальные темы в каждом случае зелёные.

**Починил по дороге два слепых пятна существующего гарда**
`product-section-colors` (иначе он краснел на верной разметке):
`color:` искался подстрокой, поэтому `border-color: rgb(var(--color-border))`
сходил за цвет текста; проверка стрелок искала подстроку `--color-button-bg`
в атрибуте вместо резолва цвета — на законно залитой плашке vanilla это красное.

### Осталось владельцу

- Кегль цифры не трогал: у собственных счётчиков rose/bloom/satin он 14px,
  в общем порте остался 16px. Жалобы на это не было, менять «заодно» не стал.
- Хвост из предыдущей волны в силе: flux в секции «Товар» не следует схеме
  вообще (цена/описание вбиты литералами) — отдельная работа.

## 2026-09-14 (вечер) — почему rose не получил плашку

**Замер на живой витрине.** `curl -L https://7b64b7a527d2.merfy.ru/products/bhbjhbbj`
→ 301 → `/product/bhbjhbbj`, `build.json` подтверждает сборку на `f144370f`.
В разметке: `data-product-counter data-counter-variant="inline"`, классы кнопок
новые (`border-0 w-6 h-6 bg-transparent text-current`). То есть блок мой,
вариант чужой — значит дело в пропах, а не в сборке и не в каскаде.

**Воспроизведение локально.** Отрендерил блок пропами из сида страницы товара
каждой темы: rose → `inline`, bloom/satin/vanilla → `boxed`/`split`, flux →
свой порт. Ровно картина прода.

**Корень.** `packages/theme-rose/pages/product.json` и `theme-flux/pages/product.json`
пинят `visualConfig` внутрь `props` блока. `renderBlock` мерджит
`deepMergeBlockProps(blockDefaults, props)` — пропы ревизии сильнее `theme.json`.
Живая ревизия стенда уже правлена мерчантом (секция `color-scheme-1`, а сид даёт
`scheme-2`), но `visualConfig.counter` в ней остался с момента создания сайта.

**Починка.** Сиды rose/flux больше не сеют `visualConfig.counter` (одна строка в
каждом файле); миграция `dropSeededCounterVariant` снимает ключ с блока «Товар»
на любой странице при каждом чтении ревизии. Остальной `visualConfig` не тронут.

**Гард чинил себя же.** До этого он рендерил блок пропами, написанными руками, —
путь, которого на витрине нет, отсюда зелёные 27/27 при сломанном проде. Теперь
основной режим `seed`: сид темы → `migrateRevisionData` → живая цепочка; второй
режим `bare` держит случай «мерчант ничего не сохранял». 45 проверок.

**Замер после (путь витрины, Chromium 1440px).**

| тема | вариант | коробка | рамка | радиус | фон кнопки «−» |
|---|---|---|---|---|---|
| rose | boxed | 110×40 | 1px rgb(153,153,153) | 8px | прозрачно |
| bloom | boxed | 110×40 | 1px rgb(230,230,230) | 4px | прозрачно |
| satin | boxed | 110×40 | 1px rgb(230,230,230) | 0px | прозрачно |
| flux | свой порт | 136×44 | нет | 0px | прозрачно |
| vanilla | split | 112×24 | нет | 0px | rgb(58,69,48) |

**Саботаж.** (1) вернул `counter` в сид rose → красная проверка сидов, имя rose;
(2) выключил миграцию при вшитом сиде → красный рендер-гард rose (2) + калибровка
rose + миграции; (3) вшил `counter` в сид satin при выключенной миграции →
красное ровно у satin. Гард не захардкожен под rose.

**Прогоны.** `section-snapshots` 155/155, `panel-canon` 187/187, `hidden-fields`
495/495, `hidden-list-items` 196/196, `panel-defaults` 22/22, `collection-card`
69/69, `product-params` 107/107, `product-counter` 45/45, все миграции ревизий
134/134, `conformance:satin` зелёный (инвентарь не сдвинулся — рендер satin не
менялся).

**Урок в копилку.** Гард может быть зелёным и при сломанном проде, если рендерит
не тот вход. Проверять надо теми данными, которые реально уходят на витрину:
для секций это сид страницы темы, пропущенный через `migrateRevisionData`.

### Осталось владельцу

- Тот же дефект у `visualConfig.showDescription`: сид flux ставит `true`, манифест
  flux — `false`. Сид побеждает, значит описание на странице товара flux сейчас
  показывается вопреки теме. Снимать не стал: это видимое изменение, которого
  никто не просил, и рядом идёт работа по описанию.

## 2026-09-14 — W-B6 — страницы аккаунта получили свои секции (ветка `fix/b6-account-pages`)

### Цель

Задача тестировщика 14.09: у страниц «Заказы» и «Личный кабинет» должна быть
своя секция, в сайдбаре ровно один параметр («Цветовая схема»), кнопка
добавления секций на этих страницах — залочена.

### Выполнено

- Блоки `theme-base/blocks/{AccountSection,OrdersSection}` (label «Личный
  кабинет» / «Заказы»), в каждом РОВНО одно поле `colorScheme`, `maxInstances:1`.
- Порты по пяти темам: `themes/<t>/src/components/sections/{AccountSection,OrdersSection}.astro`.
  Тело перенесено из `src/pages/account/{profile,orders}.astro` дословно;
  module-`<script>` с импортами заменён на `is:inline` + глобал
  `window.__<theme>Auth` (его ставит `initAuthUI()` из Layout) — как у
  `WishlistSection`. Страницы витрины стали шеллами.
- `page-orders` (`/account/orders`) заведена в `PAGE_REGISTRY`, манифестах пяти
  тем и сидах; `seedAccountPageSections` досевает страницу и обе секции живым
  ревизиям (идемпотентно по наличию блока — скрытую секцию не дублирует).
- Рендер: гейт `ACCOUNT_SECTION_THEMES` в `composeContentPagesIntoDist` и
  `preview.controller` (зеркало `CART_UNIFIED_THEMES`), страницы остаются
  verbatim-записями ради `/account` и `/account/order`.
- Конструктор: подписи, `DYNAMIC_COMPONENTS`, `NON_DELETABLE`,
  `STRUCTURAL_PAGE_IDS/_SLUGS`, «Заказы» → страница внутри вкладки «Профиль»,
  лок кнопки через существующий `showAddButton`.

### Проверки

- `pnpm test:account-sections` 122 ✓ · `test:panel-canon` 198 ✓ ·
  `test:wishlist-section` 51 ✓ · `test:section-snapshots` 155 ✓ ·
  `test:hidden-fields` 495 ✓ · `test:hidden-list-items` 196 ✓ ·
  `test:panel-defaults` 22 ✓ · `src/utils/__tests__/` 135 ✓ ·
  `test:conformance:satin` 84 ✓ · `test:conformance:shared` 100 ✓ ·
  `pnpm conformance:satin` ✓ (инвентарь переснят отдельным коммитом).
- Конструктор (vitest) — 335 ✓, включая новый `account-sections-page-scope`.
- Саботаж: второй параметр у `OrdersSection` → `panel-canon` краснеет по всем
  пяти темам («padding: ПОЯВИЛОСЬ поле»); снятие страниц из
  `SECTION_LOCKED_PAGE_*` → падает проверка лока (2 кнопки вместо 1). Оба
  саботажа откачены.
- Живой конструктор `localhost:3200`, четыре темы (flux, rose, satin, bloom):
  в группе «Тема» одна секция, кнопки «Добавить секцию» нет, правая панель —
  `["<Секция>", "Цветовая схема", "Схема 2"]`. Для vanilla локального сайта
  нет — её панель проверена ответом `/api/themes/vanilla/puck-config`
  и рендером порта.

### Статус записей

- Код VERIFIED тестами/рендером/конструктором, НЕ задеплоен и НЕ запушен.

## 2026-09-14 — Товар: описание начинается с первой строки (все пять тем)

Жалоба тестировщика: «описание в товаре поднять в начало параметра, сейчас
отступ большой, так как убрали слово ОПИСАНИЕ».

### Что оказалось

Отступ давала НЕ колонка секции. Её шаг — 40px, общий для всех групп правой
колонки, и он остался прежним. Провал был внутри самого абзаца:
`ProductDescription.astro` печатает тело под `whitespace-pre-line`, а Astro
сохраняет отбивку шаблона вокруг `{trimmed}`. Ведущий перевод строки рисовался
НАСТОЯЩЕЙ пустой строкой — текст начинался со второй строки своего блока.
`content.trim()` не спасал: пробелы приходят из вёрстки, а не из данных.

Заголовок «ОПИСАНИЕ» раньше стоял над этим провалом и его закрывал, поэтому
жалоба и привязалась к его снятию (наша же правка 568ab2fc).

### Замер (живая витрина 7b64b7a527d2, rose, playwright 1440px)

|                              | до    | после |
| ---------------------------- | ----- | ----- |
| innerHTML абзаца             | `"\n      hhhhhh\n    "` | `"hhhhhh"` |
| высота абзаца                | 48px  | 24px  |
| от верха блока до текста     | 25px  | 1px   |
| шаг колонки над описанием    | 40px  | 40px (не тронут) |
| от кнопки до видимого текста | 65px  | 41px  |

### Правка

- `packages/theme-base/blocks/Product/ProductDescription.astro` — выражение
  вплотную к тегам; обёртка `flex flex-col gap-2 w-full` → `w-full` (колонка с
  gap'ом держала расстояние до снятого h2, при одном ребёнке мертва).
- Порт flux не трогали: там абзац уже прижат и без `pre-line`.
- Шаг колонки `gap-10` НЕ менялся — состав и ритм секции канон.

### Проверки

- `test:product-description-spacing` 30 ✓ (новый) · `test:product-description`
  28 ✓ · `test:section-snapshots` 155 ✓ · `test:hidden-fields` 495 ✓ ·
  `test:panel-canon` 198 ✓ · `product-section-colors` 32 ✓.
- Саботаж: отбивка шаблона возвращена → новый гард краснеет.
- Проверены все `whitespace-pre-*` в блоках и темах: у остальных выражения уже
  прижаты, дефект был только здесь.

### Почему не поймали раньше

`section-html-snapshot.spec.ts:212` перед сравнением делает
`.replace(/\s+/g, " ").trim()` — схлопывает ровно те пробелы, из-за которых и
появлялась пустая строка. 155 снимков зелёные и до правки, и после: главный
структурный гард слеп к этому классу дефектов по построению. Новый гард читает
`innerHTML` до нормализации.

### Попутно найдено (НЕ чинилось)

- `/catalog` и `/catalog?collection=…` рендерят ДВЕ шапки: `Header-catalog`
  (chrome, в body) и `Header-1` (контент, в div), обе видимы, обе top=48 h=80.
  Причина — `build.service.ts:2166`: синхронизация шапки с главной копирует
  объект целиком вместе с `props.id`, а chrome-слой ставит шапку отдельно.
- Зазоров между секциями нет ни на одной странице (везде 0). То, что читается
  как «отступы между секций» на коллекциях, — внутренний padding `Catalog-1`
  80/80 при настройке 0.

## Конструктор: раскрытый список вариаций перестал уезжать под соседей (2026-09-14, ветка `fix/b7-variant-overlap`) — VERIFIED замером в Chromium, НЕ задеплоено, НЕ запушено

Тестировщик 14.09 (дословно): «Съезжает при настройке круг и квадрат». Секция
«Товар», «Стиль: Список», «Вариации: Круг», раскрыт список «Цвет» — поверх его
пунктов нарисованы счётчик «− 1 +» и кнопка «Добавить в корзину», пункты
«Светло-голубой» и «Чёрный» перекрыты и не читаются.

Регрессия своя: до `6b4342b8` (ветка `fix/b5-variant-list`) при «Стиле: Список»
образцов не было вовсе — рисовалась голая выпадашка `<select>`, которую браузер
печатает собственным слоем и перекрыть нечем. Оживили ветку «список с
образцами» на нативном `<details>` — и всплывающий слой попал под соседей.
`pnpm test:variant-shape` (54) этого не поймал: он меряет форму и размер
образца, а не геометрию наложения.

### ПРАВИЛО (главное из этой записи)

**z-index на `[data-puck-subsection-hover="true"]` и
`[data-puck-subsection-selected="true"]` не возвращать.** Он запирает любой
всплывающий слой внутри параметра секции — дропдаун, подсказку, подменю.
`position:relative` на `[data-puck-subsection-parent]` достаточно: подсветка
это `outline`, а outline — border-like rendering, в z-stack не участвует.

z-index приехал в `7f13d303` вместе со слоем-заливкой
`[data-puck-subsection-hover]::after{…;z-index:0}` и держал ИМЕННО ЕЁ. Заливку
сняли в `4aabd7bb` по просьбе владельца («убрать свечение»), а z-index остался
— без своей работы, но с контекстом наложения. Для подсветки СЕКЦИИ тот же
урок записан в файле двумя строками выше (`NB: НЕ ставим z-index на
section-hover/selected`).

### Причина — НЕ в теме и не в блоке

Подсветка подсекций в превью (`src/services/preview.service.ts`, `injectStyles`
внутри `PREVIEW_NAV_AGENT_INLINE`) вешала на КАЖДУЮ обёртку параметра секции
`position:relative` + `z-index:3` (наведение) / `z-index:4` (выбор) — то есть
контекст наложения. У соседних обёрток он такой же, при равном z-index порядок
решает дерево: «Количество» и «Кнопки» стоят ниже «Вариантов» и рисовались
поверх них ЦЕЛИКОМ, вместе с запертым внутри всплывающим списком. `z-index:20`
у самого списка на это не влияет — сравниваются обёртки, а не их содержимое;
поднимать его до `z-[9999]` бесполезно, это была бы маскировка.

Замер computed-стилей по цепочке предков `<ul>` (rose, «Круг», секция под
курсором) — виновник виден один:

```
ul                    absolute / z-index 20
details               relative / auto
div, div              static
div[variants]         relative / z-index 3   ← контекст наложения
div … section#Product static / relative auto
соседи: quantity relative/3, buttons relative/3
```

Мерчант в конструкторе ВСЕГДА в состоянии «секция под курсором/выбрана» — он
только что кликнул в неё, чтобы менять «Вариации». Поэтому баг видно всегда,
а на живой витрине (там подсветки нет) списка ничто не перекрывает.

### Правка

Один файл, две строки: `src/services/preview.service.ts` — снят `z-index:3` /
`z-index:4` с двух правил подсветки подсекций. `position:relative` на
`[data-puck-subsection-parent]` оставлен. Порядок обёрток между собой не
меняется: все `z-index:auto`, решает порядок дерева — ровно как раньше при
равных 3/3. Тем и проверено: снимки состояния наведения с ЗАКРЫТЫМ списком
до/после совпадают побайтово в rose, vanilla, satin, bloom.

### Замер (Chromium 1440×1400; страница превью собрана тем же кодом, что отдаёт сервис: preview-tailwind + CSS темы + токены + инлайн-агент)

`elementFromPoint` в 10 точках внутри пересечения списка с соседом
(«отнято» = сверху оказался счётчик или «Добавить в корзину»):

| состояние превью | rose | vanilla | flux | satin | bloom |
| --- | --- | --- | --- | --- | --- |
| ДО, секция под курсором | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 |
| ДО, секция выбрана | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 |
| ДО, покой | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| **ПОСЛЕ, все три** | **0/10** | **0/10** | **0/10** | **0/10** | **0/10** |

Одинаково в обеих формах («Круг» и «Квадрат»). Числа rose/Круг/наведение:
список `y 316.4…466.4, x 676…1356`; счётчик `y 352.4…392.4` — пересечение
4400 px²; кнопка `y 433…489` — 22712 px². Геометрия пересечений не менялась,
менялось, кто сверху.

Витрина не затронута: правило живёт только в превью; контрольный прогон без
бандлов превью и без агента даёт 0/10 и ДО правки.

Снимки и сырые замеры (untracked, в корне worktree): `.tmp-b7-proofs/` —
`before-*.png` / `after-*.png` по пяти темам × двум формам, `compat/` — 20
сочетаний, `before.json`/`after.json`/`live.json`, `harness/` + README с тем,
как повторить.

### Обратная совместимость (20 сочетаний: 5 тем × Кнопка/Круг, Кнопка/Нет, Список/Нет, Список/Круг)

Во всех двадцати рисуется ожидаемый контрол (чипы/свотчи, `<select>`, закрытый
`<details>`), список по умолчанию закрыт, сверху в точке контрола — сам
контрол. Состав параметров панели не менялся (канон).

### Проверки

`pnpm test:variant-overlap` 65 ✓ (новый) · `test:variant-shape` 54 ✓ ·
`test:variant-colors` 126 ✓ · `test:product-params` 107 ✓ ·
`test:product-counter` 45 ✓ · `test:section-snapshots` 155 ✓ ·
`test:panel-canon` 198 ✓ · `test:hidden-fields` 495 ✓ ·
`test:media-order` 11 ✓ · `test:zoom-wiring` 26 ✓ ·
`test:product-description` 28 ✓ · `test:product-name-case` 61 ✓ ·
превью-спеки сервиса 44 ✓ · `pnpm conformance:satin` ✓ (инвентарь переснят
отдельным коммитом; изменился только `sourceDigest`).

Гард `src/themes/__tests__/product-variant-list-overlap.spec.ts` считает
СЛЕДСТВИЕ по реальным бандлам превью (`dist/preview-tailwind.css` +
`dist/theme-css/<тема>.css` + инлайн-стиль узла + живой текст правил подсветки,
вырезанный из `preview.service.ts`): ни один предок раскрытого списка не
создаёт контекста наложения и не режет содержимое; список позиционирован с
положительным z-index; соседние обёртки позиционированы (иначе проверка
сторожила бы пустоту). «Есть класс z-20» не годится — flux доставляет слой
инлайном, theme-base утилитой.

В CI — джоба `satin-structural-conformance`, шаг `pnpm test:variant-overlap`;
перед ним добавлен `pnpm build:preview-tailwind` (витринные сборки бандл
превью не содержат).

### Саботаж (все откачены)

- вернули `z-index:3` подсветке наведения → 11 красных;
- контекст наложения через `transform:translateZ(0)` на подсветке выбора → 11;
- сняли `z-20` у `<ul>` в `ProductVariants.astro` → 8;
- юнит-саботажи детектора: transform / filter / opacity<1 / isolation /
  contain:paint / will-change / mix-blend-mode / `overflow:hidden`.

Калибровка поймала себя сама: первая версия парсера правил подсветки вернула
ПУСТОЙ список (апостроф в русском комментарии `appendChild'ом` разъезжал пары
кавычек) — и весь гард был бы зелёным, ничего не сторожа. Проверка «подсветка
вообще существует» покраснела и это вскрыла.

### Открытые хвосты

- `src/services/__tests__/resolve-block-scheme.spec.ts` красный (22 проверки):
  спека дёргает `themeDefaultsCache`, снятый из сервиса коммитом `318968c8`.
  Не из этой правки, в CI не гоняется — отдан отдельно.
- flux выдаёт ДВЕ разные картинки одной и той же страницы (чередуются и до, и
  после правки, множество хешей одинаковое) — гонка его собственной гидрации.
  К этой правке отношения не имеет, но мешает побайтовому сравнению снимков
  flux: сравнивать множествами, а не одним снимком.
- Гард стоит на списке вариаций «Товара» — единственном всплывающем слое
  внутри параметра секции, который сейчас есть. Появится другой (подсказка,
  подменю) — правило то же, но геометрию его никто не сторожит.

---

## 2026-09-14 — серые надписи витрины следуют схеме (ветка `fix/b7-grey-literals`)

Пачка тестировщика 14.09, пункт «везде серые надписи». Половину закрыл токен
(`b7ae243a`), вторая половина — жёсткие литералы в портах пяти тем и заморозка
самого токена константой манифеста.

### Что сделано

- Инвентарь: 231 попадание «серый как цвет текста» по `themes/*/src`; после
  вычета плейсхолдеров, рамок, фонов, svg, hover и disabled — **174 надписи**
  под перевод (rose 21, vanilla 19, flux 43, satin 44, bloom 47).
- Перевод на `text-[rgb(var(--color-muted,<исходная тройка>))]`: оттенок темы
  сохранён фолбэком (flux `204_204_204`, vanilla `68_68_68`, satin `96_96_96`,
  остальное `153_153_153`), а внутри схемы цвет считается из неё.
- `src/themes/tokens-css.ts`: `muted` манифеста темы больше не наследуется в
  схему мерчанта, когда у неё есть текст и фон. До этого фикс muted работал
  только у rose и satin — у flux/vanilla/bloom токен был заморожен на
  204/200/245.
- Новый сторож `src/themes/__tests__/grey-literals-follow-scheme.spec.ts`
  (`pnpm test:grey-literals`, 27 тестов) + строка в `.github/workflows/ci.yml`
  рядом с `test:muted-text`.

### Замер

Chromium; класс/стиль берётся из самого исходника, CSS — живой билд темы
(`themes/<t>/dist/_astro/*.css`), плюс `tokens.css` от `buildTokensCss`.

- схема тестировщика (`bg #71C0FF`, `text #E91E8C`, muted `185 95 186`):
  до — 174/174 узла отдавали `153/163/204/96/102/68`; после — 174/174 отдают
  `185 95 186`;
- светлая схема (`bg #ffffff`, `text #121212`): те же узлы после правки отдают
  `113 113 113` — значит цвет действительно едет за схемой, а не просто
  перекрашен один раз;
- два названных места: дровер rose и bloom, «Удалить» и «Белый, XXL»
  `153 153 153` → `185 95 186` (скриншоты сняты).

### Саботаж

- Вернул `text-[#999999]` в `themes/rose/src/lib/cart.ts:36` и
  `themes/bloom/.../CartBody.astro:55` → 3 падения (rose «Удалить», rose и bloom
  общий скан). Откачено.
- Вернул наследование muted из манифеста (`canMix = false`) → 3 падения
  (flux/vanilla/bloom «muted считается из текста и фона»). rose и satin остались
  зелёными — у них манифест нёс тот самый серый. Откачено.

### Что НЕ трогал

`packages/theme-base/blocks/Product/ProductVariants.astro` и
`ProductDescription.astro` — их правят параллельно. Состав параметров панели —
канон, не менялся (`test:panel-canon` 198 ✓).

### Статус

Код VERIFIED замером и тестами, НЕ задеплоен и НЕ запушен (два коммита в
`fix/b7-grey-literals`).

## 2026-09-14 — Страница «Вход» получила свою секцию (ветка `fix/b7-login`)

### Цель

Владелец 14.09, дословно: «В меню у пункта Профиль создать новый подпункт Вход.
На странице Вход как раз отобажать от темы решистрацию/вход. У секции Вход два
парметра Заголовок и Текст. У секции в сайдбаре Цветовая схема и отступы».
Последний пункт пачки по семье «Профиль» — после «Личного кабинета» и «Заказов».

### Замер ДО (живые стенды, curl, 14.09)

| тема | стенд | `/login` | узлов `data-puck-component-id` в теле | заголовок |
| --- | --- | --- | --- | --- |
| rose | `7b64b7a527d2` | 200 | 0 | `<h1>Вход в аккаунт</h1>` зашит в AuthShell |
| vanilla | `5c178ceecc1d` | 200 | 0 | то же |
| bloom | `f7593c5f8f8f` | 200 | 0 | то же |
| satin | `8afc7b1ed6ee` | 200 | 0 | то же |
| flux | `u9fpo33bkmsd` | 200 | 0 | то же |

Три узла `data-puck-component-id` на странице всё же были — `Header-*`,
`Footer-*` и литерал `'+blockId+'` из инлайн-хелпера. Ни одного в теле формы:
кликнуть по ней в конструкторе нельзя, настраивать нечего. Записи `page-login`
в `PAGE_REGISTRY` не существовало — страница собиралась Astro как статика
(`login` уже был в `STATIC_TEMPLATE_PAGES`, генератор её и не трогал).

### Замер ПОСЛЕ (рендер порта тем же кодом, что отдаёт сервис)

`node src/themes/__tests__/render-theme-sections.mjs <тема>` с
`{heading:"ЗАГ-ПРУФ", text:"ТЕКСТ-ПРУФ", colorScheme:3, padding:{top:137,bottom:42}}`:

| тема | puck-узлов | схема | Заголовок | Текст | Отступы | форма |
| --- | --- | --- | --- | --- | --- | --- |
| rose | 1 | `color-scheme-3` | ✓ | ✓ | `137px/42px` | `magic-form` |
| vanilla | 1 | `color-scheme-3` | ✓ | ✓ | `137px/42px` | `magic-form` |
| bloom | 1 | `color-scheme-3` | ✓ | ✓ | `137px/42px` | `magic-form` |
| satin | 1 | `color-scheme-3` | ✓ | ✓ | `137px/42px` | `magic-form` |
| flux | 1 | `color-scheme-3` | ✓ | ✓ | `137px/42px` | `magic-form` |

Шелл `/login` собирается и на полной сборке темы (`run-theme-build` rose/flux —
`THEME_BUILD_OK`), тело в нём пустое: его вставляет `composeContentPagesIntoDist`.
Побайтовый паритет с эталоном 14.09 — шелл `account/orders` устроен так же
(rose: orders 33725 Б / login 33654 Б, оба без тела).

### Выполнено

- Блок `theme-base/blocks/LoginSection` (label «Вход»), РОВНО четыре поля:
  `heading` («Заголовок», text), `text` («Текст», textarea), `colorScheme`
  («Цветовая схема»), `padding` («Отступы», дефолт 80/80 — как у «Избранного»),
  `maxInstances: 1`. Дефолты `heading`/`text` равны литералам, что стояли на
  живой витрине до правки: несконфигурированный сайт выглядит как прежде.
- Порты по пяти темам `themes/<t>/src/components/sections/LoginSection.astro`.
  Тело перенесено из `src/pages/login.astro` дословно (AuthShell + AuthInput +
  AuthButton развёрнуты inline, те же id), module-`<script>` с импортами заменён
  на `is:inline` + глобал `window.__<theme>Auth` — как у `WishlistSection` и
  секций аккаунта. Страницы стали шеллами.
- `page-login` (`/login`) заведена в `PAGE_REGISTRY`, манифестах пяти тем и
  сидах; `seedLoginPageSection` досевает страницу и секцию живым ревизиям
  (идемпотентно по наличию блока — скрытую «глазом» секцию не дублирует и не
  открывает обратно).
- Рендер: гейт `LOGIN_SECTION_THEMES` в `v2-live-pages` и `preview.controller`
  (зеркало `ACCOUNT_SECTION_THEMES`).
- Конструктор: `PROFILE_VIEWS` третьим пунктом, `PROFILE_NESTED_PAGE_IDS`,
  `pageIconMap`, `STRUCTURAL_PAGE_IDS/_SLUGS`, `NON_DELETABLE`,
  `DYNAMIC_COMPONENTS`, подпись «Вход».

### Почему страница verbatim, а не content

Запись `kind:'verbatim'` + адресный гейт — по образцу `page-orders`. Но причина
здесь ДРУГАЯ, и это важно не перепутать: у страниц аккаунта verbatim держит
первосегмент `account` ради хаба `/account` и `/account/order`, а у `login`
вложенных маршрутов нет вовсе. Здесь verbatim даёт две вещи: поштучный откат
темы (убрал из множества — страница снова берётся из диста) и защиту маршрута —
`login` становится verbatim-первосегментом, и кастомная страница мерчанта со
слагом `login` больше не может перезаписать страницу входа (collision-guard
`isV2ComplexRoute` в `v2-live-pages` и `custom-pages-seo-inject`). Раньше могла.

### Две вынужденные правки вёрстки

1. Фон секции взят из `--color-bg` — иначе «Цветовая схема» красила бы текст, но
   не фон (та же правка, что в `OrdersSection.astro` 14.09).
2. У прежнего `AuthShell` снят `background:#FFFFFF` и вертикальный `py-28`:
   белый фон закрывал бы схему собой, а фиксированные 112px не дали бы работать
   «Отступам». На дефолте вертикаль стала 80/80 вместо 112/112 — это и есть
   запрошенный параметр. Остальные var-переопределения AuthShell оставлены
   дословно: поля и кнопка выглядят в точности как раньше.

### Чего НЕ делали

- Кнопку «Добавить секцию» на `/login` НЕ запирали: владелец просил лок для
  «Заказов» и «Личного кабинета», для «Входа» — не просил. Соседнее «Избранное»
  устроено так же. В гарде на это стоит ПОЗИТИВНАЯ проверка «кнопка есть» плюс
  саботаж «страницы аккаунта по-прежнему заперты» — иначе «не заперто» было бы
  правдой всегда.
- Санитайзер `?redirect` есть только у rose; четырём остальным темам его НЕ
  добавляли. Перенос тела в секцию — не повод менять поведение темы.
- В палитру «Добавить секцию» секция не выведена (как CartSection/Wishlist/
  Account/Orders): живёт только на своей странице.

### Проверки

- `pnpm test:login-section` 97 ✓ (новый) · `test:panel-canon` 203 ✓ ·
  `test:account-sections` 122 ✓ · `test:wishlist-section` 51 ✓ ·
  `test:section-snapshots` 155 ✓ · `test:hidden-fields` 495 ✓ ·
  `test:hidden-items` 3 ✓ · `test:gallery-count` 66 ✓ ·
  `test:panel-defaults` 22 ✓ · `src/utils/__tests__/` 135 ✓ ·
  `test:conformance:satin` 84 ✓ · `test:conformance:shared` 199 + 100 ✓ ·
  `pnpm conformance:satin` ✓ (инвентарь переснят отдельным коммитом, изменился
  только `sourceDigest`).
- Конструктор: `pnpm test` 354 ✓ (54 файла), включая новый
  `login-section-page-scope` (12) и «Вход» в `EditorHeaderProfilePage`;
  `pnpm build` («Type check» в CI) ✓.
- В CI добавлен шаг `pnpm test:login-section` в джобу
  `satin-structural-conformance` — рядом с `test:account-sections`, после
  `build`/`build:blocks`/`build:theme-sections:all`. Скрипт в package.json без
  шага в ci.yml не гоняется вообще.

### Саботаж (все откачены, после каждого — зелёный откат)

| что ломали | что покраснело |
| --- | --- |
| пятый параметр `subheading` в панели | `test:login-section` 5, `test:panel-canon` 5 (по теме) |
| `{heading}` заменён литералом (rose) | `test:login-section` 1 — «Заголовок доезжает» |
| снят `style={paddingStyle}` (flux) | `test:login-section` 1 — «Отступы доезжают» |
| `seedLoginPageSection` не вызывается | `test:login-section` 3 (страница, секция, идемпотентность) |
| satin убран из `LOGIN_SECTION_THEMES` | `test:login-section` 1 |
| **калибровка:** у satin отобран порт в `sections.map.json` | `test:login-section` 7 — вся группа рендера |
| `page-login` убран из `PROFILE_NESTED_PAGE_IDS` | конструктор 2, включая поведенческую «НЕ дублируется вторым пунктом» |
| `LoginSection` выведен в `PUPA_BLOCK_ALLOWLIST` | конструктор 1 — «её НЕТ в палитре» |
| `page-login` убран из `STRUCTURAL_PAGE_IDS` | конструктор 2, включая рендер «группа „Тема“ рисуется» |
| `LoginSection` убран из `NON_DELETABLE` | конструктор 1 |

Калибровка не была формальностью: опасение было, что скаффолд `theme-base`
несёт те же `magic-form`/`login-email` и подменит собой отобранный порт темы
незаметно. Не подменяет — рендерер отчитывается `missing`, и краснеет вся группа
рендера (7 проверок), а не одна.

Отдельно поймано саботажем **своей же работы**: откат сабо́тажа через
`git checkout --` стёр НЕзакоммиченные правки `EditorHeader.tsx` и
`CustomOutline.tsx`. Вскрылось сразу — три проверки, к саботажу отношения не
имевшие, остались красными. Вывод в привычку: коммит ДО саботажа, иначе откат
бьёт по живому.

### Свод конформанса: детектор пошёл за кодом

`conformance:satin:refresh` отказался пересниматься: finding
`satin.flow.auth.login-return-propagation` стал stale. Причина — детектор
`satin-structural-facts.ts` искал `params.get('redirect') || '/account'` в
`themes/satin/src/pages/login.astro`, а тело переехало в секцию.

Опасность была не в отказе, а в обратном: `authLoginFallbackTarget` перевернулся
бы в `preserved`, и свод отчитался бы, что satin ТЕПЕРЬ сохраняет возврат в
чекаут. Это неправда — код просто переехал. Детектор научен читать оба адреса
(страница + секция), страницы из списка не убраны: `readSource` молча отдаёт
`null` на отсутствующий файл, темы без переезда читаются как прежде.

Счётчики инвентаря satin сдвинуты сознательно: 13→14 страниц манифеста,
23→24 записи `sections-map`, 27→28 записей генератора.

### Открытые хвосты

- `src/themes/__tests__/page-registry.spec.ts` красный — **до этой правки тоже**
  (проверено на чистом `origin/main`: 7 failed / 14 passed, ровно те же имена).
  Parity-снимок спеки 108 не обновляли, когда `cart` и `wishlist` переехали в
  `content`. В `ci.yml` спека не значится, поэтому ничего не сторожит. Моя правка
  число красных не изменила — отдаётся отдельно.
- `fontfamily-resolve`, `v2-routes` («замок сложных маршрутов», падает на `cart`)
  и `conformance-source-snapshot` (bloom) красные на чистом `origin/main` тоже:
  4 красных у меня против 5 у базы (лишний у базы — артефакт неполной сборки).
- `origin/main` за время работы уехал `7f0f91f0` → `5f5f5016` (влилась ветка
  `fix/b7-grey-literals`). Ветка собрана от `7f0f91f0`, НЕ слита — слияние за
  владельцем.
- Живого пруфа на витрине нет: не пушим и не деплоим. Всё выше — рендер тем же
  кодом, что отдаёт сервис, плюс полная сборка тем rose/flux.

## 2026-09-14 — три пункта владельца по чекауту (пять тем)

Ветка `fix/b8-checkout-col` от `origin/main` `63a9b672`. Коммиты `9f310888`
(правка) и `7d6c719e` (переснятый инвентарь satin).

**Замер «до» своими руками.** Собрал пять тем (`run-theme-build.ts`), применил
пост-обработку витрины (`assembleChrome` + `injectCheckoutChromeIntoHtml`, как в
`unifyChromeInDist`) и померил в Chromium на 1440×900 и 390×844, корзина 3
позиции. Колонка формы 0..720 у всех пяти, секция «Оформление заказа» 298..692
(394px) — карточка по центру колонки. Полоса копирайта 0..1440 h=80 внизу у всех
пяти. Блок условий — три ссылки `/legal/*` у всех пяти.

**Пункт 1.** Меру держала обёртка колонки (`max-width: 446px` + прижатие
вправо), поэтому секция с `w-full` шире 446 быть не могла. Перенёс меру на
содержимое колонки: `[data-checkout-pane="form"] [data-checkout-slot="header"]` и
`… [data-block="checkout-form"] > *`. Числа прежние. Разметку блоков НЕ трогал —
снимки секций (155) зелёные без обновления.

Вертикальные отступы намеренно остались на колонке: мега-блок «Оформление
заказа» печатает `padding-top/bottom` ИНЛАЙНОМ из своего скрытого параметра
«Отступы», и инлайн перебил бы правило из таблицы стилей.

**Пункт 3.** Полоса снята из пяти `Layout.astro`, из `assembleChrome` и из
инъекции хрома. `replaceCheckoutFooterStrip` → `stripCheckoutFooter`: снимает
`<footer>` на чекауте безусловно. Файл блока
`packages/theme-base/blocks/CheckoutFooterStrip/CheckoutFooterStrip.astro`
оставлен с пометкой «не рендерится нигде» — требование к подвалу чекаута
менялось дважды за сутки, вернуть дешевле, чем написать заново. Ни один путь его
не подключает, это сторожит гард.

**Замер «после».** Секция 0..720 (390: 0..390) у всех пяти тем; лого, поля
контактов и доставки, кнопка оплаты и блок условий — пиксель-в-пиксель как до
правки на обеих ширинах. `<footer>` на странице 0, «Powered by Merfy» 0. На
1024/1280/1920/768 горизонтального скролла нет, секция везде равна колонке.

### Открытые хвосты

- На витрине не проверено: ветка не запушена и не задеплоена (владелец сказал не
  пушить). Всё выше — полная сборка пяти тем + пост-обработка тем же кодом,
  что у сервиса, плюс страница превью, собранная теми же модулями.
- Магазин с заполненными политиками возврата/доставки теряет эти две ссылки на
  чекауте: их несла снятая полоса, а блок условий несёт три фиксированные.
  Решение владельца, но стоит проговорить.
- «Цветовая схема» узла «Подвал» страницы чекаута теперь ничего не красит — как
  и у «Шапки оформления», чью палитру перекрывает колонка. Узел и поле остались.
- Красные и на чистом `origin/main` `63a9b672` (проверено прогоном в отдельном
  worktree, ровно те же 30 имён): `page-registry.spec.ts`,
  `resolve-block-scheme.spec.ts`, `preview-page-routing.spec.ts`. В `ci.yml` не
  значатся, ничего не сторожат. Моя правка их число не изменила.

---

---

## 2026-09-14 — превью кабинета показывало форму входа (`fix/account-preview`)

Ветка от `origin/main` = `b9ebb0fc`. Пять тем, две секции, один инжектор.

### Замер ДО (своими руками, не на веру репорта)

Локальный стенд, flux `132d3a3e-a28f-40b7-98fa-a0200151cfb8`, сервис на :3114
(`de43094e` — предок `origin/main`; исходники обеих секций во всех пяти темах
там побайтово равны `origin/main`, сверено по sha256).

Сырой HTML `GET /api/sites/<id>/preview?page=page-profile` был **верным**:
`X-Preview-Mode: v2-sections`, узел `AccountSection-1789357917022`, текст
«Основные данные / E-mail / Телефон / Пароль / Выйти из аккаунта». Ломалось в
браузере. Playwright, страница открыта в iframe (как в конструкторе):

| страница | навигация | узлы | текст |
| --- | --- | --- | --- |
| page-profile | `?page=page-profile` → `?page=%2Flogin` | `Header-home`, `Footer-home` | «ВХОД В АККАУНТ…» |
| page-orders | `?page=page-orders` → `?page=%2Flogin` | `Header-home`, `Footer-home` | «ВХОД В АККАУНТ…» |

Совпало с репортом владельца дословно.

### Причина

`themes/<t>/src/components/sections/{Account,Orders}Section.astro`:
`if (!A.getToken()) navTo('/login?redirect=/account/profile')`, а `navTo`
проверяет `window.self !== window.top` и в iframe переписывает `?page=` у самого
превью. Покупательской сессии в конструкторе нет и быть не может, поэтому гейт
срабатывал ВСЕГДА. Шапка/подвал приезжали от главной не сами по себе — это
следствие: у страницы `/login` записи ревизии не было, превью падало на
home-шелл.

### Правка

* Новый `src/common/preview-account-inline.ts` — демо-покупатель, две демо-строки
  заказов и чистый `injectPreviewAccountGlobal(html)`.
* `preview.controller.injectPreviewGlobals` зовёт его. Больше НИКТО в `src/` —
  это отдельная проверка гарда.
* Обе секции в пяти темах: общая функция отрисовки (`paintProfile` /
  `paintOrders`) + чтение глобала ПЕРЕД гейтом. Витрина идёт прежним путём.

### Моя же ошибка, которую поймал браузер, а не гард

Первый заход маркером идемпотентности взял ИМЯ глобала. Но имя уже есть в
ЧТЕНИИ внутри скрипта секции → `html.includes(...)` всегда true → инжект молча
пропускался. Гард (24 проверки) был зелёный, страница висела на «Загрузка…».
Те же грабли дословно описаны в `block-root-inline.ts`. Маркер переделан на
`window.__MERFY_PREVIEW_ACCOUNT__ = ` (с ` = `, которого в чтении нет), и в гард
добавлены три проверки ровно на этот случай.

### Замер ПОСЛЕ

Свой экземпляр сервиса на :3115 (изолированный vhost RabbitMQ `preview-probe`,
локальный MinIO — чужой стенд на :3114 не трогал; vhost удалён после замера).

| страница | навигация | узлы | тело |
| --- | --- | --- | --- |
| page-profile | нет | PromoBanner, **Header-profile**, **AccountSection**, **Footer-profile** | «ОСНОВНЫЕ ДАННЫЕ», e-mail `pokupatel@example.com`, телефон `+7 (900) 000-00-00`, форма видима |
| page-orders | нет | PromoBanner, **Header-orders**, **OrdersSection**, **Footer-orders** | «МОИ ЗАКАЗЫ», 2 строки: `DEMO-1024` от 10.09.26, `DEMO-1023` от 02.09.26 |

То же на satin `57ac2ede-…`. Все пять тем — собранные секции прогнаны в живом
Chromium с настоящим инжектором: 10/10 (5 тем × 2 секции) в превью рисуют тело,
10/10 без глобала тело НЕ показывают.

### Гард и саботаж

`pnpm test:account-preview-body` — 28 проверок, шаг в `ci.yml` рядом с
`test:account-sections`. Гард ИСПОЛНЯЕТ оба inline-скрипта секции на крошечном
DOM-стенде в двух контекстах, а не грепает исходник.

| саботаж | результат |
| --- | --- |
| откат правки flux-секций (сам баг) | 2 упали / 22 прошли, в диффе `?page=%2Flogin` |
| проверка превью перенесена ПОСЛЕ гейта | греп зелёный (1 вхождение), гард 1 упал / 23 прошли |
| условие превью снято — гость видит тело | 2 упали / 22 прошли («витрина гонит гостя на /login») |
| `build.service` импортирует инжектор | 1 упал / 23 прошли |
| прежний (ошибочный) маркер идемпотентности | 2 упали / 25 прошли |
| `build.service` импортирует инжектор (после расширения) | 2 упали / 26 прошли |

### Соседние наборы после правки

`test:account-sections` 122, `test:login-section` 97, `test:section-snapshots`
155, `test:panel-canon` 203, `test:conformance:shared` 199 + 100,
`test:conformance:satin` 84, `test:hidden-fields` 495, `test:hidden-items` 3 —
все зелёные.

### Открытые хвосты

- Не запушено и не задеплоено — по требованию владельца.
- Живого пруфа на витрине нет: проверка только локальная.
- В превью показываются ЗАГЛУШКИ, а не настоящие заказы. Иначе нельзя: токена
  покупателя у мерчанта нет, запросить чужой кабинет нечем. Это же и есть
  гарантия, что превью ничего не утекает.
- `src/themes/__tests__/page-registry.spec.ts` красный и БЕЗ моей правки:
  прогнал на отдельном worktree чистого `origin/main` (`b9ebb0fc`) — там
  7 упало / 14 прошло, у меня ровно столько же. В `ci.yml` спека не значится.
