# Манера satin — стайлгайд верстальщика

Извлечено из фактической вёрстки `themes/satin/src` (не из Figma и не из theme-base).
Назначение: исходник для оживления канон-секций и досоздания новых в манере satin
(Фаза B тиража конструктора v2; эталон процесса — `themes/bloom/MANNER.md`,
первоисточник паттерна — `themes/rose/MANNER.md`). Каждое значение — с пруфом `файл:строка`.

Пути сокращены: `g` = `src/styles/global.css`, `H` = `src/components/Header.astro`,
`F` = `src/components/Footer.astro`, `PC` = `src/components/products/SatinProductCard.astro`,
`CC` = `src/components/products/SatinCollectionCard.astro`, `PDP` =
`src/components/products/satinProductDetail.astro`, `hyd` = `src/lib/storefront-hydrate.ts`.

⚠️ **Наследие клона rose — НЕ манера satin.** Классы `.font-comfortaa` и `.font-manrope`
в satin ПЕРЕНАЗНАЧЕНЫ на `--font-nt-ui` = **Arsenal** (g:16-19, g:32) — всё, что в разметке
помечено `font-manrope`/`font-comfortaa`, рендерится Arsenal. Клон-остатки, страницами
НЕ используемые (✓ проверено grep по src — импортёров нет): `SectionHeader.astro`
(comfortaa-роль), `HeaderLink.astro`, `CollectionCard.astro`, `ProductCard.astro`,
`components/header/{PromoBanner,NavLink,IconButton}.astro`, `components/footer/*`
(Footer импортирует только NtIcon/withBase, F:2-4), `components/gallery/*`
(скругления rounded-[8px]/gray-100 — чужие флэт-манере). Сервисные страницы
cart/checkout/auth/legal сохраняют rose-роли (`font-comfortaa` 28/32 + `rounded-[6px]`
кнопки, cart.astro:27,36; legal/[slug].astro:24) — это система, не секционная манера.
Blog-переменные `--accent #2337ff` и пр. — мусор шаблона Astro (g:203-227).
Родная манера satin = **Kelly Slab (заголовки) + Arsenal (всё остальное) + чёрно-белый
монохром + НОЛЬ скруглений**; клон-роли в новые канон-секции не переносить.

## 1. Шрифтовые роли

