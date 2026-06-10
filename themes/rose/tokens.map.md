# rose — карта панельных токенов → вёрстка верстальщика

Для каждого из 39 панельных токенов (constructor `TOKEN_REGISTRY_KEYS`,
`constructor/src/contexts/ThemeContext.tsx:343-383`): фактическое значение верстальщика
и носители в `themes/rose/src` (файл:строка). Сверка с `packages/theme-rose/theme.json defaults`.

Сокращения: `g` = `src/styles/global.css`, `DS` = пакет
`@merfy-dropshipping-platform/design-systems-theme/src/components/ui`,
`theme.json` = `packages/theme-rose/theme.json`.

«Носитель: per-context» = у верстальщика значение различается между местами;
токен задаёт ДЕФОЛТ для новых секций, фактические места перечислены.

## Цвета (схемные — носитель = colorSchemes, фактические литералы scheme-1)

| Токен | Литерал верстальщика | Носители (файл:строка) | scheme-1 | Вердикт |
|---|---|---|---|---|
| `--color-bg` | #FFFFFF | Layout.astro:26 `bg-white`; Hero.astro:21; Collections.astro:16; Popular.astro:18; Gallery.astro:15; Contacts.astro:18; Footer.astro:43; g:17 | `255 255 255` | ✓ совпадает |
| `--color-surface` | #F5F5F5 | RoseCollectionCard.astro:20 `bg-[#F5F5F5]`; Gallery.astro:31, 51, 81 | `245 245 245` | ✓ совпадает |
| `--color-heading` | #000000 | g:49 (`.rose-title` color #000000); Hero.astro:43 (на фото — white); DS/NtSectionHeading.astro:27 `text-[#000000]` | было `18 18 18` | ✗ исправлено → `0 0 0` |
| `--color-text` | #000000 | g:429 (body color #000000); Contacts.astro:36 `text-[#000000]`; Header.astro:89 | было `18 18 18` | ✗ исправлено → `0 0 0` |
| `--color-muted` | #999999 | g:16 (`--color-gray`), g:58 (`.rose-subtitle`); Contacts.astro:35; Footer.astro:96; DS/NtSectionHeading.astro:39 | `153 153 153` | ✓ совпадает |
| `--color-primary` | #000000 | g:15 (`@theme --color-primary: #000000`); Header.astro:52 `text-primary`, 197 `bg-primary` | `0 0 0` | ✓ совпадает |
| `--color-accent` | #000000 | акцентов кроме чёрного нет: бейдж RoseProductCard.astro:36 `bg-[#000000]`; активное подчёркивание Header.astro:90 | `0 0 0` | ✓ совпадает |
| `--color-button-bg` | #000000 | g:125 (`.rose-btn-primary` background #000000); Header.astro:160 `!bg-[#000000]`; Contacts.astro:84 | `0 0 0` | ✓ совпадает |
| `--color-button-text` | #FFFFFF | g:132 (color #FFFFFF); Header.astro:160 `!text-white` | `255 255 255` | ✓ совпадает |
| `--color-button-border` | нет рамки (бордер = заливке) | g:134 (`border: none`); Hero.astro:63 `!border-0` | `0 0 0` | ✓ (= заливке, рамка не видна) |
| `--color-button-2-bg` | #FFFFFF | Hero CTA (единственная «вторая» кнопка — белая на фото): Hero.astro:63 `!bg-white` | `255 255 255` | ✓ совпадает |
| `--color-button-2-text` | #000000 | Hero.astro:63 `!text-[#000000]` | `0 0 0` | ✓ совпадает |
| `--color-button-2-border` | нет рамки | Hero.astro:63 `!border-0` | `0 0 0` | ✓ (носитель отсутствует — CTA героя без рамки) |
| `--color-error` | **#FF9494** | DS/NtTextField.astro:37 `border-[#FF9494]`, :40 `focus-visible:border-[#FF9494]`; носитель: DS-компонент (форма Contacts.astro:64-66, design-system.astro). В своей вёрстке rose error-литералов нет | defaults:40 было `252 165 165` | ✗ исправлено → `255 148 148` |

Примечание: scheme-2 (theme.json:304-325) несёт те же `18 18 18` — намеренно НЕ тронута
(задача сверяет только scheme-1; scheme-2 защищена `$comment` про seed-сайты).
Успех-статус форм #4AD300 (Contacts.astro:93; Footer.astro:82) — панельного токена не имеет.

## Типографика

