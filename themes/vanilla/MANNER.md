# Манера vanilla — стайлгайд верстальщика

Извлечено из фактической вёрстки `themes/vanilla/src` (не из Figma и не из theme-base).
Назначение: исходник для оживления канон-секций и досоздания новых в манере vanilla
(Фаза B тиража конструктора v2; процесс-эталоны — `themes/bloom/MANNER.md` и
`themes/rose/MANNER.md`). Каждое значение — с пруфом `файл:строка`.

Пути сокращены: `g` = `src/styles/global.css`, `H` = `src/components/Header.astro`,
`F` = `src/components/Footer.astro`, `FN` = `src/components/footer/FooterNewsletter.astro`,
`PC` = `src/components/products/VanillaProductCard.astro`, `CC` =
`src/components/products/VanillaCollectionCard.astro`, `Gal` =
`src/components/sections/Gallery.astro`, `Col` = `src/components/sections/Collections.astro`,
`Pop` = `src/components/sections/Popular.astro`, `Cat` =
`src/components/catalog/VanillaCatalogSection.astro`, `about` = `src/pages/about.astro`,
`L` = `src/layouts/Layout.astro`, `fc` = `src/components/catalog/filter-classes.ts`.

⚠️ **Наследие клона rose — НЕ манера vanilla.** Классы `.font-comfortaa/.font-manrope/
.font-inter` все алиасятся на `--font-nt-ui` = Manrope из DS-токенов (g:41-45; DS
tokens.css:54). Manrope-роли остались в служебных местах: панель поиска (H:199-205),
бейдж корзины (H:98,163), `pages/contacts.astro` целиком (Manrope 12-14px +
`.vanilla-button` 10px — клон-страница, НЕ источник манеры), блог, части LoginDrawer.
`SectionHeader.astro`, `header/PromoBanner.astro`, `gallery/GalleryCollection.astro`,
`gallery/GalleryProductCard.astro`, `HeaderLink.astro`, корневые `CollectionCard.astro`/
`ProductCard.astro`, `.vanilla-heading`/`.vanilla-copy` (g:223-236) — страницами НЕ
используются (✓ проверено grep). Родная манера vanilla = **Bitter italic (заголовки) +
Arsenal (всё остальное) + оливково-зелёная палитра + нулевые радиусы**.

## 1. Шрифтовые роли

| Роль | Классы / значения | Источник |
|---|---|---|
| Заголовок секции | Bitter 400 **italic**, **20px**, leading-none, **#26311C** на светлом / white на тёмном | Col:20; Pop:21; FN:16; Gal:92; about:149 |
| Подзаголовок секции | Arsenal 400 **italic**, 16px, leading-none, **#444444** | Col:24; Pop:25 |
| Hero h1 | `font-vanilla-bitter text-2xl font-normal italic text-white` (24px), line-height **1.2** + `padding-bottom:0.125em` (курсив режется при lh 1) | Hero.astro:88, 156-161 |
| Hero подзаголовок | Arsenal 400 italic, 16px, line-height **1.35**, **#F0F0F0** | Hero.astro:94, 163-167 |
| Заголовок узкого полотна (Gallery promo) | Bitter italic **16px** leading-none white | Gal:34 |
| Текст полотна | Arsenal italic **14px** leading-[1.5] #F0F0F0, `min-[1920px]:text-[16px]` | Gal:39, 96-101; about:38 (16px leading-[1.45]/[1.35]) |
| Кнопки (все CTA) | Arsenal 400, 16px (узкие — 14px), **uppercase**, leading-none | Hero.astro:100; Gal:45,105; FN:42 |
| Полоса объявления | Arsenal 400, 14 → md:16px, uppercase, white | H:53 |
| Ссылка навигации (desktop) | Arsenal 400, 16px, white, `pb-1`, hover:opacity-70; активная `after:h-px after:w-full after:bg-white` | H:132-134 |
| Ссылка навигации (бургер) | 14px (без font-класса → Manrope body); активная `text-[--vanilla-green]` + полоска `h-px w-[54px] bg-[--vanilla-header-bg]`, неактивная `--vanilla-muted` | H:256-262 |
| Имя товара | Arsenal 400, 16px, **uppercase**, leading-none, black | PC:66 |
| Цена | Arsenal 16 black; старая цена 14 **#444444** line-through; ряд `items-baseline gap-2` | PC:71, 75 |
| Подпись коллекции | Arsenal 16 uppercase **#26311C** | CC:32 |
| Заголовок каталога | Bitter italic **uppercase** 20px black (единственный капс-Bitter) | Cat:99 |
| Ссылки/контакты футера | Arsenal 16 leading-none white; копирайт 14 → md:16 | F:61, 74, 109, 117 |
| Label форм | Arsenal 16 leading-normal #444444; input Arsenal 16 `--vanilla-dark` | about:82, 87 |
| Бейдж корзины | Manrope 10px на белом кружке, текст `--vanilla-dark` (служебная роль) | H:98, 163 |
| Логотип | SVG-вордмарк «Vanila» 89×28 white (`VanilaLogo`/`VanilaFooterLogo`), не текст | H:121; F:54; icons/VanilaLogo.astro |
| Подключённые семейства | Google Fonts: Arsenal 400/700/italic-400, Bitter 400/italic-400; `--font-nt-ui`=Manrope из DS | BaseHead.astro:38-41; g:23-24, 41-57 |

