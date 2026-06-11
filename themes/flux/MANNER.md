# Манера flux — стайлгайд верстальщика

Извлечено из фактической вёрстки `themes/flux/src` (не из Figma и не из theme-base).
Назначение: исходник для оживления канон-секций и досоздания новых в манере flux
(Фаза B тиража конструктора v2; эталоны процесса — `themes/bloom/MANNER.md` (свежий)
и `themes/rose/MANNER.md` (первоисточник)). Каждое значение — с пруфом `файл:строка`.

Пути сокращены: `g` = `src/styles/global.css`, `H` = `src/components/Header.astro`,
`F` = `src/components/Footer.astro`, `PC` = `src/components/products/FluxProductCard.astro`,
`PDP` = `src/components/products/FluxProductDetail.astro`,
`DS` = `@merfy-dropshipping-platform/design-systems-theme/src/components/ui`.

⚠️ **Шрифты — номинальные роли, системный рендер.** В g:16-20 классы `font-comfortaa`,
`font-manrope`, `font-inter` ВСЕ замаплены на `--font-family-sans` = system-ui-стек (g:10);
реальное семейство есть только у `.font-roboto-flex` («Roboto Flex»/Roboto/system-ui,
**вес 300**, g:22-25), но Google Fonts/woff тема НЕ подключает (BaseHead.astro:33-35 грузит
лишь atkinson — наследие Astro-стартера для blog-страниц). Итог: вся тема рендерится
системным sans; роли различаются регистром/размером/весом (400 против 300). В канон-секциях
сохранять классы-роли верстальщика как есть (механика bloom: классы из global.css темы).

⚠️ **Наследие клона rose — НЕ манера flux.** Не используются страницами (✓ проверено grep):
`SectionHeader.astro`, `CollectionCard.astro`, `ProductCard.astro`, `HeaderLink.astro`,
`header/{PromoBanner,NavLink,IconButton}.astro`, `footer/*`, `gallery/*`, `puck/config.tsx`
(initialData «Rose»), `pages/puck-editor.astro`. `pages/blog/*` и `pages/about.astro` —
англоязычный Astro-стартер. В новые канон-секции их роли не переносить.

## 1. Шрифтовые роли

| Роль | Классы / значения | Источник |
|---|---|---|
| Страничный h1 | `font-comfortaa text-[28px] font-normal uppercase leading-[1.115] md:text-[32px] lg:text-[36px]`, #000 | catalog.astro:27; contacts.astro:15; PDP:100; legal/[slug].astro:22 |
| Страничный подзаголовок | Manrope **font-light** 16 → md:18 → lg:20, leading-[1.366], #999999 | catalog.astro:31 |
| Шапка секций данных (Collections/Popular/Gallery) | DS `NtSectionHeading` БЕЗ варианта: центр, gap-[5px]; h2 Comfortaa 20 → md:24 → lg:32 uppercase leading-[1.115] #000; p Manrope 14 → md:18 → xl:24 leading-[1.366] #999 | Collections.astro:17; Popular.astro:19; Gallery.astro:18; DS/NtSectionHeading.astro:10-23 |
| Внутрисекционный h2 | Comfortaa 24 → md:28, uppercase, leading-[1.115], #000 | contacts.astro:40; cart.astro:76 |
| Hero h1 | Comfortaa **32 → md:40 → lg:48**, БЕЗ uppercase, leading-[1.115], белый | Hero.astro:54 |
| Hero подзаголовок | **Roboto Flex 300** 16 → md:18, leading-[1.5], белый | Hero.astro:58 |
| Body (правовые тексты) | Manrope font-light 16, leading-[1.6], #000 | legal/[slug].astro:25 |
| Подписи карточек (имя, цена) | Manrope 400 **14 → md:16**, leading-[1.366], #000 | PC:44,49; FluxCollectionCard.astro:32; Gallery.astro:53-58 |
| Старая цена | Manrope 12 → md:14, #999, line-through | PC:53 |
| Вторичный/маркетинговый текст | Roboto Flex 300, 12 → md:14, #999 (описание рассылки) или #000 (ссылки подвала) | F:44, 86 |
| Бейдж «Скидка» | Roboto Flex 300, 11 → md:12, чёрный текст на оранжевом | PC:35 |
| Ссылка навигации (desktop) | Manrope 400 14 → lg:16, #000, hover:opacity-70; активная — `after:h-[2px] after:w-full after:bg-[#FA5109]` | H:98-99 |
| Ссылка навигации (бургер) | 14px; активная #000 + полоска `h-[2px] w-[54px] bg-[#FA5109]`, неактивная #999999 | H:201-207 |
| Логотип | ТЕКСТ `{SITE_TITLE}` Comfortaa uppercase: mobile 18px, desktop 24 → lg:28 leading-none, #000 | H:54, 85 |
| PDP: цена / бренд / описание | Manrope 20 → md:24 #000 / 14 light #999 / 14 → md:15 light #999 leading-[1.5] | PDP:106, 92, 189 |
| PDP «Описание» h2 | Comfortaa 18 uppercase leading-normal #000 | PDP:186 |
| Заголовок рассылки (подвал) | Comfortaa 16 → md:18 uppercase leading-normal #000 | F:40 |
| Полоса объявления | DS `NtPromoBanner` (textSize дефолт lg): Roboto 300 16px, белый на чёрном | H:25-29; DS/NtPromoBanner.astro |
| Копирайт-полоса | Manrope 11 → md:12, белый по центру на чёрном | F:145 |

