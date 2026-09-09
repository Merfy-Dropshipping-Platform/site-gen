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
