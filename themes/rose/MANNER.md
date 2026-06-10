# Манера rose — стайлгайд верстальщика

Извлечено из фактической вёрстки `themes/rose/src` (а не из Figma и не из theme-base).
Назначение: исходник для досоздания новых секций в манере rose и для сверки дефолт-схем
`packages/theme-rose/theme.json`. Каждое значение — с пруфом `файл:строка`.

Пути сокращены: `g` = `src/styles/global.css`, `DS` = пакет
`@merfy-dropshipping-platform/design-systems-theme/src/components/ui`.

## 1. Шрифтовые роли

| Роль | Классы / значения | Источник |
|---|---|---|
| Заголовок секции `.rose-title` | Comfortaa 400, **20px**, line-height 1, uppercase, **#000000** | g:42-50 |
| `.rose-title` mobile (≤639px) | 14px | g:62-65 |
| Подзаголовок секции `.rose-subtitle` | Manrope 400, **16px**, line-height 1, **#999999** | g:52-59 |
| `.rose-subtitle` mobile | 12px | g:67-69 |
| То же в DS: `NtSectionHeading variant="rose"` | h2 Comfortaa uppercase #000 `!text-[20px] !leading-none`; p Manrope #999 `!text-[16px]`, `max-w-[780px]`, gap-2 | DS/NtSectionHeading.astro:19,27-30,39-41 |
| Body | Manrope, #000000, 16px, line-height 1.6 | g:421-432 |
| h1–h6 (нормализация) | Comfortaa, line-height 1.2 | g:522-530 |
| Hero h1 | `font-comfortaa !font-normal !leading-none uppercase text-white`, лестница **20 → sm:28 → md:36 → lg:40px** | Hero.astro:43 |
| Hero подзаголовок | `font-manrope leading-none text-white`, 14 → sm:16 → md:18 → lg:20px | Hero.astro:51 |
| Заголовок без uppercase `.rose-heading-plain` | метрики .rose-title, `text-transform: none` (блог и т.п.) | g:142-150 |
| Логотип (текстовый) | Comfortaa 400 uppercase leading-none; desktop **24px** / mobile 20px | Header.astro:76, 52 |
| Ссылка навигации (desktop) | Manrope 400, 14 → **lg:16px**, #000000, `pb-1`, hover:opacity-70; активная — подчёркивание `after:h-px after:bg-[#000000]` | Header.astro:89-90 |
| Ссылка навигации (бургер) | Manrope 12 → sm:14px; активная #000 + подчёркивание, неактивная #999 | Header.astro:212-215 |
| Подключённые семейства | Manrope (sans), Comfortaa, Inter, Montserrat Alternates, Roboto, Playfair Display | g:8-14 |

Итого ролей два: **заголовки = Comfortaa 400 uppercase**, **всё остальное = Manrope 400**.
Жирность всегда 400; единственное исключение — заголовок рассылки `!font-bold` (Footer.astro:50),
на mobile возвращается к 400 (Footer.astro:177-179).

## 2. Сетка секций

| Роль | Классы / значения | Источник |
|---|---|---|
| Горизонтальные поля секции (лестница, везде одна) | `px-4 sm:px-5 md:px-10 lg:px-16 xl:px-20 2xl:px-[280px]` | Collections.astro:16; Popular.astro:18; Gallery.astro:15; Contacts.astro:18; Footer.astro:44; Header.astro:73; Hero.astro:37 (оверлей) |
| Вертикальные отступы контент-секций | `pt-14 pb-14 → sm:16 → md:[100px] → lg:[120px] → xl:[140px]` (56/64/100/**120**/140) | Collections.astro:16; Popular.astro:18; Gallery.astro:15 |
| Вертикальные отступы Contacts | `pt-12 pb-[60px] → md:pt-20 md:pb-[80px]` | Contacts.astro:18 |
| Вертикальные отступы Footer | `pt-20 pb-20` (80px) | Footer.astro:44 |
| Внешняя обёртка страницы | `max-w-[1920px] mx-auto` (Header, Footer) | Header.astro:73; Footer.astro:44 |
| Контентный контейнер | `mx-auto w-full max-w-[1320px]` | Collections.astro:20; Popular.astro:22; Gallery.astro:19; Contacts.astro:22; Footer.astro:45 |
| Зазор «шапка секции → контент» | `gap-8 md:gap-10` | Collections.astro:20; Popular.astro:22; Gallery.astro:19 |
| Сетка товаров (Popular) | `grid-cols-2 → md:3 → xl:4`; колонки `gap-x-3 → sm/md:gap-x-4 (16px) → xl:gap-x-5 (20px)`; ряды `gap-y-8 → sm:9 → md:gap-y-10 (40px)` | Popular.astro:30 |
| Сетка коллекций | `grid-cols-1 → md:grid-cols-3`; `gap-6 → sm/md:gap-5 → lg:gap-6 (24px)` | Collections.astro:28 |
| Сетка галереи | `grid-cols-1 → lg:grid-cols-[minmax(0,1fr)_minmax(280px,429px)]`, `gap-6 md:gap-8 lg:gap-6 xl:gap-8` | Gallery.astro:27 |
| Hero-полотно | full-bleed, лестница аспектов `aspect-[10/15] → sm:[4/5] → md:[4/3] → lg:[16/9] → xl:[2/1] → 2xl:[21/9]`, `min-h-[min(70svh,560px)]` | Hero.astro:26 |
| Брейкпоинты | стандартные Tailwind: sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536 | (классы выше) |