| Роль | Классы / значения | Источник |
|---|---|---|
| Подключённые семейства | Google Fonts: **Arsenal 400;700** (body/UI), **Kelly Slab 400** (display), Inter 300;400;500 (только чёрные полосы) | BaseHead.astro:36; g:32-34 |
| body-дефолт | Arsenal (`--font-nt-ui`), фон `--satin-bg` #FFF, цвет #000 | g:68-73 |
| `.font-logo` | Kelly Slab (`--font-nt-logo`), Georgia/serif фоллбек | g:25-27, 33 |
| Hero h1 | `font-logo text-[26px] font-normal uppercase leading-[1.08] text-[#000000] md:text-[32px]` | Hero.astro:32 |
| Заголовок баннера (ImageBanner h2) | та же роль 26/md:32, leading-[1.1], по центру | ImageBanner.astro:46 |
| Кикер (надзаголовок) | `font-manrope`(→Arsenal) `text-[16px] font-light uppercase tracking-[0.04em] text-[#999999]` (в баннере md:text-[20px]) | Hero.astro:27; ImageBanner.astro:45 |
| Заголовок секции | `font-logo text-[20px] font-normal uppercase leading-[1.15] text-[#000000]` (`.satin-title` = та же роль без размера) | TextBlock.astro:15; CollectionRows.astro:63; catalog.astro:37; contacts.astro:14,49; g:90-96 |
| Заголовок-аккордеон (Faq summary) | `font-logo text-[18px] uppercase leading-[1.2] md:text-[20px]` | Faq.astro:35 |
| Заголовок карточки-фичи | `font-logo text-[18px] uppercase leading-[1.15] md:text-[20px]` | Features.astro:43 |
| Заголовок карточки журнала | `font-logo text-[16px] uppercase leading-[1.15]` | Journal.astro:50 |
| Заголовок рассылки (подвал) | `font-logo text-[14px] uppercase leading-normal` | F:71, 146 |
| PDP h1 | `font-logo text-[22px] uppercase leading-[1.1] md:text-[28px]`; «Описание» h2 — 18/md:20 | PDP:74, 153 |
| Body `.satin-copy` | Arsenal **16px, 300 (font-light), line-height 1.5, #999999** | g:98-104 |
| Body крупный (текст-секции) | `.satin-copy md:text-[20px]` | TextBlock.astro:16; CollectionRows.astro:65 |
| Подзаголовок секции (каталог) | Arsenal 16 light leading-normal #999999 | catalog.astro:41; contacts.astro:50 |
| Дата/анонс журнала | Arsenal 14 light (дата — uppercase tracking-[0.04em]) #999999, lh 1.5 | Journal.astro:49, 51 |
| Подписи товара | имя Arsenal **16 400 uppercase** leading-tight #000; цена 16 400; старая цена 14 light #999 line-through | PC:51-62 |
| Подпись коллекции | Arsenal 16 400 uppercase leading-tight #000 | CC:31-35 |
| Ссылка навигации (desktop) | Arsenal **16 400 uppercase** leading-normal #000, hover:opacity-70; активная `after:h-px after:w-full after:bg-[#000000]` (pb-1) | H:90-91 |
| Ссылка навигации (бургер) | Arsenal text-xs (12) 400 uppercase; активная #000 + плашка `h-0.5 w-12 bg-[#000000]`, неактивная **#606060** | H:191-192 |
| Полоса объявления | Arsenal `text-[11px] md:text-[14px]` 400 uppercase tracking-[0.04em] белый | H:43 |
| Логотип (текстовый) | Kelly Slab uppercase leading-none; desktop **22px** / mobile text-lg (18px); подвал 20/18 | H:107, 65; F:53, 120 |
| Ссылки подвала | Arsenal 14 light #999999 (колонки — uppercase); mobile 12 light | F:38-41, 57 |
| Текстовая ссылка-CTA («Перейти» + стрелка) | Arsenal 14 400 uppercase #000 + NtIcon arrow-right size-5, hover:opacity-70 | Journal.astro:53-56 |
| Чёрные полосы (низ подвала) | **font-inter** 12 light → md:16, белый, по центру | F:181 |

Итого ролей две: **заголовки = Kelly Slab 400 uppercase** (никогда не жирнее),
**всё остальное = Arsenal** (подписи/навигация/кнопки 400, body-абзацы 300 muted).
Акцентного цвета нет — иерархия только чёрным/серым и капсом. Жирность >400 не
используется (исключение — `font-medium` бейджа «Скидка», PC:33).

## 2. Сетка секций

