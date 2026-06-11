# Манера bloom — стайлгайд верстальщика

Извлечено из фактической вёрстки `themes/bloom/src` (не из Figma и не из theme-base).
Назначение: исходник для оживления канон-секций и досоздания новых в манере bloom
(Фаза B пилота конструктора v2, эталон процесса — `themes/rose/MANNER.md`).
Каждое значение — с пруфом `файл:строка`.

Пути сокращены: `g` = `src/styles/global.css`, `H` = `src/components/Header.astro`,
`F` = `src/components/Footer.astro`, `PC` = `src/components/products/BloomProductCard.astro`,
`DS` = `@merfy-dropshipping-platform/design-systems-theme/src/components/ui`.

⚠️ **Наследие клона rose — НЕ манера bloom.** Тема выросла из шаблона rose, поэтому в коде
остались чужие роли: `font-comfortaa` (класс в bloom НЕ определён — g задаёт только
urbanist/inter/manrope/roboto-flex, g:24-38 — рендерится системным sans), Manrope-подписи
(`BloomCollectionCard.astro:33`, `SectionHeader.astro:11-15` — оба компонента страницами
не используются, ✓ проверено grep), Comfortaa-заголовки страниц (`pages/contacts.astro:15`,
`catalog/BloomCategoryPage.astro:45`), чёрные кнопки каталога (`BloomCategoryPage` «Смотреть
ещё»). Родная манера bloom = **Urbanist + Inter + розовый #E38E9F**; клон-роли в новые
канон-секции не переносить (кроме дефолт-веток verbatim-оживления, см. §9).

## 1. Шрифтовые роли