## 3. Кнопки

| Роль | Классы / значения | Источник |
|---|---|---|
| CTA героя | белая заливка `!bg-white !text-[#000000] !border-0`, `h-10 min-w-[120px] rounded px-3 → sm:h-[52px] min-w-[160px] rounded-[6px] px-6`, Manrope 14 → sm:15 → md:16, `hover:opacity-90` | Hero.astro:63 |
| CTA формы (Contacts «Отправить») | чёрная заливка (`.rose-btn-primary`), `h-12 min-w-[200px] rounded-[6px] px-8`, Manrope 16 | Contacts.astro:84 |
| `.rose-btn-primary` (авторизация) | bg #000000, текст #FFFFFF, h 56px, radius 8px, Manrope 16/400, hover opacity 0.88 | g:118-139 |
| Кнопка поиска «Найти» | `h-10 rounded-[4px] !bg-[#000000] !text-white px-3 py-2.5`, Manrope 14, hover:opacity-90 | Header.astro:160 |
| Кнопка рассылки | прозрачная, `size-9`, глиф «→», `active:scale-95` | Footer.astro:71-77 |
| Иконочные кнопки шапки | `size-10`, иконка `size-6`, `hover:opacity-80` | Header.astro:103, 113, 125 |
| Манера | только сплошные заливки (solid), чёрное на белом / белое на фото; никаких outline-кнопок; радиус CTA **6px** (4px у служебного поиска, 8px у авторизации); hover — затухание opacity, не смена цвета | Hero.astro:63; Contacts.astro:84; g:118-139 |

## 4. Карточки

| Роль | Классы / значения | Источник |
|---|---|---|
| Карточка товара | колонка `gap-5`, без рамки и фона; медиа `aspect-[318/444] rounded-[8px]`; hover `scale-105 duration-300` | RoseProductCard.astro:16, 22, 32 |
| Подписи товара | имя Manrope 14 #000 (hover:opacity-70); цена Manrope **16**; старая цена 14 #999 line-through; всё `leading-none`, выравнивание **left**, зазор `gap-1` | RoseProductCard.astro:42-57 |
| Бейдж «Скидка» | `left-3 top-3 h-6 min-w-12 rounded-[4px] bg-[#000000] px-2` Manrope 12 white | RoseProductCard.astro:36 |
| Карточка коллекции | `gap-5`; медиа `aspect-[430/500] rounded-[8px] bg-[#F5F5F5]`; hover `scale-[1.08] duration-500`; имя Manrope 16 left | RoseCollectionCard.astro:16, 20, 28, 32 |
| Плитки галереи | `rounded-[8px] bg-[#F5F5F5]`, аспекты 429/444 и 429/309, hover `scale-[1.05]`/`scale-110` | Gallery.astro:31, 51, 81 |
| Подписи галереи | Manrope 16/400 leading-none #000 (mobile 12) | Gallery.astro:63-72, 152-158 |
| Манера | карточки «голые»: без бордера, без подложки-поверхности; скругление **8px только на медиа**; плейсхолдер медиа #F5F5F5; ховер — мягкий zoom картинки | RoseProductCard.astro:22; RoseCollectionCard.astro:20 |

## 5. Поля ввода