| Роль | Классы / значения | Источник |
|---|---|---|
| Горизонтальные поля секции | `.satin-pad` = `padding-inline: clamp(16px, 8.33vw, 160px)` — одна на все секции | g:44, 86-88; Collections.astro:13; Popular.astro:19; Faq.astro:31 |
| Контентный контейнер | `.satin-container` = `max-width: 1320px; margin-inline: auto` (`--satin-max`) | g:43, 80-84 |
| Внешняя обёртка full-bleed | `mx-auto max-w-[1920px]` (Hero, ImageBanner, шапка desktop, подвал) | Hero.astro:23; ImageBanner.astro:29; H:78; F:47 |
| Гаттер full-bleed сплитов | `--satin-gutter` = `clamp(16px, calc((100vw - 1320px)/2), 300px)`; классы `.satin-bleed-left/right` падают текст-половину к кромке контейнера | g:47, 148-153; Hero.astro:24 |
| Вертикаль: компакт | `py-8 md:py-12` (32/48) — Collections | Collections.astro:13 |
| Вертикаль: стандарт | `py-10 md:py-14` (40/56) — Popular, Faq, Journal | Popular.astro:19; Faq.astro:31; Journal.astro:41 |
| Вертикаль: просторно | `py-12 md:py-16` (48/64) — CollectionRows, TextBlock, каталог | CollectionRows.astro:49; TextBlock.astro:13; catalog.astro:19 |
| Вертикаль: фичи | `py-10 md:py-20` | Features.astro:30 |
| Full-bleed секции | вертикальных полей НЕТ; высота `md:h-[680px]`, mobile `aspect-[375/362]` | Hero.astro:24, 43; ImageBanner.astro:32, 40 |
| Подвал | desktop `pt-16 pb-10`; mobile `px-4 py-8` | F:47, 117 |
| Зазор «заголовок → контент» | `gap-8` (Popular, каталог, контакты), `gap-4` (TextBlock) | Popular.astro:20; catalog.astro:33; TextBlock.astro:14 |
| Грид плиток коллекций | `grid-cols-2 gap-4 sm:grid-cols-3`; первая плитка `col-span-2 sm:col-span-1` (mobile-витрина) | Collections.astro:14-16 |
| Грид товаров (Popular) | `grid-cols-1 gap-4 sm:grid-cols-3` | Popular.astro:21 |
| Грид каталога | `grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3` | catalog.astro:116 |
| Грид карточек (Features/Journal) | `grid-cols-1 gap-4 md:grid-cols-2` / `sm:grid-cols-3` | Features.astro:31; Journal.astro:42 |
| Ряды «фото+текст» | внешний `gap-12 md:gap-20`; ряд `grid-cols-1 items-stretch gap-8 md:grid-cols-2 md:gap-10`; текст-колонка `gap-5`, абзацы `gap-3`, текст `max-w-[600px]` | CollectionRows.astro:50-65 |
| Сплит 50/50 | `grid grid-cols-1 md:grid-cols-2` на 1920-обёртке; фото-половина к кромке вьюпорта, текст-половина центрована/в гаттере | Hero.astro:23-24; ImageBanner.astro:29-43 |
| Брейкпоинты | стандартные Tailwind (sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536); главный перелом — **md** | (классы выше) |

## 3. Кнопки

| Роль | Классы / значения | Источник |
|---|---|---|
| База `.satin-button` | `min-height 40px; border 1px solid currentColor; padding 0 18px;` Arsenal **14 400 uppercase** lh 1; transition opacity/colors 180ms; **БЕЗ скругления** | g:106-119 |
| Размер md `.satin-button-md` | `min-height 48px; padding 0 24px; font-size 16px` (Figma "Button md Fill") | g:121-126 |
| Тёмная `.satin-button-dark` | белый текст, `background: var(--satin-black)`, чёрный бордер — главная CTA (Hero, ImageBanner, формы) | g:155-159; Hero.astro:37; contacts.astro:71 |
| Светлая `.satin-button-light` | чёрный текст, **прозрачный фон, чёрный бордер** (контурная — родная роль satin!) | g:161-165; CollectionRows.astro:67; Popular.astro:26; catalog.astro:131 |
| Контур на фото | `satin-button satin-button-md text-white` — белый контур на тёмном полотне | about.astro:55 |
| Hover | `opacity: 0.78` (база); ссылки/иконки 0.7-0.8; `active:scale` НЕТ | g:128-130 |
| Кнопка карточки товара | `h-11 w-full bg-[#000000] px-3` Arsenal 14 400 uppercase белая, `[data-add-to-cart]`, mt-2; на hover-устройствах скрыта и всплывает по ховеру карточки (см. §6) | PC:65-76; gsap-overrides.css:24-40 |
| Кнопка поиска «Найти» | `h-8 bg-[#000000] px-4` Arsenal 12 uppercase белая (прямоугольник) | H:165 |
| PDP primary | `h-14 w-full bg-[#000000] px-4` Arsenal 16 uppercase | PDP:146 |
| PDP secondary | `h-14 flex-1 border border-[#000000] bg-white` Arsenal 16 uppercase чёрная | PDP:118 |
| Кнопки вариантов | `h-10 border border-[#000000] px-3` Arsenal 14; выбранная `bg-[#000000] text-white`, невыбранная `bg-white text-[#000000]` | PDP:97-98; hyd:318-321 |
| Кнопка рассылки | иконка-стрелка `arrow-right` size-5 в кнопке 24×24 внутри поля (НЕ текст) | F:74 |
| Манера | прямоугольники с бордером 1px, два тона: чёрная заливка (dark) и контур (light); инверсия на тёмном — белый контур/белая заливка; радиус-токен `rounded-[var(--radius-button,0px)]` (`--radius-button: 0px`, packages/theme-satin/theme.json defaults) | g:106-165; theme.json |