Итого ролей три: **Comfortaa(=системный) uppercase 400 = заголовки**, **Manrope(=системный)
400/light = body и подписи**, **Roboto Flex 300 = вторичный/маркетинговый мелкий текст**.
Hero h1 — единственный заголовок без uppercase.

## 2. Сетка секций

| Роль | Классы / значения | Источник |
|---|---|---|
| Горизонтальные поля секций главной (+шапка/подвал) | `px-4 md:px-20 2xl:px-80` (16/80/**320px**) | Collections.astro:13; Popular.astro:15; Gallery.astro:14; Hero.astro:47; H:82; F:34 |
| Горизонтальные поля служебных страниц | `px-4 md:px-20 2xl:px-[300px]` | catalog.astro:14; contacts.astro:8; cart.astro:16; PDP:45; legal/[slug].astro:19 |
| Вертикальные отступы секций главной | `pb-16 pt-16 → md:pb-24 md:pt-24` (**64/96**) | Collections.astro:13; Popular.astro:15; Gallery.astro:14; Puk.astro:6 |
| Вертикальные отступы каталога/PDP | `pt-10 pb-[80px] → md:pt-16 md:pb-[120px]` | catalog.astro:14; PDP:45 |
| Вертикальные отступы служебных страниц | `pt-12..16 pb-[60px] → md:pt-20 md:pb-[80px]` | contacts.astro:8; cart.astro:16; legal/[slug].astro:19 |
| Внешняя обёртка | `max-w-[1920px] mx-auto` (шапка desktop, подвал) | H:82; F:34 |
| Контентный контейнер | `mx-auto w-full max-w-[1320px]` | Collections.astro:16; Popular.astro:18; Gallery.astro:17; catalog.astro:23; F:36 |
| Зазор «шапка секции → контент» | `gap-8 md:gap-12` (главная); `gap-10` (каталог) | Collections.astro:16; Popular.astro:18; Gallery.astro:17; catalog.astro:23 |
| Грид коллекций | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `gap-6` | Collections.astro:19 |
| Грид товаров (Popular / каталог / корзина) | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`, `gap-4` (Popular md:gap-6) | Popular.astro:21; catalog.astro:97; cart.astro:80 |
| Галерея | `grid-cols-1 lg:grid-cols-[1fr_429px]`, `gap-6 md:gap-8` (и внутри правой колонки); слева `aspect-square`, справа `aspect-[429/444]` + `aspect-[429/309]` | Gallery.astro:20, 23, 36, 42, 67 |
| Hero-полотно | full-bleed, `min-height: clamp(500px, 80vh, 1080px)` (НЕ aspect-лестница!); контент-блок `max-w-[432px]` слева сверху (`px-4 pb-6 pt-32 md:px-20 md:pb-10 md:pt-40 lg:pt-52`), `justify-between` — внизу полотна DS `NtSearchBar` (`mt-auto max-w-[1320px] self-center`) | Hero.astro:29, 47, 50, 79-81 |
| PDP-раскладка | `lg:grid-cols-[600px_minmax(0,1fr)] gap-8 lg:gap-10` | PDP:50 |
| Сайдбар каталога (side-вид) | `w-[172px] xl:w-[294px]` | catalog.astro:125 |
| Брейкпоинты | стандартные Tailwind (sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536) | (классы выше) |

## 3. Кнопки

| Роль | Классы / значения | Источник |
|---|---|---|
| CTA (главная манера) | чёрная заливка: `h-12 rounded-[6px] bg-[#000000] px-6` (px-4 у каталога), Manrope 16 (14 → md:16 у каталога) 400, белый текст, `hover:opacity-95` | contacts.astro:76; cart.astro:36, 67; catalog.astro:112; auth/sign-in.astro:18 |
| CTA героя (на фото) | белая заливка: `h-12 rounded-[6px] border border-[#FFFFFF] bg-[#FFFFFF] px-6`, Manrope 14 → md:16, текст **#FA5109**, hover:opacity-90 | Hero.astro:66 |
| Вторая кнопка героя | outlined: `border border-[#FFFFFF]` на прозрачном, белый текст, `hover:bg-[#FFFFFF]/10` | Hero.astro:72 |
| PDP «Добавить в корзину» | белая с чёрным бордером: `h-12 rounded-[6px] border border-[#000000] bg-white px-4`, hover:opacity-90 | PDP:168 |
| PDP «Купить сейчас» | чёрная заливка (роль CTA) | PDP:179 |
| Кнопка поиска «Найти» | `h-10 rounded-[4px] bg-[#FA5109] px-3 py-2` Manrope 12 → md:14, **чёрный** текст, hover:opacity-95 | H:156 |
| Кнопка профиля (бургер) | `size-10 rounded-[4px] bg-[#FA5109]`, белая иконка | H:186 |
| Кнопка рассылки | прозрачная иконочная `size-10`, глиф arrow-right `size-5`, hover:opacity-80 | F:61-67 |
| Кнопки-фильтры каталога | `details/summary h-10 min-w-[180px] rounded-[6px] border` (уже на токенах muted/surface/text) | catalog.astro:41 |
| Кнопки вариантов (гидрация) | выбран: чёрная/белый текст; невыбран: белая + чёрный бордер; `h-10 rounded-[6px] px-3 py-2.5` 14px (demo-ряд DS `NtVariantTextRow` — rounded-[4px]) | storefront-hydrate.ts (VARIANT_BTN_*); PDP:121-126 |
| Манера | сплошные заливки, радиус CTA **6px** (`--radius-button: 6px` в theme.json), 4px у служебных; чёрное на белом, белое на фото; оранжевая заливка — только у служебных контролов (поиск, профиль), и текст на ней **чёрный**; hover — затухание opacity (0.90–0.95), `active:scale` НЕ используется | (выше) |

## 4. Карточки и медиа

| Роль | Классы / значения | Источник |
|---|---|---|
| Карточка товара | колонка `gap-3 md:gap-4`, без рамки/подложки; медиа `aspect-[318/444] rounded-[8px] bg-[#F5F5F5]`, hover `scale-105 duration-300` | PC:15, 21, 31 |
| Бейдж «Скидка» | `left-2 top-2 h-6 rounded-[4px] bg-[#FA5109] px-1.5` Roboto Flex 300 11 → md:12 **чёрный** | PC:35 |
| Подписи товара | имя и цена Manrope 14 → md:16 #000; старая цена 12 → md:14 #999 line-through; зазор `gap-1`, ряд цен `gap-2 items-baseline`, выравнивание left | PC:41-57 |
| Карточка коллекции | `gap-4 md:gap-5`; медиа `aspect-[430/500] rounded-[8px] bg-[#F5F5F5]`, hover `scale-[1.03] duration-500 ease-out`; имя Manrope 14 → md:16 | FluxCollectionCard.astro:16, 20, 28, 32 |
| Плитки галереи | `rounded-[8px] bg-[#F5F5F5]`; аспекты square / 429-444 / 429-309; hover `scale-[1.02]`/`scale-105`/`scale-[1.03]`, 300–500ms | Gallery.astro:23, 30, 42, 49, 67, 74 |
| PDP-медиа | `aspect-square bg-[#F5F5F5]` **БЕЗ скругления**, `object-contain`; превьюшки `grid-cols-3 gap-4` | PDP:52, 58, 68 |
| Манера | карточки «голые» (без бордера и подложки); скругление **8px только на медиа** (`--radius-media: 8px`); плейсхолдер #F5F5F5; ховер — мягкий zoom; обёртка картинок — `FluxPicture` (`<picture>` + соимённый .webp) | PC:21; components/img/FluxPicture.astro |

## 5. Поля ввода

| Роль | Классы / значения | Источник |
|---|---|---|
| Поле рассылки | контейнер `h-11 md:h-12 max-w-[460px] rounded-[4px] border-[#F5F5F5] pl-3 pr-1`; input Manrope 12 → md:14, placeholder #999999 | F:50, 59 |
| Строка поиска (панель шапки) | `h-12 rounded-[4px] border-[#FA5109] pl-3 pr-1 max-w-[1320px]`, input Manrope 14 → md:16 | H:146, 152 |
| Поиск бургера | `h-10 rounded-[4px] border-[#999999]` Manrope 12 | H:173, 178 |
| Поиск в Hero (DS `NtSearchBar`) | `h-12 max-w-[1320px] rounded-[4px] border-[#000000]`, input Manrope 16 light, чёрная кнопка «Найти» h-10 rounded-[4px] | Hero.astro:80; DS/NtSearchBar.astro |
| Форма контактов | DS `NtTextField` ×3 + textarea `min-h-[232px] rounded-[4px] border-[#000000] p-4` Manrope 16, placeholder #999 | contacts.astro:50-58, 69 |
| Счётчик количества (PDP) | `h-10 rounded-[4px] border-[#F5F5F5]`, кнопки `size-10`, input `w-12` Manrope 14 центр | PDP:129, 142 |
| Манера | радиус полей всегда **4px**. ⚠️ В theme.json `--radius-input: 8px`, а `--radius-field: 4px` — токенизировать 4px-литералы через `var(--radius-field,4px)`, НЕ через `--radius-input` (иначе live уедет на 8px) | packages/theme-flux/theme.json defaults |

## 6. Анимации

⚠️ Скролл-системы НЕТ: ни `[data-animate]`/IntersectionObserver, ни hero-каскада, ни
Astro ViewTransitions (✓ grep по src — пусто; Layout.astro без ClientRouter). Слушатели
`astro:page-load` в скриптах — защитные (вызов идёт сразу). В новых канон-секциях
скролл-анимации НЕ добавлять — манера flux статична.

| Роль | Значения | Источник |
|---|---|---|
| Ховеры картинок | `scale(1.02–1.05)`, `duration-300` (товары) / `duration-500 ease-out` (коллекции, крупные плитки) | PC:31; FluxCollectionCard.astro:28; Gallery.astro:30 |
| Ховеры кнопок/ссылок | `transition-opacity`, opacity 0.70–0.95 | H:98; F:86; Hero.astro:66 |
| Бургер-иконка | линии `transition 0.3s cubic-bezier(0.4,0,0.2,1)`, поворот ±45° | g:27-40 |
| Прокрутка | `scroll-behavior: smooth` | g:42-44 |

## 7. Палитра (фактические литералы; RGB-триплеты для токен-фоллбеков)

| Цвет | RGB | Роль | Источник |
|---|---|---|---|
| #FA5109 | **250 81 9** | акцент: бейдж скидки, подчёркивание активной навигации, бордер+кнопка поиска, бейдж корзины, кнопка профиля бургера | PC:35; H:99, 146, 156, 72, 186; g:13 |
| #000000 | 0 0 0 | текст, заголовки, CTA-заливка, полоса объявления (DS), копирайт-полоса, бордер NtSearchBar | g:11; contacts.astro:76; F:144; DS/NtPromoBanner.astro |
| #FFFFFF | 255 255 255 | фон страницы и секций; текст и кнопки на фото героя | Layout.astro:22; Hero.astro:54, 66 |
| #999999 | 153 153 153 | вторичный текст, placeholder, неактивные ссылки бургера | g:12; catalog.astro:31; H:178, 203 |
| #F5F5F5 | 245 245 245 | плейсхолдер медиа, низ шапки, бордеры рассылки/счётчика, разделители корзины | PC:21; H:32; F:50; PDP:129; cart.astro:59 |
| #4AD300 | 74 211 0 | успех форм (рассылка, контакты) | F:72; contacts.astro:85 |

Паттерн токенов канон-секций (как в bloom/rose; фоллбек = родной литерал места):
`rgb(var(--color-bg,255_255_255))`, `rgb(var(--color-heading,0_0_0))`,
`rgb(var(--color-text,0_0_0))`, `rgb(var(--color-muted,153_153_153))`,
`rgb(var(--color-surface,245_245_245))`, `rgb(var(--color-accent,250_81_9))`;
чёрная CTA → `rgb(var(--color-button-2-bg,0_0_0))` / `rgb(var(--color-button-2-text,255_255_255))`
(в схемах flux чёрная кнопка = кнопка-2); CTA героя → токены кнопки-1
`rgb(var(--color-button-bg,255_255_255))` / `rgb(var(--color-button-text,250_81_9))`
(в схемах кнопка-1 = фирменная оранжевая); outlined-кнопки — бордер+текст цвета заливки
(`--color-button-2-bg`, паттерн bloom); оранжевые служебные заливки → `--color-accent`
с чёрным текстом-литералом. Радиусы: `rounded-[var(--radius-button,6px)]`,
`rounded-[var(--radius-media,8px)]`, `rounded-[var(--radius-field,4px)]` (см. §5 про --radius-input).

⚠️ Схемы flux включают ТЁМНЫЕ (scheme-1 `--color-bg: 0 0 0` — первая схема темы, scheme-4) —
захардкоженные #000-тексты DS-компонентов на тёмной схеме исчезают. Шапку
`NtSectionHeading` в канон-секциях оборачивать перекрытием
`[&_h2]:!text-[rgb(var(--color-heading,0_0_0))] [&_p]:!text-[rgb(var(--color-muted,153_153_153))]`
(фоллбеки = литералы DS → без схемы пиксель не меняется; прецедент перекрытий — bloom Popular).

## 8. Хром страницы

| Роль | Значения | Источник |
|---|---|---|
| Порядок | sticky-обёртка (NtPromoBanner + Header) → main → Footer → NtCartDrawer (`rootId flux-cart-drawer-root`, `eventPrefix flux:cart`) + initCartUI | Layout.astro:22-32; H:24 |
| Полоса объявления | DS `NtPromoBanner` (чёрная, Roboto 300 16, подчёркнутый хвост «Перейти»); flux-пропсы: «Бесплатная доставка на весь ассортимент до 30.06.2026.» → /catalog | H:25-29 |
| Шапка | белая, `border-b border-[#F5F5F5]`, `data-nt="flux-header"` | H:31-34 |
| Шапка mobile | строка `h-14 px-4`: бургер 32px / текст-лого по центру / поиск+корзина+аккаунт (`size-6`, иконки size-6/size-4) | H:36-79 |
| Шапка desktop | ОДИН ряд `md:py-4 px-20 2xl:px-80` в `max-w-[1920px]`: лого слева — навигация по центру (`gap-8 lg:gap-10`) — поиск/корзина/аккаунт справа (`gap-4 lg:gap-5`, кнопки `size-8 lg:size-10`, иконки size-6) | H:82-137 |
| Бейдж корзины | `h-4 min-w-[16px] rounded-full bg-[#FA5109]` Manrope 10 **чёрный**, скрыт при `data-empty` | H:72, 127 |
| Панель поиска | под шапкой, `border-t border-[#F5F5F5]`, toggle hidden/block (без анимации); форма с оранжевым бордером и оранжевой кнопкой | H:141-161, 242-259 |
| Бургер | `fixed inset-x-0 top-[56px] bottom-0 z-[55]`: строка поиска + оранжевая кнопка профиля `rounded-[4px]`; навигация колонкой `gap-4` + ссылки «Корзина», «Регистрация» | H:164-213 |
| Футер, блок 1 | рассылка в столбец: заголовок Comfortaa 16/18 + описание Roboto Flex 12/14 #999 + форма `max-w-[460px]` с иконкой-кнопкой + статус #4AD300 | F:36-74 |
| Футер, блок 2 | грид `grid-cols-2 md:grid-cols-4 gap-8 md:gap-6`: навигация / правовые / контакты (тел+почта) / соцсети (5 шт `size-6`: Telegram VK TikTok YouTube Дзен) + платёжки текстом «Mastercard VISA МИР» 10/12 (правая колонка md:items-end) | F:77-140 |
| Футер, блок 3 | чёрная полоса `py-4 md:py-5`, Manrope 11/12 белый центр, «© {год} Flux Theme. Все права защищены. Powered by Merfy» | F:144-148 |
| Checkout | страница уже на mega-блоках theme-base в обёртке `color-scheme-2` — канон-секциями не покрывается | pages/checkout.astro:34-36 |

## 9. Лестницы размеров для канон-секций

Правило rose/bloom: canon-default (то, что пишут blockDefaults/defaultPagesData) И
отсутствие пропа = литерал верстальщика байт-в-байт; соседние ступени ≈0.85×/0.7×
(или ×1.2/×1.44 вверх), округление до целых px.

| Роль (база-литерал) | small | medium | large | База |
|---|---|---|---|---|
| Шапка секций DS (lg-база 32) — дефолт `small` (прецедент bloom Popular) | **литерал DS 20/24/32** | 38 (`[&_h2]:!text-[38px]`) | 46 | DS/NtSectionHeading; Popular.astro:19 |
| Подзаголовок DS (xl-база 24) — дефолт `small` | **литерал 14/18/24** | 29 | 35 | DS/NtSectionHeading |
| Hero h1 32/40/48 — дефолт `large` | 22/28/34 | 27/34/41 | **32/40/48 = литерал** | Hero.astro:54 |
| Hero текст 16/18 — дефолт `large` | 11/13 | 14/15 | **16/18 = литерал** | Hero.astro:58 |
| Страничный h1 28/32/36 (ContactForm) — дефолт `large` | 20/22/25 | 24/27/31 | **28/32/36 = литерал** | contacts.astro:15 |
| Внутренний h2 24/28 (MainText-манифест) — дефолт `large` | 17/20 | 20/24 | **24/28 = литерал** | contacts.astro:40; cart.astro:76 |
| Body-текст 16 — дефолт `medium` | 14 | **16 = литерал** | 19 | legal/[slug].astro:25 |
| Заголовок рассылки 16/18 (Newsletter) — дефолт `medium` | 11/13 | **16/18 = литерал** | 19/22 | F:40 |
| Текст рассылки 12/14 — дефолт `medium` | 10/11 | **12/14 = литерал** | 14/17 | F:44 |

## 10. Карта канон-секций (решения аналитика)

`themes/flux/sections.map.json` отсутствует — создать на 17 позиций (паритет bloom).
Секций верстальщика всего 4 (+Puk — тестовый мусор, в канон НЕ включать; его шапка-паттерн
«Comfortaa 24/28 центр + Roboto Flex 18/20 #999» — валидная роль, контент нет, Puk.astro:8-11).
Большинство позиций — с нуля в манере. Уникальных страниц-доноров типа Philosophy/Benefits
у flux нет.

| Канон | Файл | Источник |
|---|---|---|
| Header | `src/components/Header.astro` | оживить; NtPromoBanner рендерить только в статик-режиме (без `id`) — в каноне полоса = секция PromoBanner (паттерн bloom Header:117-133) |
| Footer | `src/components/Footer.astro` | оживить (blockDefaults flux в theme.json уже несут newsletter/columns/socials) |
| PromoBanner | `src/components/sections/PromoBanner.astro` | новый: тело = разметка DS NtPromoBanner verbatim (чёрная полоса + подчёркнутый «Перейти»); дефолты = flux-пропсы H:26-28 |
| Hero | `src/components/sections/Hero.astro` | оживить; вторую кнопку «О нас» и NtSearchBar внизу полотна сохранить в дефолт-ветке |
| Collections | `src/components/sections/Collections.astro` | оживить: дефолт = NtSectionHeading «Категории» + 3 FluxCollectionCard verbatim; ветка `collections[]` = плитки 430/500 rounded-8 + гидрация `data-collection-ref` |
| PopularProducts | `src/components/sections/Popular.astro` | оживить (полная T13-схема по bloom Popular; hydrateGrid уже есть — расширить data-cards/data-collection) |
| Gallery | `src/components/sections/Gallery.astro` | оживить (items[] ≤3 + гидрация data-gallery-product/-collection; `<style>` #gallery сохранить) |
| MainText | `src/components/sections/MainText.astro` | с нуля: контейнер 1320, манифест Comfortaa 24/28 uppercase (роль внутреннего h2), чёрная CTA |
| ImageWithText | `src/components/sections/ImageWithText.astro` | с нуля (медиа-паттерн Gallery: rounded-8, surface, hover-zoom; сетка lg:grid-cols-2 gap-6 md:gap-8) |
| MultiColumns | `src/components/sections/MultiColumns.astro` | с нуля: голые колонки (медиа rounded-8 + Comfortaa-подзаголовок + Roboto Flex-текст), без подложек |
| MultiRows | `src/components/sections/MultiRows.astro` | с нуля (паттерн ImageWithText, чередование; эталон — bloom MultiRows) |
| CollapsibleSection | `src/components/sections/CollapsibleSection.astro` | с нуля (details/summary; разделители #F5F5F5; chevron = NtIcon dropdown-chevron как в catalog.astro:43) |
| Newsletter | `src/components/sections/Newsletter.astro` | новый: копия блока подписки подвала F:36-74 (подвал не трогать) |
| Slideshow | `src/components/sections/Slideshow.astro` | с нуля (полотно Hero flux: clamp-высота, блок 432px; иконки arrow-slide-left/right есть в public/icons; без hero-каскада — анимаций в манере нет, переключение fade) |
| Publications | `src/components/sections/Publications.astro` | с нуля (грид карточек в манере §4: медиа rounded-8 surface + подписи Manrope; data-атрибут publicationType на гриде — паттерн bloom) |
| Video | `src/components/sections/Video.astro` | с нуля (контейнер 1320 + rounded-[var(--radius-media,8px)] на surface; постер-фоллбек /images/hero-flux.png) |
| ContactForm | `src/components/sections/ContactForm.astro` | новый: разметка pages/contacts.astro verbatim (страница остаётся inline и не меняется) |

Гидрация: `src/lib/storefront-hydrate.ts` уже портирован (экспорты те же, что у bloom/rose:
loadRealProducts/loadRealCollections/findCollection/filterByCollection/formatPrice/productHref/
productImage/escapeHtml/renderCardHtml/hydrateGrid/updateCount + варианты Phase 2);
`renderCardHtml` рисует карточку в манере flux (aspect-[318/444] rounded-8, без кнопки).
Селекторы, которые ищут скрипты темы: `[data-nt="popular-grid"]`, `[data-nt="catalog-grid"]`,
`[data-nt="catalog-count"]`, `[data-nt="catalog-collections-filter"]`, `[data-collection-option]`
(Popular.astro:31-41; catalog.astro:296-402). ⚠️ `PLACEHOLDER_IMAGE = /placeholders/sweater-blue.png`
— файла в public НЕТ (✓ ls); канон-плейсхолдеры карточек брать из родных ассетов
`/images/4x/Товар_N.png`, `/images/4x/Коллекция_N.png` (принцип rose T15).

## 11. Тон контента

Электроника/гаджеты, уверенный технологичный язык: «Технологии без паузы», «Будущее — в
режиме онлайн. Ваш новый гаджет — уже в наличии», «Следующее поколение уже с вами»,
«Категории», «Популярное», «Топовые модели Flux, которые выбирают чаще всего»,
«Вдохновение в деталях», «Технологии, которые приятно держать в руках каждый день»
(pages/index.astro:11-17; catalog.astro:32; Collections.astro:6-8; Popular.astro:6-8;
Gallery.astro:8-10). Коллекции: Смартфоны / Наушники / Ноутбуки / Аксессуары
(data/collections.ts; H:12-18); товары — M Phone 17, M Headphones 2s, M Laptop Air с ценами
вида «140 990₽» (data/products.ts; в demo-литералах пробела перед ₽ нет, formatPrice
гидрации даёт «140 990 ₽»). Тексты-болванки новых секций писать в этом тоне (коротко,
технологично, без уменьшительности; CTA — «В каталог», «Смотреть ещё», «Купить сейчас»).