| Токен | Литерал верстальщика | Носители | theme.json default | Вердикт |
|---|---|---|---|---|
| `--font-heading` | "Comfortaa", sans-serif | g:43 (`.rose-title`); g:528 (h1-h6); Hero.astro:43 `font-comfortaa`; Header.astro:76 | `'Comfortaa', sans-serif` (:12) | ✓ |
| `--font-body` | "Manrope", sans-serif | g:422 (body); g:53 (`.rose-subtitle`); g:26 (`.font-manrope`) | `'Manrope', sans-serif` (:13) | ✓ |
| `--weight-heading` | 400 | g:44 (`.rose-title` font-weight 400); Hero.astro:43 `!font-normal`. Исключение: заголовок рассылки `!font-bold` Footer.astro:50 (mobile 400 — Footer.astro:178) | `400` (:14) | ✓ |
| `--weight-body` | 400 | g:96 (`.rose-input`), g:129 (`.rose-btn-primary`); `font-normal` повсеместно (Hero.astro:51; Header.astro:89) | `400` (:15) | ✓ |
| `--size-hero-heading` | **40px** (desktop lg; лестница 20 → sm:28 → md:36 → lg:40) | Hero.astro:43 `lg:!text-[40px]`; согласуется с per-block `--hero-title-size: clamp(20px, 5vw, 40px)` (theme.json:84) | было `32px` (:23) | ✗ исправлено → `40px` |
| `--size-nav-link` | 16px (desktop lg; 14px до lg) | Header.astro:89 `lg:text-[16px]` | `16px` (:26) | ✓ |

## Радиусы

| Токен | Литерал верстальщика | Носители | theme.json default | Вердикт |
|---|---|---|---|---|
| `--radius-button` | 6px (CTA) | Hero.astro:63 `sm:rounded-[6px]` (mobile `rounded` = 4px); Contacts.astro:84 `rounded-[6px]`. Per-context: поиск 4px (Header.astro:160), авторизация 8px (g:124) | `6px` (:18) | ✓ |
| `--radius-input` | 4px | Header.astro:148 (поиск), :180 (бургер-поиск); Footer.astro:60 (рассылка); DS/NtTextField.astro:60. Per-context: авторизация 8px (g:89) | `4px` (:19) | ✓ |
| `--radius-card` | 8px (на медиа; карточка без подложки) | RoseProductCard.astro:22; RoseCollectionCard.astro:20 | `8px` (:20) | ✓ |
| `--radius-media` | 8px | Gallery.astro:31, 51, 81; RoseProductCard.astro:22 | `8px` (:21) | ✓ |
| `--radius-field` | 4px | DS/NtTextField.astro:60 `rounded-[4px]`; Contacts.astro:77 (textarea) | `4px` (:22) | ✓ |

## Отступы и контейнер

| Токен | Литерал верстальщика | Носители | theme.json default | Вердикт |
|---|---|---|---|---|
| `--spacing-section-y` | **120px** на lg — доминирующий литерал контент-секций; носитель: per-section. Лестница 56 → sm:64 → md:100 → lg:120 → xl:140; Contacts 48/60 → md:80; Footer 80 | Collections.astro:16; Popular.astro:18; Gallery.astro:15 (`lg:pb-[120px] lg:pt-[120px]`); Contacts.astro:18; Footer.astro:44 | `120px` (:30) | ✓ оставлен 120px (= lg-литерал трёх главных секций; токен — дефолт для новых секций; buildTokensCss: tokens-css.ts:106) |
| `--spacing-grid-col-gap` | 16px (товарная сетка md; per-context: Popular xl 20px, Collections lg 24px) | Popular.astro:30 `sm:gap-x-4 md:gap-x-4` (=16px), `xl:gap-x-5`; Collections.astro:28 `lg:gap-6` | `16px` (:31) | ✓ оставлен (базовое значение канонной товарной сетки) |
| `--spacing-grid-row-gap` | 40px (товарная сетка md+) | Popular.astro:30 `md:gap-y-10` (=40px) | `40px` (:32) | ✓ |
| `--container-max-width` | 1920px (внешняя обёртка); контент-контейнер 1320px | Header.astro:73, Footer.astro:44 `max-w-[1920px]`; контент: Collections.astro:20 и др. `max-w-[1320px]` | `1920px` (:16) | ✓ (двухуровневый контейнер, 1320 — внутренний, панелью не управляется) |

## Размеры