## 4. Карточки и медиа

| Роль | Классы / значения | Источник |
|---|---|---|
| Карточка товара | колонка `gap-3`, без рамки/подложки; медиа `aspect-[430/564] bg-[#F5F5F5]` **без скругления**, hover `scale-[1.03] duration-300`; бейдж + избранное на медиа; встроенная CTA «В корзину» | PC:16-47, 65-76 |
| Бейдж «Скидка» | `left-0 top-0 h-6 bg-[#000000] px-2` Arsenal 12 **font-medium** uppercase белый (прямоугольник в самом углу, без отступа) | PC:32-36 |
| Кнопка избранного (сердце) | overlay `right-3 top-3 size-8 bg-white` (острые углы), `[data-wishlist-toggle][data-product-id]` — ИНЛАЙН-SVG (геометрия favourite.svg, 2-state fill), активная = залита кнопочным токеном; механизм `lib/wishlist.ts` (`satin:wishlist:v1`, событие `satin:wishlist:updated`, глобал `window.__satinWishlist`, делегат `initWishlistUI` в Layout) — общий с пилотом rose. Бейдж `[data-wishlist-count]` в Header, страница `/wishlist`. | PC:47-66; g:140-145; lib/wishlist.ts |
| Карточка коллекции | `<a>` колонка `gap-3`; медиа `aspect-[430/564] bg-[#F5F5F5]`, hover `scale-[1.03] duration-500 ease-out`; имя Arsenal 16 uppercase left | CC:14-35 |
| Карточка-фича | **серая подложка** `bg-[#F5F5F5] p-6 gap-6 items-center text-center` (без радиуса); иконка-img 56×56 (`h-14 w-14`) | Features.astro:33-42 |
| Карточка журнала | `bg-[#F5F5F5] p-4 gap-6`; медиа `aspect-square bg-[#ECECEC]`; текст-блок `gap-2`; ссылка «Перейти»+стрелка | Journal.astro:44-57 |
| Медиа full-bleed | подложка `bg-[#111111]` (тёмный плейсхолдер фото), `overflow-hidden`, `object-cover` | Hero.astro:43; ImageBanner.astro:32; CollectionRows.astro:55; contacts.astro:41 |
| Медиа PDP | `aspect-[318/470] bg-[#F5F5F5]`, грид 2 колонки | PDP:51 |
| `<picture>`-обёртка | `SatinPicture` — WebP-source рядом с PNG/JPG (`images:optimize` в prebuild); для MinIO-картинок гидрация рисует плоский `<img>` | img/SatinPicture.astro; hyd:230-233 |
| Манера | углы **прямые везде** (`--radius-media: 0px`); плейсхолдер контент-карточек #F5F5F5, full-bleed фото #111111; «подложечные» карточки — только на сером #F5F5F5; ховер — мягкий zoom 1.03 | (выше) |

Исключения-литералы (НЕ переводить на радиус-токены): бейдж корзины `rounded-full`
(H:72,118), платёжные чипы `rounded-[4px]`/`rounded-[2px]` на `#fafafa` (F:96,166),
DS-панели фильтров `rounded-[6px]`/`rounded-[8px]` (catalog.astro:95,155).

## 5. Поля ввода