Итого ролей две: **заголовки = Bitter 400 italic** (никогда не bold, капс только в
каталоге), **всё остальное = Arsenal 400** (кнопки/нав/полоса/подписи — uppercase
прямой; тексты на полотнах — italic). theme.json: `--font-heading: 'Bitter', serif`,
`--font-body: 'Arsenal', sans-serif`, оба weight 400.

## 2. Сетка секций

| Роль | Классы / значения | Источник |
|---|---|---|
| Горизонтальные поля (везде одни) | `.vanilla-pad` = `padding-inline: clamp(16px, 6.25vw, 120px)` | g:37, 215-217; Col:13; Pop:14; Gal:25; FN:5; F:45; Cat:80 |
| Шапка desktop | `.vanilla-pad` + `max-w-[1560px]`, `min-[1920px]:max-w-[1920px] min-[1920px]:px-[300px]`, h-20 | H:114 |
| Контейнер светлых секций | `.vanilla-container` (max-w 1320, g:209-213) суженный `max-w-[1180px]` | Col:16; Pop:17 |
| Контейнер тёмных полотен | `max-w-[1280px] min-[1920px]:max-w-[1320px]` | Gal:30, 59, 89 (1280); FN:10; about:144 |
| Контейнер каталога/about | `max-w-[1320px]` (каталог — `.vanilla-container` без сужения) | Cat:95; about:26, 68 |
| Вертикальные отступы светлых секций | `py-20 md:py-28` (**80/112**) | Col:13; Pop:14 |
| Вертикальные отступы полотен | `py-16 lg:py-20` (промо/видео Gal) и `py-16 lg:py-[120px]` (care/Newsletter/about) | Gal:25, 54, 83; FN:5; about:22, 65, 139 |
| Вертикальные отступы каталога | `py-16 md:py-20` | Cat:80 |
| Футер | основное полотно `py-12 md:py-16`; ряды внутри `gap-12 md:gap-20`; полоса Powered by `min-h-16` | F:45, 47, 127 |
| Зазор «шапка секции → контент» | `gap-8` (секции 1180), `gap-10` (каталог, полотна, about); заголовок→подзаголовок `gap-2` | Col:16-17; Pop:17-18; Cat:95; FN:10-13 |
| Грид товаров | `grid-cols-1 gap-x-3 gap-y-9 sm:grid-cols-2 md:grid-cols-3 md:gap-x-4 md:gap-y-12` | Pop:30; Cat:217, 257 |
| Грид коллекций | `grid-cols-1 gap-4 md:grid-cols-2` | Col:29 |
| Сайдбар каталога | `lg:w-[294px]` + контент `lg:gap-6`; родной вид — `data-catalog-layout="side"` | Cat:253-254; VanillaCatalogFilterSidebar.astro:46 |
| Hero-полотно | full-bleed; viewport `min-h-[520px] md:min-h-[620px] xl:min-h-[790px]`; контролы-бар `h-16`; контент `items-center` по вертикали, блок `max-w-[min(100%,52rem)] gap-5` слева | Hero.astro:48, 79-82, 111 |
| Сшивка полос (специфика vanilla) | соседние секции/бэнды перекрываются на **-2px** (`main > section + section`, `[data-vanilla-stack] > * + *`) против субпиксельных щелей; у тёмных полотен это уже глобально | g:100-203 |
| Брейкпоинты | стандартные Tailwind + кастомный `min-[1920px]` | (классы выше) |