| Роль | Классы / значения | Источник |
|---|---|---|
| Поле формы (DS `NtTextField`) | `h-14 min-h-[56px] rounded-[4px]` bg #FFFFFF px-4 Manrope 16, placeholder #999999; рамки: muted #999999 / активная #000000 / ошибка **#FF9494** | DS/NtTextField.astro:35-40, 60 |
| Textarea (Contacts) | `min-h-[232px] rounded-[4px] border-[#000000] p-4` Manrope 16, placeholder #999 | Contacts.astro:77 |
| Поле рассылки | контейнер `h-14 max-w-[430px] rounded-[4px] border-[#999999]`, focus-within #000000 | Footer.astro:60 |
| Строка поиска | `h-12 max-w-[1320px] rounded-[4px] border-[#E5E5E5]` + тень `shadow-[0_8px_24px_rgba(0,0,0,0.08)]` | Header.astro:148 |
| Инпут авторизации `.rose-input` | h 56px, radius 8px, border #E5E5E5 → focus #000000 | g:86-107 |

## 6. Анимации

| Роль | Значения | Источник |
|---|---|---|
| Появление по скроллу | элементы с `data-animate`: старт `opacity:0; translateY(18px)` → класс `.is-visible` → `fadeInUp 0.65s cubic-bezier(0.4,0,0.2,1)`; вариант `data-animate="slide-down"` → `slideDownFade 0.55s` | g:482-494 |
| Кейфреймы | `fadeInUp` (g:435-444), `scaleIn` (g:446-455), `slideDownFade` (g:457-466), `fadeIn` (g:468-471) | g:435-471 |
| Триггер | IntersectionObserver `threshold 0.08, rootMargin "0px 0px -36px 0px"`, одноразовый (`unobserve`); задержка через `data-animate-delay`; реинициализация на `astro:after-swap` | Layout.astro:41-65 |
| Загрузка героя | `.hero-animate-1/2/3` — каскад slideDownFade/fadeInUp 0.7s с задержками 0.05/0.15/0.28s | g:497-507 |
| Смена страниц | Astro ViewTransitions, `fadeIn 0.25s` | g:510-515; Layout.astro:23 |
| Ховеры | картинки `scale(1.05–1.1)` 300–500ms; кнопки/ссылки `opacity 0.7–0.9` | RoseProductCard.astro:32; RoseCollectionCard.astro:28; Hero.astro:63; Header.astro:89 |
| Уважение reduced-motion | вся скролл-анимация внутри `@media (prefers-reduced-motion: no-preference)` | g:482, 497 |

## 7. Палитра (фактические литералы)

| Цвет | Роль | Источник |
|---|---|---|
| #000000 | текст, заголовки, primary-кнопки, бейджи, копирайт-полоса | g:15, 49, 429; Header.astro:160; Footer.astro:154 |
| #FFFFFF | фон страницы и секций, текст на чёрном | g:17; Layout.astro:26; Hero.astro:21 |
| #999999 | вторичный текст, muted-рамки, неактивные ссылки | g:16, 58; Footer.astro:60, 96 |
| #F5F5F5 | плейсхолдер медиа / поверхность | RoseCollectionCard.astro:20; Gallery.astro:31 |
| #E5E5E5 | лёгкие рамки (поиск, авторизация) | Header.astro:148; g:90 |
| #FF9494 | ошибка валидации поля | DS/NtTextField.astro:37, 40 |
| #4AD300 | успех (статусы форм) | Contacts.astro:93; Footer.astro:82 |

## 8. Хром страницы

| Роль | Значения | Источник |
|---|---|---|
| Порядок | PromoBanner → Header → main → Footer → NtCartDrawer | Layout.astro:27-33 |
| Промо-баннер | DS `NtPromoBanner`: bg #000000 текст #FFFFFF `min-h-12`; rose-надстройка: одна строка, шрифт `clamp(10px, 2vw+5px, 16px)`, поля 5rem → 300px (1280) → 680px (1536) | PromoBanner.astro:16; DS/NtPromoBanner.astro:20, 32; g:624-674 |
| Шапка mobile | строка `h-11`: бургер / лого / корзина | Header.astro:34 |
| Шапка desktop | `py-5 lg:py-6`, лого слева — навигация по центру — поиск/корзина/аккаунт справа (gap-4 lg:gap-6) | Header.astro:73, 99 |
| Бейдж корзины | `h-4 min-w-[16px] rounded-full bg-[#000000]` Manrope 10 white | Header.astro:120 (mobile: 66) |
| Корзина | выдвижной drawer справа, `max-w-[457px]`, белый, slide 300ms | Layout.astro:33; DS/NtCartDrawer.astro:50 |
| Футер | рассылка (форма 430px) → ряд колонок: 2 ссылочных ul (между ними `sm:gap-[200px]`, внутри `gap-3`) + правая колонка контакты/соцсети/оплата (right-aligned на lg) → чёрная копирайт-полоса `h-16` Manrope 14 white | Footer.astro:46-60, 90-96, 118-148, 154-155 |