| Роль | Классы / значения | Источник |
|---|---|---|
| Поле рассылки | контейнер `h-10 border border-[#999999] pl-3 pr-2.5` (прямоугольник); input `text-xs font-light` прозрачный, placeholder #999999; submit — иконка-стрелка | F:72-74 |
| Строка поиска (панель шапки) | форма `h-10 border border-[#DDDDDD] pl-3 pr-1`; input Arsenal text-sm light, placeholder #999; кнопка «Найти» чёрная h-8 | H:163-165 |
| Поиск бургера | `h-10 border border-[#DDDDDD] pl-3 pr-2`, input text-xs | H:174-177 |
| Форма контактов | DS `NtTextField` (Имя/E-mail/Телефон) + textarea `min-h-[176px] border border-[#999999] bg-white p-4` Arsenal 16, placeholder #999, `focus-visible:border-[#000000]` | contacts.astro:55-67 |
| Счётчик количества (PDP) | input `h-10 w-8` text-center Arsenal 14, спиннеры скрыты | PDP:130; g:192-201 |
| Манера | прямоугольные поля с волосяным бордером (#999999 формы / #DDDDDD служебные), focus → чёрный бордер; `--radius-input: 0px` | (выше); theme.json |

## 6. Анимации

⚠️ Система **GSAP + ScrollTrigger** (деферный модуль из Layout), НЕ `data-animate`/
IntersectionObserver rose/bloom — у satin нет CSS для `data-animate`, его НЕ навешивать.
ViewTransitions НЕТ (Layout.astro без ClientRouter); гидрация всё равно слушает
`astro:page-load` — его шлёт превью-агент конструктора после hot-replace.

| Роль | Значения | Источник |
|---|---|---|
| Появление секций | GSAP на **`main > section`**: `opacity:0, x:±32 (чёт — слева, нечет — справа), y:24` → `0.7s power3.out`; ScrollTrigger `top 85%`, once; секции, видимые при загрузке, пропускаются (нет мигания) | scripts/gsap/sections.ts:10-44 |
| Подключение | `Layout.astro` → `scripts/gsap/index` (sections + search + cart-drawer + faq) после DOMContentLoaded | Layout.astro:29-33; scripts/gsap/index.ts |
| FAQ-аккордеон | перехват клика по summary `[data-faq-item]`; высота/прозрачность `[data-faq-answer]` 0.3s/0.35s power2; несколько открытых одновременно | scripts/gsap/faq.ts:8-63 |
| Кнопка «В корзину» карточки | CSS: на hover-устройствах скрыта (`opacity:0, translateY(8px)`), всплывает 0.3s по ховеру/фокусу карточки; touch — всегда видима | gsap-overrides.css:24-40 |
| Корзина-drawer | GSAP ведёт панель/оверлей (DS-transition отключён) | gsap-overrides.css:9-21; scripts/gsap/cart-drawer.ts |
| Мега-меню | opacity 150ms + `data-[open=true]`, grace-задержка закрытия 140ms; шеврон `rotate(180deg)` | H:126, 238-243; g:135-138 |
| Ховеры | картинки `scale(1.03)` 300ms (товар) / 500ms ease-out (коллекция); ссылки/кнопки opacity 0.7-0.8, `.satin-button` 0.78 | PC:29; CC:28; g:128-130 |
| reduced-motion | GSAP-ревилы и FAQ — no-op/мгновенно; CSS-всплытие кнопки отключено | sections.ts:12; faq.ts:21-24; gsap-overrides.css:41-45 |
| Скролл | `scroll-behavior: smooth` | g:65-67 |

Канон-секциям достаточно быть прямыми детьми `main` — ревил подхватит их сам.
В CollapsibleSection сохранить маркеры `data-faq-item`/`data-faq-answer` (их ищет initFaq).

## 7. Палитра (фактические литералы; RGB-триплеты для токен-фоллбеков)

| Цвет | RGB | Роль | Источник |
|---|---|---|---|
| #000000 | **0 0 0** | текст, заголовки, кнопки-заливки, бейджи, полоса объявления, копирайт-полоса, бейдж корзины, активные состояния | g:36; H:43,72; PC:33,73; F:180 |
| #FFFFFF | **255 255 255** | фон страницы и секций, текст на чёрном | g:37-38; Hero.astro:22; H:43 |
| #999999 | **153 153 153** | muted: кикеры, body-copy, ссылки подвала, placeholder, бордер форм | g:41, 98-104; Hero.astro:27; F:38, 72 |
| #F5F5F5 | **245 245 245** | поверхность: фон подвала, мега-меню, карточки-фичи/журнала, плейсхолдер медиа | g:39; F:44; H:129; Features.astro:33; PC:20 |
| #DDDDDD | **221 221 221** | волосяные рамки: низ шапки, разделители FAQ и подвала, формы поиска | g:40; H:47, 163; Faq.astro:32; F:104 |
| #606060 | 96 96 96 | неактивные ссылки бургера (`--satin-text-muted`) | g:42; H:191 |
| #111111 | 17 17 17 | тёмный плейсхолдер full-bleed фото | Hero.astro:43; ImageBanner.astro:32 |
| #ECECEC | 236 236 236 | плейсхолдер медиа журнала | Journal.astro:45 |
| #FAFAFA | 250 250 250 | чипы платёжных систем | F:96, 166 |

Паттерн токенов канон-секций (как в rose/bloom; фоллбек = родной литерал):
`rgb(var(--color-heading,0_0_0))`, `rgb(var(--color-text,0_0_0))`,
`rgb(var(--color-bg,255_255_255))`, `rgb(var(--color-muted,153_153_153))`,
`rgb(var(--color-surface,245_245_245))`; кнопка-1 (тёмная)
`rgb(var(--color-button-bg,0_0_0))` / `rgb(var(--color-button-text,255_255_255))`;
кнопка-2 (контурная light) — бордер/текст `rgb(var(--color-button-2-text,0_0_0))` на
прозрачном; скругления `rounded-[var(--radius-button,0px)]`,
`rounded-[var(--radius-media,0px)]`, `rounded-[var(--radius-input,0px)]`.
Волоски #DDDDDD: канон-приём каталога — прозрачность от токена текста
(`rgb(var(--color-text,0_0_0)/13%)` ≈ #DDD на белом; прецедент `border-color:
rgb(var(--color-text...)/4%)` ≈ #F5F5F5, catalog.astro:254-260) — токена бордера в
схемах satin нет, НЕ изобретать. Родная палитра = scheme-2 манифеста
(`packages/theme-satin/theme.json`: bg 255 255 255, heading/text 0 0 0,
muted 153 153 153, button-bg 0 0 0, button-2-bg 255 255 255).

## 8. Хром страницы

| Роль | Значения | Источник |
|---|---|---|
| Порядок | div.sticky[полоса+Header] → main → Footer → NtCartDrawer (`rootId satin-cart-drawer-root`, `eventPrefix satin:cart`) + initCartUI + gsap | Layout.astro:22-33; H:42 |
| Sticky | обёртка полосы и шапки целиком `sticky top-0 z-50` | H:42 |
| Полоса объявления | `bg-black py-2 text-center` Arsenal 11/md:14 uppercase tracking-[0.04em] белый; ВСЯ полоса — ссылка (`hover:opacity-80`), текст «Скидка 10% … Перейти»; встроена в Header. Отдельный `header/PromoBanner.astro` (text+link+подчёркнутый linkText) — legacy, страницами не используется (✓ grep) | H:43-45; header/PromoBanner.astro:11-23 |
| Шапка mobile | `h-14 px-4`: бургер h-10 w-10 / лого по центру строки (text-lg) / поиск+корзина (`h-6 w-6`, иконки size-6) | H:49-75 |
| Шапка desktop | одна строка `satin-pad h-16 max-w-[1920px]`: **навигация слева** (gap-8) / **лого абсолютным центром** (22px) / поиск+избранное+корзина справа (gap-5, кнопки h-8 w-8, иконки size-6) | H:78-121 |
| Низ шапки | `border-b border-[#DDDDDD]` | H:47 |
| Мега-меню («Коллекции», hover/focus) | панель под шапкой `grid-cols-4 bg-[#F5F5F5] p-4`: рубрика 16 uppercase + ссылки 14 light uppercase #999; соцсети в правой колонке; открытие/закрытие через `data-mega-trigger`/`data-mega-panel`, Escape | H:124-159, 228-256 |
| Бейдж корзины | `h-4 min-w-4 rounded-full bg-[#000000]` Arsenal 10 белый, `data-cart-count`, скрыт при `data-empty` | H:72, 118 |
| Поиск | панель под шапкой `border-t border-[#DDDDDD] py-4`; форма-прямоугольник + чёрная «Найти»; подсказки `data-search-results` из JSON-индекса demo-товаров (`data-search-index`) | H:162-168, 277 |
| Бургер | fixed-панель `top-[56px]`: поиск + чёрный квадрат профиля h-10 w-10; навигация колонкой gap-4 text-xs uppercase, активная плашка `h-0.5 w-12`; + пункты Корзина/Регистрация | H:172-198 |
| Подвал, фон | `bg-[var(--satin-surface)]` **#F5F5F5** (не белый!) | F:44 |
| Подвал desktop | контейнер 1320 `gap-10`: ряд 1 — слева лого (font-logo 20) + 2 колонки ссылок `gap-16` (навигация: Коллекции/История/Контакты; ассортимент: Мужское/Женское/Весна 25'/Лето 25'), справа рассылка `max-w-[320px]` + контакты right; ряд 2 — соцсети (5: TG/VK/TikTok/YouTube/Дзен, size-6 gap-3) ↔ платёжные чипы; ряд 3 — `border-t border-[#DDDDDD] pt-6`: копирайт ↔ правовые ссылки | F:46-111 |
| Подвал mobile | лого↔соцсети; 2 колонки ссылок; рассылка; контакты; низ — копирайт+чипы ↔ правовые | F:117-177 |
| Чёрная полоса | `bg-[#000000] py-4`, **font-inter** 12 light → md:16 белый центр, «© {год} {Название} Theme Все права защищены. Powered by Merfy» | F:180-182 |
| Рассылка | `data-newsletter-form` + `[data-newsletter-status]` — статус «Спасибо!…» инлайн-скриптом | F:72-76, 185-197 |

## 9. Лестницы размеров для канон-секций

Правило rose/bloom: дефолт/canon-default = литерал верстальщика байт-в-байт;
medium ≈0.85×, small ≈0.7× (или large ≈1.2× при базе medium), округление до целых px.

| Роль (база-литерал) | small | medium | large | База |
|---|---|---|---|---|
| Hero h1 26/md:32 (canon-носитель `large`) | 18/22 | 22/27 | **26/32 = литерал** | Hero.astro:32 |
| Заголовок баннера 26/32 (ImageWithText/Slideshow) | 18/22 | 22/27 | **26/32 = литерал** | ImageBanner.astro:46 |
| Кикер/hero-текст 16 (canon-носитель `large`) | 11 | 14 | **16 = литерал** (в баннере md:20 — литерал баннера) | Hero.astro:27; ImageBanner.astro:45 |
| Заголовок секции 20 (canon-default `medium`) | 17 | **20 = литерал** | 24 | TextBlock.astro:15 |
| Заголовок-аккордеон 18/md:20 (medium) | 15/17 | **18/20 = литерал** | 22/24 | Faq.astro:35; Features.astro:43 |
| Body `.satin-copy` 16 (canon-default `medium`) | 14 | **16 = литерал** | 19 | g:100 |
| Body крупный 16/md:20 (текст-секции, medium) | 14/17 | **16/20 = литерал** | 19/24 | TextBlock.astro:16 |
| Заголовок карточки журнала 16 (medium) | 14 | **16 = литерал** | 19 | Journal.astro:50 |
| Заголовок рассылки 14 (medium) | 12 | **14 = литерал** | 17 | F:71 |
| ContactForm заголовок 20 (medium) | 17 | **20 = литерал** | 24 | contacts.astro:49 |

## 10. Карта канон-секций (решения аналитика)

17 позиций будущего `themes/satin/sections.map.json` (паритет карты bloom).
⚠️ index.astro зовёт Hero/Collections/Popular **С legacy flat-пропсами**
(index.astro:17-30) — оживление обязано сохранить их побайтово.

| Канон | Файл | Решение |
|---|---|---|
| Header | `src/components/Header.astro` | оживить (полоса H:43-45 — только в статик-режиме без `id`; в каноне полоса = секция PromoBanner) |
| Footer | `src/components/Footer.astro` | оживить |
| PromoBanner | `src/components/sections/PromoBanner.astro` | новый: тело = полоса H:43-45; подчёркнутый хвост-ссылка — паттерн legacy `header/PromoBanner.astro:17-20`, только при заданном `link.text` |
| Hero | `src/components/sections/Hero.astro` | оживить (сплит 50/50 текст-слева + фото-справа) |
| Collections | `src/components/sections/Collections.astro` | оживить: дефолт = 3 плитки `data/collections.ts` verbatim; `collections[]` → те же плитки + гидрация `data-collection-ref` |
| PopularProducts | `src/components/sections/Popular.astro` | оживить (T13-схема + гидрация уже частично есть — Popular.astro:32-42) |
| Gallery | `src/components/sections/Gallery.astro` | с нуля в манере (секции нет; `components/gallery/*` — legacy клона со скруглениями, НЕ переиспользовать); композиция bloom Gallery (крупная плитка + боковые) на флэт-карточках §4 + гидрация data-gallery-* |
| MainText | `src/components/sections/MainText.astro` | адаптировать TextBlock.astro (копия тела; оригинал не трогать — index+about используют) |
| ImageWithText | `src/components/sections/ImageWithText.astro` | адаптировать ImageBanner.astro (копия тела; оригинал не трогать — index использует) |
| MultiColumns | `src/components/sections/MultiColumns.astro` | адаптировать Features.astro (копия тела; оригинал не трогать) |
| MultiRows | `src/components/sections/MultiRows.astro` | адаптировать CollectionRows.astro (копия тела; оригинал не трогать — index+about используют) |
| CollapsibleSection | `src/components/sections/CollapsibleSection.astro` | адаптировать Faq.astro (копия тела; оригинал не трогать — index+about используют; сохранить data-faq-* для GSAP) |
| Newsletter | `src/components/sections/Newsletter.astro` | новый: копия блока подписки подвала F:70-77 (подвал не трогать) |
| Slideshow | `src/components/sections/Slideshow.astro` | с нуля: полотно = about-герой (about.astro:37-57 — фото full-bleed + градиент + центрированный белый контент + белый контур-CTA) |
| Publications | `src/components/sections/Publications.astro` | адаптировать Journal.astro (копия тела; оригинал не трогать — index использует) |
| Video | `src/components/sections/Video.astro` | с нуля (контейнер 1320, медиа без скругления на surface; bloom-прецедент) |
| ContactForm | `src/components/sections/ContactForm.astro` | новый: разметка `pages/contacts.astro:46-77` (форма «Обратная связь»; страница остаётся inline и не меняется) |

Гидрация данных платформы: `src/lib/storefront-hydrate.ts` уже портирован — экспорты
те же, что у bloom/rose (loadRealProducts/loadRealCollections/findCollection/
filterByCollection/formatPrice/productHref/productImage/escapeHtml/renderCardHtml/
hydrateGrid/updateCount + варианты Phase 2, hyd:57-348); `renderCardHtml` рисует
карточку в манере satin со встроенной чёрной CTA (hyd:233-261). Селекторы, которые
скрипты темы ищут сегодня: `[data-nt="popular-grid"]` (Popular), `[data-nt="catalog-grid"]`,
`[data-nt="catalog-count"]`, `[data-nt="catalog-collections-filter"]` (каталог).
Атрибуты `data-collection-ref`/`data-own-image`/`data-gallery-product`/
`data-gallery-collection` вводятся канон-секциями со своими `<script>`-гидраторами
по образцу bloom (библиотека их уже умеет резолвить). PDP реальных товаров —
`/product?id=` (hyd:208-210).

## 11. Тон контента

Фэшн-минимализм, строгий КАПС, обращение на «вы», без восклицаний: «STYLE'S WEAR
COLLECTION SINCE 90'», «Там, где классика встречается с характером», «Оставайтесь
в центре внимания», «Одежда, в которой не нужно стараться выглядеть хорошо»,
«Здесь начинается персональный стиль», «Будьте в курсе наших новостей». CTA —
короткий императив/существительное: «В каталог», «Новые поступления», «Для женщин»,
«Перейти», «Смотреть больше/ещё», «В корзину». Ассортимент: Женское/Мужское,
Верхняя одежда / Джемперы и кардиганы / Худи и свитшоты / Футболки и топы, сезоны
«Весна 25'» / «Лето 25'» (F:12-17; H:28-29); товары — джинсы, костюмы, джемперы
с ценами вида «6 990 ₽» (data/products.ts). Болванки новых секций писать в этом
тоне: спокойные факты о ткани/крое/доставке (см. Features.astro:14-25,
Journal.astro:17-36), заголовки — uppercase Kelly Slab.