## 3. Кнопки

| Роль | Классы / значения | Источник |
|---|---|---|
| CTA solid (главная манера) | `inline-flex h-12 min-h-12 items-center justify-center bg-[var(--vanilla-header-bg)] px-4` Arsenal 16 uppercase leading-none white, `hover:opacity-90` (или 0.8) — **прямоугольная, без радиуса** | Hero.astro:100; about:123; Cat:239 (`px-6 sm:px-16` «Смотреть ещё») |
| CTA outlined на тёмном | `h-12 border border-white bg-transparent px-4` Arsenal 16 uppercase white `hover:opacity-80`; узкий вариант `h-10 px-3 text-[14px]` («К покупкам»); у care-бэнда border **1.3px** | about:46, 161; Gal:45, 105 |
| Кнопка рассылки | белая: `h-9 (sm:h-8) bg-white px-2 py-2.5` Arsenal 16 uppercase, текст `--vanilla-header-bg` | FN:42 |
| Кнопка поиска «Найти» | `h-10 rounded-[4px] bg-[var(--vanilla-header-bg)] px-3 py-2.5` Manrope 14 white (служебное исключение — 4px, клон rose) | H:203 |
| Кнопка профиля бургера | квадрат `size-10 bg-[var(--vanilla-green)]`, белая иконка | H:240 |
| Манера | только **плоские прямоугольники** (радиус **0**, `--radius-button: 0px` в theme.json): тёмно-зелёная заливка #3A4530 на светлом / белый контур на тёмном полотне; текст ВСЕГДА Arsenal uppercase; hover — opacity 0.8–0.9; **`active:scale` НЕ используется** (✓ grep) | Hero.astro:100; Gal:45; theme.json defaults |

## 4. Карточки и медиа