| Роль | Классы / значения | Источник |
|---|---|---|
| Заголовок секции | Urbanist 400, **18px → md:20px**, uppercase, leading-none, **#E38E9F** | Collections.astro:18; Gallery.astro:26 |
| Hero h1 | та же роль: `font-urbanist text-[18px] font-normal uppercase leading-none text-[#e38e9f] md:text-[20px]` | Hero.astro:42 |
| Hero подзаголовок | Inter **300 (font-light)**, 14 → md:16px, leading-[1.2], #E38E9F | Hero.astro:46 |
| Манифест-полотно (Philosophy) | Urbanist 400, **24px**, uppercase, leading-none, белый на розовом | Philosophy.astro:19 |
| Заголовок карточки-фичи | Urbanist **300**, 20px, uppercase, leading-none, #000 | Benefits.astro:53 |
| Текст карточки-фичи | Inter 300, 16px, leading-none, #999999 | Benefits.astro:56 |
| Заголовок рассылки (подвал) | Urbanist 300, 20px, uppercase, leading-normal, #000 | F:44 |
| Body / подписи карточек | Inter 300, 16px, leading-none/normal, #000; mobile **12px** | PC:65,70; PC:105-113 |
| Шапка секции Popular | DS `NtSectionHeading` без варианта: h2 «font-comfortaa» (→ системный sans) 20 → md:24 → lg:32px uppercase #000 центр; p Manrope 14 → md:18 → xl:24 #999999 | Popular.astro:20; DS/NtSectionHeading.astro:13-22 |
| Ссылка навигации (desktop) | Inter 300, 16px, #000, hover:opacity-70; активная `underline decoration-[#E38E9F] underline-offset-4` | H:168-169 |
| Ссылка навигации (бургер) | Inter 300, 14px; активная #000 + полоска `h-px w-[54px] bg-[#e38e9f]`, неактивная #999999 | H:243-249 |
| Полоса объявления | Inter 400, 12px, uppercase, белый | H:44 |
| Логотип | картинка `/icons/Bloom.svg` 65×19 (`h-[19px]`), не текст | H:68-74, 124-130 |
| Ссылки/адрес подвала | Inter 300, 14px (#999999 контакты, #000 навигация, правовые underline) | F:99, 147, 161-171 |
| Подключённые семейства | Manrope, Urbanist, Inter, Roboto Flex (Google Fonts); body-дефолт = системный стек | g:1-4, 13-14, 59-65 |

Итого ролей два: **заголовки = Urbanist uppercase** (400 в секциях, 300 в карточках/подвале),
**всё остальное = Inter 300 (font-light)**. Акцентные заголовки на белом — розовые #E38E9F,
на розовом полотне — белые, в карточках — чёрные.

## 2. Сетка секций

| Роль | Классы / значения | Источник |
|---|---|---|
| Горизонтальные поля секции (лестница, везде одна) | `px-4 md:px-20 2xl:px-[300px]` | Collections.astro:11; Popular.astro:15; Gallery.astro:19; Philosophy.astro:12; Benefits.astro:32; Hero.astro:36 (оверлей); F:34; H:107 (desktop: `px-20 2xl:px-[300px]`) |
| Вертикальные отступы контент-секций | `pt-20 pb-20 → md:pt-[120px] md:pb-[120px]` (**80/120**) | Collections.astro:11; Popular.astro:15; Gallery.astro:19; Philosophy.astro:12; Benefits.astro:32 |
| Вертикальные отступы каталога | `pt-10 pb-[80px] md:pt-16 md:pb-[120px]` | BloomCategoryPage.astro:32 |
| Вертикальные отступы подвала | `pt-16 pb-24 md:pb-28` | F:34 |
| Внешняя обёртка | `max-w-[1920px] mx-auto` (шапка desktop, подвал) | H:107; F:34 |
| Контентный контейнер | `mx-auto w-full max-w-[1320px]` | Collections.astro:14; Popular.astro:18; Gallery.astro:22; F:35; H:108 |
| Зазор «шапка секции → контент» | `gap-10` (40px) | Collections.astro:14; Popular.astro:18; Gallery.astro:22; Philosophy.astro:15 |
| Грид товаров (Collections-секция) | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `gap-10 lg:gap-x-[16px] lg:gap-y-10` | Collections.astro:24 |
| Грид товаров (Popular) | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4` | Popular.astro:23 |
| Грид каталога | `grid-cols-1 sm:2 lg:3`, `gap-x-4 gap-y-10` | BloomCategoryPage; collections/preview.astro:104 |
| Грид карточек-фич | `grid-cols-1 md:2 xl:3 gap-10 justify-items-center`, карточка `max-w-[429px]` | Benefits.astro:35, 40 |
| Галерея | `grid-cols-1 lg:grid-cols-2 gap-4`; левая плитка `aspect-square`, правая `aspect-[652/594]` | Gallery.astro:31, 32, 49 |
| Hero-полотно | full-bleed, `min-h-[560px]`, лестница аспектов `aspect-[375/812] → sm:[768/968] → md:[1280/968] → xl:[1920/925]`; контент в **левом нижнем углу** (`items-start justify-end`), блок `max-w-[330px]`, `pb-8 md:pb-12 xl:pb-20` | Hero.astro:26, 36-38 |
| Брейкпоинты | стандартные Tailwind (sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536) | (классы выше) |

## 3. Кнопки

| Роль | Классы / значения | Источник |
|---|---|---|
| CTA (главная манера) | розовый pill: `h-12 rounded-full bg-[#e38e9f] px-4` (px-6 у Philosophy), Inter 16 **300**, белый текст, `hover:opacity-90 active:scale-95` | Hero.astro:52; PC:89 |
| CTA на розовом полотне | белый pill: `h-12 rounded-full bg-white px-6` Inter 16 300 чёрный текст | Philosophy.astro:26 |
| Кнопка карточки товара | pill во всю ширину карточки `h-12 w-full rounded-full bg-[#e38e9f]` «В корзину», `[data-add-to-cart]` | PC:79-92 |
| Disabled | `bg-[#fdf4f6] text-[#e38e9f]/60 cursor-not-allowed` («Нет в наличии») | PC:93-101 |
| Кнопка рассылки | вложенный pill `h-8 rounded-full bg-[#FDF4F6] px-4` Inter 12 300 **#E38E9F** | F:66-71 |
| Кнопка поиска «Найти» | `h-10 rounded-[4px] bg-[#e38e9f] px-3 py-2.5` Inter 14, белый (служебное исключение — 4px) | H:196-201 |
| Манера | только сплошные заливки-pill (радиус **100px**, `--radius-button: 100px` в theme.json); розовое на белом / белое на розовом; hover — opacity 0.9, нажатие — фирменный `active:scale-95` | Hero.astro:52; Philosophy.astro:26; packages/theme-bloom/theme.json defaults |

## 4. Карточки и медиа

| Роль | Классы / значения | Источник |
|---|---|---|
| Карточка товара | колонка `gap-4`, без рамки; медиа `aspect-square rounded-[12px] bg-[#F5F5F5]`, hover `scale-105 duration-300`; встроенная pill-CTA «В корзину» | PC:24-39, 79-92 |
| Бейдж «Скидка» | `left-2 top-2 h-6 rounded-[16px] bg-[#e38e9f] px-1.5` Inter 12 белый | PC:41-47 |
| Свотчи цветов | точки `size-2 rounded-full` в белом pill `bg-white/90 p-1`, правый низ медиа | PC:48-60 |
| Подписи товара | имя и цена Inter 16 300 #000 `leading-none` (mobile 12); старая цена #999999 line-through; зазор `gap-2`, выравнивание left | PC:62-78, 105-113 |
| Карточка-фича (Benefits) | белая подложка на розовом: `min-h-[252px] rounded-[12px] bg-white px-6 py-8 text-center gap-6`, иконка 44×44, hover `-translate-y-1 duration-300` | Benefits.astro:39-52 |
| Плитки галереи | `rounded-[12px] bg-[#f5f5f5]`, аспекты `square` и `652/594`, hover `scale-[1.03]`/`scale-[1.05]` duration-500 | Gallery.astro:32-40, 49-57 |
| Подписи галереи | Inter 16 300 #000 leading-normal (имя — `hover:opacity-70`) | Gallery.astro:61-68 |
| Точки пагинации | `h-2 w-2 rounded-full`, активная `bg-black`, неактивная `bg-[#d9d9d9]`, ряд `justify-end gap-2` | Gallery.astro:70-83 |
| Манера | медиа всегда скруглены **12px** (`--radius-media: 12px`), плейсхолдер #F5F5F5, ховер — мягкий zoom; на цветном фоне карточки получают белую подложку 12px; голых рамок нет | PC:31; Gallery.astro:32; Benefits.astro:40 |

## 5. Поля ввода

| Роль | Классы / значения | Источник |
|---|---|---|
| Поле рассылки | pill-контейнер `h-10 rounded-full border-[#FFD4E5] pl-4 pr-1`, focus-within `border-[#E38E9F]`; placeholder **#FFD4E5**; Inter 14 300 | F:54-65 |
| Строка поиска (desktop) | `h-12 rounded-[4px] border-[#e38e9f]` + тень `shadow-[0_8px_24px_rgba(0,0,0,0.08)]`, Inter 16 300, placeholder #999999 | H:188-195 |
| Поиск бургера | `h-10 rounded-[4px] border-[#999999]` Inter 12 | H:215-221 |
| Форма контактов | DS `NtTextField` + textarea `min-h-[232px] rounded-[4px] border-[#000000] p-4` (клон rose) | pages/contacts.astro:50-70 |
| Манера | формы-CTA — pill в розовой гамме; служебные поля — радиус 4px (`--radius-input: 4px`) | F:55; H:188 |

## 6. Анимации

Система идентична rose (скопирована верстальщиком вместе с шаблоном):

| Роль | Значения | Источник |
|---|---|---|
| Появление по скроллу | `[data-animate]`: `opacity:0; translateY(18px)` → `.is-visible` → `fadeInUp 0.65s cubic-bezier(0.4,0,0.2,1)`; вариант `slide-down` | g:148-161 |
| Триггер | IntersectionObserver `threshold 0.08, rootMargin -36px`, одноразовый; задержка `data-animate-delay`; реинициализация на `astro:after-swap` | Layout.astro:38-63 |
| Загрузка героя | `.hero-animate-1/2/3` — каскад 0.7s с задержками 0.05/0.15/0.28s | g:163-173 |
| Смена страниц | Astro ViewTransitions, `fadeIn 0.25s` | g:176-182; Layout.astro:23 |
| Ховеры | картинки `scale(1.03–1.08)` 300–500ms; кнопки/ссылки `opacity 0.7–0.9`; фирменное нажатие `active:scale-95` | PC:39; Gallery.astro:39; Hero.astro:52 |
| Бургер-иконка | линии `transition 0.3s cubic-bezier(0.4,0,0.2,1)`, поворот ±45° | g:40-53 |
| reduced-motion | вся скролл-анимация в `@media (prefers-reduced-motion: no-preference)` | g:148 |

## 7. Палитра (фактические литералы; RGB-триплеты для токен-фоллбеков)

| Цвет | RGB | Роль | Источник |
|---|---|---|---|
| #E38E9F | **227 142 159** | главный акцент: заголовки секций на белом, pill-кнопки, бейджи, полоса объявления, фон секций-полотен, активная навигация, бейдж корзины, focus-рамки | Hero.astro:42,52; Philosophy.astro:12; Benefits.astro:32; H:43,97,169; PC:43,89 |
| #CF7A8B | 207 122 139 | тёмный акцент (`--color-accent-dark`; scheme-1 theme.json) | g:19 |
| #F7A2B3 | 247 162 179 | светло-розовый (свотч light-pink) | g:20; PC:15 |
| #FFB5AF | 255 181 175 | светло-розовый фон (`--color-light-pink-bg`) | g:21 |
| #FFD4E5 | 255 212 229 | розовая рамка и placeholder рассылки | F:55,64 |
| #FDF4F6 | 253 244 246 | розовая поверхность (кнопка рассылки, disabled-кнопка) | F:68; PC:97 |
| #000000 | 0 0 0 | текст, подписи карточек, навигация, активные точки | g:63; H:168; Gallery.astro:79 |
| #FFFFFF | 255 255 255 | фон страницы; текст и карточки на розовом | g:62; Philosophy.astro:19; Benefits.astro:40 |
| #999999 | 153 153 153 | вторичный текст (подзаголовки, адрес, описания фич) | F:48; Benefits.astro:56 |
| #F5F5F5 | 245 245 245 | плейсхолдер медиа, рамка низа шапки, рамки фильтров | PC:31; H:49 |
| #D9D9D9 | 217 217 217 | неактивные точки пагинации | Gallery.astro:79 |
| #4AD300 | 74 211 0 | успех форм (статусы) | pages/contacts.astro:85 |

Паттерн токенов канон-секций (как в rose): `rgb(var(--color-heading,227_142_159))`,
`rgb(var(--color-bg,255_255_255))`, `rgb(var(--color-button-bg,227_142_159))`,
`rgb(var(--color-button-text,255_255_255))`, `rgb(var(--color-button-2-bg,255_255_255))`,
`rgb(var(--color-button-2-text,0_0_0))`, `rgb(var(--color-muted,153_153_153))`,
`rgb(var(--color-surface,245_245_245))`, `rounded-[var(--radius-media,12px)]`,
`rounded-[var(--radius-button,100px)]`, `rounded-[var(--radius-input,4px)]`.
Фоллбек = родной литерал верстальщика из таблицы выше (для адаптаций Philosophy/Benefits
фоллбек `--color-bg` = `227_142_159`).

## 8. Хром страницы

| Роль | Значения | Источник |
|---|---|---|
| Порядок | Header (со встроенной полосой объявления) → main → Footer → NtCartDrawer (`rootId bloom-cart-drawer-root`, `eventPrefix bloom:cart`) → BloomCartAddedModal | Layout.astro:25-32 |
| Sticky | весь блок `[data-bloom-header]` (полоса + шапка) `sticky top-0 z-50` | H:42 |
| Полоса объявления | `bg-[#E38E9F] py-2` центр, Inter 12 uppercase белый, текст «Акция на новую коллекцию. Узнать больше»; встроена в Header (`[data-bloom-announcement]`). Отдельный компонент `header/PromoBanner.astro` (text+link+подчёркнутый linkText) существует, но страницами НЕ используется (✓ grep) | H:43-47; header/PromoBanner.astro:11-19 |
| Шапка mobile | строка `h-16 px-4`: бургер 32px / лого по центру / поиск+корзина+аккаунт (`size-8`, иконки `size-5`) | H:51-104 |
| Шапка desktop | два ряда в `max-w-[1920px] px-20 py-6 2xl:px-[300px]` → контейнер 1320: ряд 1 — грид `[1fr_auto_1fr]`: поиск слева, **лого по центру**, корзина+аккаунт справа (gap-4); ряд 2 — навигация по центру `gap-8 lg:gap-10` | H:107-177 |
| Низ шапки | `border-b border-[#F5F5F5]` на белом | H:49 |
| Поиск | выпадающая панель под шапкой, transition `max-height` 300ms; форма `rounded-[4px] border-[#e38e9f]` + тень | H:180-204 |
| Бейдж корзины | `h-4 min-w-[16px] rounded-full bg-[#e38e9f]` Inter 10 белый, скрыт при `data-empty` | H:94-98, 141-145 |
| Бургер | fixed-панель под шапкой: строка поиска + розовая круглая кнопка профиля `size-10 rounded-full bg-[#e38e9f]`; навигация колонкой `gap-5` | H:207-256 |
| Футер, блок 1 | рассылка: слева заголовок Urbanist 20 + подзаголовок Inter 16 #999; справа pill-форма `max-w-[318px]` | F:36-79 |
| Футер, блок 2 | лого + адрес + контакты (Inter 14 300 #999) + 5 соцсетей (VK, YouTube, Яндекс Дзен, TikTok, Telegram); навигационная колонка справа `lg:ml-auto gap-3` | F:81-153 |
| Футер, блок 3 | разделитель `h-px bg-[#E38E9F]/50`; копирайт #999 слева + правовые ссылки underline справа | F:156-176 |
| Футер, блок 4 | розовая полоса `bg-[#E38E9F] py-5`, Inter 14 300 белый центр, «© … Powered by Merfy» | F:180-185 |

## 9. Лестницы размеров для канон-секций

Правило rose: дефолт/canon-default = литерал верстальщика байт-в-байт; medium ≈0.85×,
small ≈0.7× (или large ≈1.2× при базе medium), округление до целых px.

| Роль (база-литерал) | small | medium | large | База |
|---|---|---|---|---|
| Заголовок секции 18/md:20 (canon-default `medium`) | 15/17 | **18/20 = литерал** | 22/24 | Collections.astro:18 |
| Hero h1 18/md:20 (canon-default `large`, blockDefaults Hero.size) | 13/14 | 15/17 | **18/20 = литерал** | Hero.astro:42 |
| Hero текст 14/md:16 (дефолт) | 10/11 | 12/14 | **14/16 = литерал** | Hero.astro:46 |
| Body-текст 16 (canon-default `medium`) | 14 | **16 = литерал** | 19 | PC:65 |
| Манифест 24 (MainText из Philosophy) | 17 | 20 | **24 = литерал** | Philosophy.astro:19 |
| Шапка Popular (DS, lg-база 32) — canon-default `small` | **литерал DS 20/24/32** | 38 (перекрытие `[&_h2]:!text-[38px]`) | 46 | DS/NtSectionHeading.astro:14; прецедент rose Popular |

## 10. Карта канон-секций (решения аналитика)

17 позиций `themes/bloom/sections.map.json` (паритет цели rose + Publications/Video;
в карте rose сейчас 15 позиций — Publications/Video у rose эталона не имеют):

| Канон | Файл | Источник |
|---|---|---|
| Header | `src/components/Header.astro` | оживить (полосу объявления показывать только в статик-режиме без `id` — в каноне полоса = секция PromoBanner) |
| Footer | `src/components/Footer.astro` | оживить |
| PromoBanner | `src/components/sections/PromoBanner.astro` | новый: тело = инлайн-полоса H:43-47; подчёркнутый хвост-ссылка из `header/PromoBanner.astro` — только при заданном `link` |
| Hero | `src/components/sections/Hero.astro` | оживить |
| Collections | `src/components/sections/Collections.astro` | оживить: дефолт-ветка = товарный грид «Сейчас в тренде» verbatim; проп-ветка `collections[]` = квадратные плитки 12px (манера §4) + гидрация `data-collection-ref` |
| PopularProducts | `src/components/sections/Popular.astro` | оживить (полная T13-схема rose Popular + гидрация) |
| Gallery | `src/components/sections/Gallery.astro` | оживить (items[] ≤3 + гидрация data-gallery-product/-collection) |
| MainText | `src/components/sections/MainText.astro` | адаптировать Philosophy.astro (копия тела; оригинал не трогать — его используют страницы) |
| ImageWithText | `src/components/sections/ImageWithText.astro` | с нуля в манере (медиа-паттерны Gallery) |
| MultiColumns | `src/components/sections/MultiColumns.astro` | адаптировать Benefits.astro (копия тела; оригинал не трогать) |
| MultiRows | `src/components/sections/MultiRows.astro` | с нуля (паттерн ImageWithText, чередование) |
| CollapsibleSection | `src/components/sections/CollapsibleSection.astro` | с нуля (details/summary как rose T16) |
| Newsletter | `src/components/sections/Newsletter.astro` | с нуля: копия блока подписки подвала F:36-79 (подвал не трогать) |
| Slideshow | `src/components/sections/Slideshow.astro` | с нуля (полотно Hero bloom + слайды, rose T17) |
| Publications | `src/components/sections/Publications.astro` | с нуля (rose-эталона нет; сетка карточек в манере §4) |
| Video | `src/components/sections/Video.astro` | с нуля (rose-эталона нет; контейнер 1320 + `rounded-[12px]`) |
| ContactForm | `src/components/sections/ContactForm.astro` | новый: разметка `pages/contacts.astro` с заменой мёртвого `font-comfortaa` на Urbanist-роль (страница остаётся inline и не меняется) |

`Puk.astro` — тестовый мусор верстальщика, в канон не включать. `pukItems.ts`,
`BloomCollectionCard`, `GalleryCollection/GalleryProductCard`, `SectionHeader` — legacy, страницами
не используются. Гидрация данных платформы: `src/lib/storefront-hydrate.ts` уже портирован
(✓ экспорты те же, что у rose: loadRealProducts/loadRealCollections/findCollection/
filterByCollection/formatPrice/productHref/productImage/escapeHtml/renderCardHtml/hydrateGrid);
`renderCardHtml` рисует карточку в манере bloom со встроенной pill-CTA (storefront-hydrate.ts:233-256).

## 11. Тон контента

Бьюти/косметика, язык ритуала и заботы о себе: «Искусство заботы о себе», «Начать ритуал»,
«Сейчас в тренде», «Главные хиты», «ПОДПИШИТЕСЬ НА РАССЫЛКУ». Категории: Уход за кожей /
Уход за волосами / Косметика (data/categories.ts:12-37, дефолтная ссылка CTA —
`DEFAULT_CATEGORY_HREF = /skin-care`); коллекции HYDRO / DAILY / LIFT (data/collections.ts);
товары — кремы, маски, флюиды с ценами вида «3 990 ₽» (data/products.ts). Тексты-болванки
новых секций писать в этом тоне (мягко, на «вы» в подвале, императив ритуала в CTA).