| Токен | Литерал верстальщика | Носители | theme.json default | Вердикт |
|---|---|---|---|---|
| `--size-hero-button-h` | per-context: Hero CTA 40 → sm:**52px**; Contacts CTA **48px** (`h-12`); авторизация 56px; поиск 40px | Hero.astro:63 `sm:h-[52px]`; Contacts.astro:84 `h-12`; g:120; Header.astro:160 | `48px` (:24) | ✓ оставлен 48px: токен потребляется всеми CTA theme-base (Product/Checkout/CartDrawer — Product.classes.ts:24 и др.), единого литерала нет; 48px = фактический литерал CTA формы и середина диапазона. Точная высота hero CTA живёт в per-block `--hero-cta-button-height: clamp(40px, 5vw, 52px)` (theme.json:87) |
| `--size-newsletter-form-w` | 430px | Footer.astro:60 `max-w-[430px]`; та же ширина колонки формы Contacts.astro:59 `lg:grid-cols-[430px_1fr]` | `430px` (:27) | ✓ |
| `--size-logo-width` | 24px — логотип ТЕКСТОВЫЙ, носитель = font-size надписи (desktop 24px / mobile 20px) | Header.astro:76 `text-[24px]`; :52 `text-[20px]` | `24px` (:28) | ✓ |
| `--size-card-border` | носителя нет — карточки rose без рамки | RoseProductCard.astro:15-60, RoseCollectionCard.astro:14-36 (нет border-классов) | `1px` (:29) | ✓ не тронут (литерала нет; рамка не рендерится, т.к. карточки theme-base для rose безбордерные) |

## Стилевые перечисления

| Токен | Фактическая манера верстальщика | Носители | theme.json default | Вердикт |
|---|---|---|---|---|
| `--button-style` | solid — только сплошные заливки, hover затухание opacity | g:118-139; Hero.astro:63; Header.astro:160 | `solid` (:33) | ✓ |
| `--footer-layout` | 3 колонки: 2 ссылочных ul + правая колонка контактов/соцсетей (+ блок рассылки сверху) | Footer.astro:90-116 (два ul), :118-148 (правая колонка) | `3-column` (:34) | ✓ |
| `--contact-form-layout` | широкая 2-колоночная форма `lg:grid-cols-[430px_1fr]` | Contacts.astro:59 | `wide` (:35) | ✓ |
| `--cart-type` | drawer — выезжает справа, max-w 457px; носитель: DS-компонент `NtCartDrawer` | Layout.astro:33; DS/NtCartDrawer.astro:50 | `drawer` (:36) | ✓ |
| `--card-style` | standard — голая карточка: медиа + имя + цена, без рамки/подложки | RoseProductCard.astro:15-60 | `standard` (:37) | ✓ |
| `--card-alignment` | left | RoseProductCard.astro:42 `text-left`; RoseCollectionCard.astro:32 `text-left` | `left` (:38) | ✓ |

## Изменения defaults (применены в packages/theme-rose/theme.json)

Менялись ТОЛЬКО строки, расходящиеся с литералами верстальщика. Остальные 36 панельных
токенов сверены и оставлены (пруфы в таблицах выше). Непанельные ключи
(`--checkout-*`, `--header-nav-*`, `--size-h2`, `--hero-*`, `--footer-*` и пр.) не тронуты.

| Токен | Было | Стало | Пруф |
|---|---|---|---|
| `--size-hero-heading` | `32px` | `40px` | Hero.astro:43 — фактический h1 героя на lg `lg:!text-[40px]` (лестница 20/28/36/40); 32px не встречается в Hero нигде. Подтверждение: собственный per-block токен темы `--hero-title-size: clamp(20px, 5vw, 40px)` (theme.json:84) |
| `--color-error` | `252 165 165` (#FCA5A5) | `255 148 148` (#FF9494) | DS/NtTextField.astro:37, 40 — единственный error-литерал вёрстки rose (используется формой Contacts.astro:64-66). #FCA5A5 (tailwind red-300) в вёрстке rose не встречается |
| scheme-1 `--color-heading` | `18 18 18` | `0 0 0` | g:49 — `.rose-title { color: #000000 }`; DS/NtSectionHeading.astro:27 `text-[#000000]`. #121212 в вёрстке rose не встречается |
| scheme-1 `--color-text` | `18 18 18` | `0 0 0` | g:429 — body `color: #000000`; Header.astro:89, Contacts.astro:36 `text-[#000000]` |

Известное следствие `--size-hero-heading` 32→40: theme-base Hero при `heading.size: "large"`
рендерит `calc(var(--size-hero-heading) * 1.5)` (theme-base/blocks/Hero/Hero.astro:78-80) —
v1-хиро укрупнится 48→60px. Принято: целевой пиксель — верстальщик (40px), v1-каскад
сводится в следующих задачах фазы.

## 5-я цветовая схема (scheme-5)

Светло-серый монохром из фактической палитры rose: фон **#F5F5F5** — реальный цвет темы
(плейсхолдер медиа RoseCollectionCard.astro:20; Gallery.astro:31, 51, 81; surface scheme-1),
поверхность — белая (инверсия scheme-1), текст/кнопки — родные чёрные (g:49, g:125),
muted #999999 (g:16). Отлична от scheme-1/2 (белый фон), scheme-3 (беж #F5F0EB),
scheme-4 (чёрный); нейтраль в манере rose, без кислоты.