| Роль | Классы / значения | Источник |
|---|---|---|
| Карточка товара | колонка `gap-3`, без рамки/фона; медиа `aspect-square bg-[var(--vanilla-card)]` (#ECEBE7), hover `scale-105 duration-300`; **без скруглений** | PC:22-40 |
| Бейдж «Скидка» | `left-2 top-2 h-6 min-w-12 bg-[var(--vanilla-announcement-bg)] px-1.5` Arsenal **9px** white, прямоугольный | PC:43 |
| Свотчи цветов | белый квадрат `p-0.5 gap-0.5` в правом нижнем углу, точки `size-2 rounded-[1px]` | PC:48-60 |
| Подписи товара | имя uppercase + цены, `gap-1`, выравнивание left | PC:63-79 |
| Карточка коллекции | `gap-3`; медиа `aspect-[1/1] bg-[var(--vanilla-card)]`, hover `scale-[1.08] duration-500 ease-out`; подпись Arsenal 16 uppercase #26311C `group-hover:opacity-70` | CC:20, 28, 32 |
| Видео-плитка | `aspect-[1319/742] bg-[var(--vanilla-card)]`, `<video autoplay muted loop playsinline>` + иконка play `size-11` по центру | Gal:60-76 |
| Фото care-бэнда | `aspect-[652/366] max-w-[652px] bg-[var(--vanilla-card)]` | Gal:111 |
| Фото about | `aspect-[429/440]` (429×440) | about:51 |
| Манера | всё плоское: **радиус 0 на любых медиа** (`--radius-media: 0px`); плейсхолдер #ECEBE7; ховер — мягкий zoom 1.05–1.08; на тёмных полотнах медиа без подложек-карточек | PC:29; CC:20; theme.json |

## 5. Поля ввода

| Роль | Классы / значения | Источник |
|---|---|---|
| Поле формы (about) | `h-14 min-h-[56px] rounded-[4px] border border-[#000000] bg-white px-4` Arsenal 16, placeholder #999999; focus `border-[var(--vanilla-header-bg)]` | about:87, 97, 107 |
| Textarea | `min-h-[232px] rounded-[4px] border-[#000000] bg-white p-4` Arsenal 16 | about:116 |
| Поле рассылки | контейнер-форма `border border-white bg-transparent p-3` (sm: `h-14 pl-4 pr-3`), focus-within `border-white/80`; input прозрачный Arsenal 16, placeholder **#F0F0F0** — без радиуса | FN:29-39 |
| Строка поиска | `h-12 rounded-[4px] border-[#E5E5E5] bg-white` + тень `shadow-[0_8px_24px_rgba(0,0,0,0.08)]`, Manrope 16 (клон rose) | H:191-199 |
| Поиск бургера | `h-10 rounded-[4px] border-[var(--vanilla-line)]` Manrope 12 | H:222-231 |
| Радио каталога | кружок `h-6 w-6 rounded-full border-2` muted, точка `10px` цвета текста; подпись muted → checked цвет текста; уже на токенах `rgb(var(--color-*))` | fc:17-22 |
| Манера | формы полотен — прозрачные с белым бордером без радиуса; светлые формы — белые с чёрным бордером и служебным радиусом 4px. ⚠️ theme.json задаёт `--radius-input: 0px` — НЕ заводить токен радиуса на поля about-формы (4px ≠ токен), литерал | FN:29; about:87; theme.json |

## 6. Анимации

Система — паритет с rose (скопирована верстальщиком, g:238 комментарий):

| Роль | Значения | Источник |
|---|---|---|
| Появление по скроллу | `[data-animate]`: `opacity:0; translateY(18px)` → `.is-visible` → `fadeInUp 0.65s cubic-bezier(0.4,0,0.2,1)`; вариант `slide-down` 0.55s | g:289-301 |
| Триггер | IntersectionObserver `threshold 0.08, rootMargin -36px`, одноразовый; задержка `data-animate-delay`; реинициализация на `astro:after-swap` | L:39-66 |
| Загрузка героя | `.hero-animate-1/2/3` — каскад 0.7s, задержки 0.05/0.15/0.28s | g:303-312 |
| Смена слайда | `.vanilla-hero-copy-fade` — fadeInUp 0.5s на тексте; фоны `transition-opacity duration-500 ease-out`; swipe от 44px; reduce-motion отключает | g:313-315; Hero.astro:59; vanillaHeroCarousel.ts:28-56, 90-100 |
| Смена страниц | Astro ViewTransitions, `fadeIn 0.25s` | g:318-323; L:24 |
| Ховеры | картинки `scale(1.05–1.08)` 300–500ms; кнопки/ссылки `opacity 0.7–0.9`; нажатия-scale нет | PC:39; CC:28; H:132 |
| Бургер-иконка | линии `transition 0.3s cubic-bezier(0.4,0,0.2,1)`, поворот ±45° | g:59-72 |
| reduced-motion | скролл- и hero-анимации в `@media (prefers-reduced-motion: no-preference)` | g:289, 303 |

## 7. Палитра (фактические литералы; RGB-триплеты для токен-фоллбеков)

| Цвет | RGB | Роль | Источник |
|---|---|---|---|
| #26311C | **38 49 28** | тёмное полотно №1: полоса объявления, футер, видео-бэнд, контролы героя; **заголовки секций и подписи коллекций на светлом**, бейдж «Скидка» (`--vanilla-announcement-bg`; scheme-1 theme.json) | g:20; H:53; F:45; Gal:54; Hero.astro:111; Col:20; CC:32; PC:43 |
| #3A4530 | **58 69 48** | тёмное полотно №2: шапка, solid-CTA, промо/care-бэнды, Newsletter, focus-рамки форм (`--vanilla-header-bg`; scheme-2) | g:22; H:58; Hero.astro:100; Gal:25, 83; FN:5; about:87 |
| #1B2D15 | 27 45 21 | основной зелёный `--vanilla-green`: кнопка профиля бургера, активная ссылка бургера | g:16; H:240, 257 |
| #14250F | 20 37 15 | фон hero-полотна под фото (`--vanilla-green-deep`) | g:17; Hero.astro:40 |
| #2D4227 | 45 66 39 | `--vanilla-green-soft` (`--color-accent`), в секциях напрямую не встречается | g:18, 12 |
| #EEEEEE | **238 238 238** | фон страницы и светлых секций (`--vanilla-surface`; scheme-3) | g:27, 77, 85; Col:13; Pop:14; Cat:80 |
| #ECEBE7 | **236 235 231** | плейсхолдер медиа (`--vanilla-card`) | g:29; PC:29; CC:20; Gal:60, 111 |
| #F0F0F0 | 240 240 240 | текст/подзаголовки на тёмных полотнах (`--vanilla-hero-subtle`) | g:26; Hero.astro:94; Gal:39; FN:21 |
| #F7F6F1 | 247 246 241 | `--vanilla-cream` — зарезервирован, в секциях не встречается | g:28 |
| #444444 | **68 68 68** | подзаголовки секций, старая цена, label форм | Col:24; PC:75; about:82 |
| #0A0A0A | 10 10 10 | body-текст (`--vanilla-dark`) | g:32, 84 |
| #000000 | 0 0 0 | подписи карточек, заголовок каталога, нижняя полоса футера | PC:66; Cat:99; F:127 |
| #FFFFFF | 255 255 255 | текст/контуры/логотип на тёмном; бейдж корзины | H:53; FN:29; F:42 |
| #777777 | 119 119 119 | `--vanilla-muted`: неактивные ссылки бургера | g:30; H:257 |
| #D9D9D2 | 217 217 210 | `--vanilla-line`: рамка поиска бургера | g:31; H:222 |
| #999999 | 153 153 153 | placeholder поиска (клон rose); фоллбек радио-кружков | H:199; fc:18 |
| #E5E5E5 | 229 229 229 | рамка строки поиска (клон rose) | H:191 |

Паттерн токенов канон-секций (прецедент уже в самой теме — fc:14-34): светлые секции
`rgb(var(--color-bg,238_238_238))`, `rgb(var(--color-heading,38_49_28))`,
`rgb(var(--color-muted,68_68_68))`, `rgb(var(--color-surface,236_235_231))` (медиа),
`rgb(var(--color-button-bg,58_69_48))` / `rgb(var(--color-button-text,255_255_255))`;
тёмные полотна — фоллбеки родного полотна: bg `58_69_48` (промо/care/Newsletter) или
`38_49_28` (видео/полоса/футер), heading `255_255_255`, text `240_240_240`,
кнопка-контур/белая кнопка — `rgb(var(--color-button-2-bg,255_255_255))` +
`rgb(var(--color-button-2-text,58_69_48))`. Радиусы: кнопки/медиа можно вести через
`rounded-[var(--radius-button,0px)]` / `var(--radius-media,0px)` (литерал 0 = theme.json);
служебные 4px-поля оставлять литералом (см. §5). Соответствие схем theme.json:
scheme-1 = #26311C, scheme-2 = #3A4530, scheme-3 = #EEEEEE, scheme-4 = white.

## 8. Хром страницы

| Роль | Значения | Источник |
|---|---|---|
| Порядок | Header (полоса + шапка в `[data-vanilla-header]`) → main → FooterNewsletter (только при `showNewsletter`) → Footer → LoginDrawer; корзина — страница `/cart`, drawer-а в Layout нет | L:26-33 |
| Sticky | шапка **НЕ sticky** (✓ grep); бургер-панель `fixed`, top через JS = высота полосы+шапки | H:58, 215, 281-285 |
| Полоса объявления | ссылка-полоса `h-11 md:h-12 bg-[#26311C]` центр, Arsenal 14/16 uppercase white, текст «Бесплатная доставка на весь ассортимент», вся полоса — `<a href="/catalog/textile">`; маркер `[data-vanilla-announcement]` | H:50-56 |
| Шапка mobile | строка `h-14 px-4`: бургер `size-9` / лого по центру (h-6, max-w 76px) / поиск+корзина+аккаунт `size-6 gap-3` | H:59-111 |
| Шапка desktop | один ряд `h-20` в `.vanilla-pad max-w-[1560px]` (`min-[1920px]` → 1920/300px): навигация слева `gap-[40px]`, **лого по центру абсолютом**, иконки справа `gap-5` (иконки `size-5`, белые через `brightness-0 invert`) | H:113-175 |
| Бейдж корзины | белый кружок `h-4 min-w-[16px]` (desktop `h-5 min-w-[20px]`) Manrope 10, текст тёмный, скрыт при `data-empty` | H:94-99, 160-164 |
| Поиск | выезжающая панель под шапкой (`max-height` transition 300ms), форма 1320×48 `rounded-[4px] border-[#E5E5E5]` + зелёная кнопка «Найти» | H:178-209 |
| Бургер | fixed-панель на `--vanilla-surface`: строка поиска + зелёная квадратная кнопка профиля `size-10`; навигация колонкой `gap-5` + «Корзина», «Регистрация» | H:213-269 |
| Футер, полотно | `bg-[#26311C] py-12 md:py-16`, контейнер 1320: грид `md:grid-cols-[1fr_auto]` — слева лого + 3 ссылки `gap-2`; справа телефон/email `gap-1`, 5 соцсетей `size-5 gap-3`, 3 платёжки `gap-2`, прижато вниз `md:mt-auto md:items-end` | F:44-104 |
| Футер, копирайт-ряд | в том же полотне: `md:flex-row justify-between` — копирайт слева, 4 правовых пункта `gap-x-9` справа (это `<span>`, не ссылки) | F:106-122 |
| Футер, полоса Powered by | отдельная чёрная полоса `bg-black min-h-16`, Arsenal 14/16 центр, «© 2026 Vanilla Theme Все права защищены. Powered by Merfy» | F:126-133 |
| Newsletter (отдельная секция) | `bg-[#3A4530] py-16 lg:py-[120px]`, контейнер 1280/1320 `items-start text-left gap-10`: заголовок Bitter 20 italic white + текст Arsenal 14/16 italic #F0F0F0 → форма `max-w-[652px]` (бордер-рамка + белая кнопка) → статус | FN:4-52 |
| Сшивка | у `[data-vanilla-footer]` чёрный `::after` -3px; у `[data-vanilla-newsletter]` `::after` 2px цвета футера — щели между полосами закрыты | g:166-203 |

## 9. Лестницы размеров для канон-секций

Правило (как у rose/bloom): дефолт/canon-default = литерал верстальщика байт-в-байт;
medium ≈0.85×, small ≈0.7× от базы-литерала (или large ≈1.2× при базе medium),
округление до целых px.

| Роль (база-литерал) | small | medium | large | База |
|---|---|---|---|---|
| Заголовок секции 20 (canon-default `medium`) | 17 | **20 = литерал** | 24 | Col:20 |
| Подзаголовок секции 16 (canon-default `small`) | **16 = литерал** | 19 | 23 | Col:24 (ряд rose/bloom) |
| Hero h1 24 (canon-носитель `large` — blockDefaults Hero.size) | 17 | 20 | **24 = литерал** | Hero.astro:88 |
| Hero текст 16 (дефолт = large) | 11 | 14 | **16 = литерал** | Hero.astro:94 |
| Заголовок узкого полотна 16 (Gallery/MainText-промо) | 14 | **16 = литерал** | 20 | Gal:34 |
| Body / текст рядов 16 (canon-default `medium`) | 14 | **16 = литерал** | 19 | about:38; PC:71 |
| Текст полотна 14/1920:16 | 10/11 | 12/14 | **14/16 = литерал** | Gal:39 |
| Заголовок ContactForm 20 (about «Свяжитесь с нами», Arsenal uppercase) | 14 | 17 | **20 = литерал** | about:71 |

## 10. Карта канон-секций (решения аналитика)

17 позиций `themes/vanilla/sections.map.json` (паритет bloom):

| Канон | Файл | Источник |
|---|---|---|
| Header | `src/components/Header.astro` | оживить (полоса объявления — только в статик-режиме без `id`; в каноне полоса = секция PromoBanner) |
| Footer | `src/components/Footer.astro` | оживить. Нюанс: у верстальщика подписка НЕ в футере (отдельная FooterNewsletter через Layout `showNewsletter`) → канон `newsletter.enabled`: отсутствие = БЕЗ блока (пиксель), явный true = копия блока подписки над полотном |
| PromoBanner | `src/components/sections/PromoBanner.astro` | новый: тело = полоса H:50-56 (вся полоса — ссылка); хвост-ссылка с подчёркиванием — только при заданном `link.text` (паттерн bloom) |
| Hero | `src/components/sections/Hero.astro` | оживить: **карусель** (canon `mode='carousel'` из blockDefaults; слайды-схема Hero.puckConfig добавлена для vanilla — «084 vanilla pilot»); дефолт = 3 слайда verbatim; параметры скрипту — только data-атрибуты |
| Collections | `src/components/sections/Collections.astro` | оживить: дефолт-ветка = 2 плитки verbatim; проп-ветка `collections[]` = плитки 1:1 + гидрация `data-collection-ref`/`data-own-image` |
| PopularProducts | `src/components/sections/Popular.astro` | оживить (полная T13-схема bloom Popular; гидрация `hydrateGrid` уже есть — расширить data-cards/collection/next-photo/qa-text/btn-style) |
| Gallery | `src/components/sections/Gallery.astro` | оживить: дефолт = три полотна verbatim; проп-ветка `items[]` ≤3 = плитки в манере §4 + гидрация `data-gallery-product`/`-collection` |
| MainText | `src/components/sections/MainText.astro` | адаптировать welcome-полотно about:138-166 (копия тела; страница не меняется) |
| ImageWithText | `src/components/sections/ImageWithText.astro` | адаптировать care-бэнд Gal:82-123 (копия тела; Gallery.astro не трогать) |
| MultiColumns | `src/components/sections/MultiColumns.astro` | с нуля в манере (карточек-фич у верстальщика нет; светлая секция §2 + плоские колонки §4) |
| MultiRows | `src/components/sections/MultiRows.astro` | с нуля (паттерн care-бэнда: текст-колонка + медиа 652/366, чередование) |
| CollapsibleSection | `src/components/sections/CollapsibleSection.astro` | с нуля (details/summary; разделители `--vanilla-line`) |
| Newsletter | `src/components/sections/Newsletter.astro` | новый: копия `footer/FooterNewsletter.astro` (оригинал не трогать — его использует Layout) |
| Slideshow | `src/components/sections/Slideshow.astro` | с нуля: композиция Hero-карусели (viewport + контролы-бар, переиспользовать `vanillaHeroCarousel.ts` через data-атрибуты) |
| Publications | `src/components/sections/Publications.astro` | с нуля (эталон bloom Publications; карточки-болванки в манере §4, `publicationType` на гриде) |
| Video | `src/components/sections/Video.astro` | адаптировать видео-бэнд Gal:52-79 (копия тела; Gallery.astro не трогать) |
| ContactForm | `src/components/sections/ContactForm.astro` | новый: разметка формы about:64-136 (родная Arsenal-манера). ⚠️ НЕ `pages/contacts.astro` — это клон rose (Manrope/`.vanilla-button`); обе страницы остаются inline |

Гидрация данных платформы: `src/lib/storefront-hydrate.ts` уже портирован и богаче
bloom (✓ те же экспорты loadRealProducts/loadRealCollections/findCollection/
filterByCollection/formatPrice/productHref/productImage/escapeHtml/renderCardHtml/
hydrateGrid + updateCount/deriveVariantGroups); `renderCardHtml` рисует карточку в манере
vanilla (storefront-hydrate.ts:233-254). Каталог уже несёт фильтр коллекций
(`data-nt="catalog-collections-filter"`, `?collection=` из ссылок плиток — Cat:312-471):
ссылки плиток Collections/Gallery вести на `/catalog?collection=<id|slug>`
(редирект-страница каталога сохраняет query — pages/catalog/index.astro).

Нюанс Hero: blockDefaults задают `autoplay: true, interval: 5`, но скрипт верстальщика
таймера НЕ имеет (только стрелки/цифры/swipe) — autoplay реализовать в канон-скрипте
по data-атрибутам; дефолт-ветка без пропсов = без таймера (поведение верстальщика).

## 11. Тон контента

Домашний текстиль и декор, язык тепла и уюта: «Искусство жить уютно», «Дом, в который
хочется возвращаться», «Тепло вашего дома начинается здесь», «Коллекции, которые
становятся любимыми», «Ваш дом — наша забота», «Будьте в курсе уютных новостей».
CTA — императив капсом: «К ПОКУПКАМ», «СМОТРЕТЬ БОЛЬШЕ», «ПЕРЕЙТИ К КОЛЛЕКЦИИ»,
«НОВАЯ КОЛЛЕКЦИЯ», «ОТПРАВИТЬ». Бренд в вордмарке — «Vanila» (одна l), SITE_TITLE —
'Vanilla' (consts.ts:4). Категории: Текстиль / Декор / История (H:27-42). Товары —
подушки, пледы, вазы, постельное бельё, кашпо; demo-цены вида «1 940₽» (без пробела
перед ₽, products.ts:19), реальные товары через formatPrice → «2 800 ₽» (с пробелом).
Тексты-болванки новых секций писать в этом тоне (мягко, «вы», природные оттенки,
скандинавский уют — см. about.astro).
