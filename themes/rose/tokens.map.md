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
| `--color-bg` | #FFFFFF | Layout.astro:26 `bg-white`; Hero.astro:21; Collections.astro:16; Popular.astro:18; Gallery.astro:15; Contacts.astro:18; Footer.astro:43; Header.astro:30 (фон шапки — дополнено T8); g:17 | `255 255 255` | ✓ совпадает |
| `--color-surface` | #F5F5F5 | RoseCollectionCard.astro:20 `bg-[#F5F5F5]`; Gallery.astro:31, 51, 81 | `245 245 245` | ✓ совпадает |
| `--color-heading` | #000000 | g:49 (`.rose-title` color #000000); Hero.astro:43 (на фото — white); Header.astro:76 (лого desktop — дополнено T8); DS/NtSectionHeading.astro:27 `text-[#000000]` | было `18 18 18` | ✗ исправлено → `0 0 0` |
| `--color-text` | #000000 | g:429 (body color #000000); Contacts.astro:36 `text-[#000000]`; Header.astro:89 | было `18 18 18` | ✗ исправлено → `0 0 0` |
| `--color-muted` | #999999 | g:16 (`--color-gray`), g:58 (`.rose-subtitle`); Contacts.astro:35; Footer.astro:96; DS/NtSectionHeading.astro:39 | `153 153 153` | ✓ совпадает |
| `--color-primary` | #000000 (платформенный токен — используется как `rgb(var(--color-primary))` в DS-компонентах, не через Tailwind-утилиту) | DS-компоненты через `rgb(var(--color-primary,...))` | `0 0 0` | ✓ совпадает |
| `--color-rose-primary` | #000000 | g:15 (`@theme --color-rose-primary: #000000`); Header.astro:52 `text-rose-primary`, 66 `bg-rose-primary`, 189 `text-rose-primary`, 197 `bg-rose-primary`, 214 `text-rose-primary`+`after:bg-rose-primary`, 215 `hover:text-rose-primary` | не платформенный токен — приватный неймспейс темы | ✓ переименовано из `--color-primary` (Фаза 3: коллизия неймспейса, 2026-06-10) |
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

## Журнал миграции T8 (нарезанные секции → var() с fallback = литерал)

Мигрированы носители панельных токенов в PromoBanner/Header/Hero/Collections/Popular/
Gallery/Contacts/Footer + RoseProductCard/RoseCollectionCard + DS-перекрытия в g.
Каждый fallback = ровно прежний литерал верстальщика; пиксель-дифф после каждого
шага identical. Решения по спорным местам:

- **Промо-полоса**: токенов `--color-bottom-strip-*` в реестре 39 НЕТ — взяты схемные
  `--color-bg`/`--color-text` как у канона theme-base PromoBanner.classes. Цвета зашиты
  в DS NtPromoBanner (пропсов цвета нет) → перекрытие в g (конец файла) по
  `[data-nt="promo-banner"]` с fallback `0 0 0`/`255 255 255` (= литералы DS,
  НЕ scheme-1 — полоса у верстальщика чёрная; перекраску даст обёртка схемы блока).
- **Копирайт-полоса Footer** (:154-155): `bg-black`/`text-white` → `--color-heading`/`--color-bg`
  — пара канона theme-base Footer.classes copyright.bar (инверсия в рамках одной схемы).
- **Лестницы размеров**: мигрирован только desktop-носитель — nav-ссылка `lg:text-[16px]` →
  `lg:text-[length:var(--size-nav-link,16px)]` (mobile 14px литерал), hero h1 `lg:!text-[40px]` →
  `lg:!text-[length:var(--size-hero-heading,40px)]` (лестница 20/28/36 литералами), лого
  desktop 24px → `--size-logo-width` (mobile 20px литерал). Карта называет lg-классы носителями.
- **Hero CTA = «вторая кнопка»** (`--color-button-2-bg/text`, по таблице выше); высота
  `sm:h-[52px]` НЕ мигрирована (52 ≠ глобальный дефолт 48 — см. вердикт `--size-hero-button-h`);
  mobile `rounded` (4px) НЕ мигрирован (носитель = `sm:rounded-[6px]`); `!border-0` не тронут
  (рамки нет — носитель отсутствует).
- **Contacts CTA**: `h-12` → `h-[var(--size-hero-button-h,48px)]` (литерал 48 == дефолт);
  `rounded-[6px]` → `--radius-button`. Цвета кнопки живут в `.rose-btn-primary` (g) —
  фон/текст мигрированы на `--color-button-bg/text` (носители g:125/g:132 в старой нумерации);
  его радиус 8px / высота 56px — per-context (авторизация), остались литералами.
- **NtTextField (DS)**: радиус перекрыт в g → `--radius-field` (4px = дефолт). Бордер НЕ
  мигрирован — РАСХОЖДЕНИЕ: фактический рендеримый бордер полей Contacts = strong `#000000`
  (DS default prop), а дефолт темы `--color-input-border` = `153 153 153`; перекрытие снаружи
  дополнительно убило бы state-цвета muted/error. Развязка — на уровне DS-пропсов в следующих
  задачах. Textarea Contacts: бордер `#000000` не мигрирован по той же причине, радиус →
  `--radius-field`.
- **NtSectionHeading (DS)**: h2/p не были покрыты T7 (литералы в пакете) — перекрытие в g:
  h2 → `--color-heading`, p → `--color-muted` (носители по таблице выше).
- **Радиус медиа карточек**: RoseProductCard:22 и RoseCollectionCard:20 мигрированы под
  `--radius-media` (по Step 3 задачи); `--radius-card` остаётся без собственного носителя
  в rose (карточки без подложки/рамки).
- **Кнопка поиска шапки** («Найти», Header): фон/текст → `--color-button-bg/text` (носители
  по таблице), радиус 4px — per-context, НЕ мигрирован. Формы поиска (desktop/бургер) →
  `rounded-[var(--radius-input,4px)]`; бордер поиска `#E5E5E5` — литерал без панельного
  токена (≠ `--color-input-border` 153 153 153), не тронут.
- **Footer muted-тексты**: помимо образца :96 тот же литерал/роль у второй колонки, телефона,
  email и подзаголовка рассылки — все → `--color-muted`. Соцссылки → `--color-text`.
  Hover/focus-состояния (`hover:text-[#000000]`, `focus-within:border-[#000000]`) не тронуты.
- **`text-primary`/`bg-primary`** (mobile-лого, бейджи, бургер): НЕ обёрнуты в `rgb(var())` —
  `@theme` определяет `--color-primary: #000000` hex'ом в :root, `rgb(var(--color-primary))`
  дал бы invalid. Места остаются на tailwind-переменной; формат-развязка — задача механики схем.
- **Gallery**: CTA-кнопки в секции верстальщика НЕТ (вопреки тексту Step 4) — мигрированы
  фон секции, радиусы и surface плиток. Подписи плиток `text-black` — карта носителем не
  называет, не тронуты.
- **Hero CTA btn2→btn1** (пост-T8): CTA Hero — primaryButton, канон scheme-4 даёт btn-bg
  `255 255 255` / btn-text `0 0 0` (= прежние литералы btn2). Переведена с `--color-button-2-*`
  на `--color-button-bg/text` (Hero.astro:63). Fallback'и НЕ изменились — пиксель-дифф identical
  на standalone-гейте.
- **Hero/PromoBanner blockDefaults.colorScheme=scheme-4**: оба блока получили дефолтную схему
  scheme-4 (bg `0 0 0`, heading/text `255 255 255`, btn-bg `255 255 255`, btn-text `0 0 0`) в
  `packages/theme-rose/theme.json` blockDefaults. При ревизии без `colorScheme` в props обёртка
  `.color-scheme-4` ставится автоматически → tokens.css :root scheme-1 не ломает Hero/промо-полосу.
  ✓ Теперь действительно автоматически: до фикса коэрсер `coerceHeroProps` впрыскивал fallback
  `1` при отсутствии `colorScheme`, перебивая blockDefaults. Исправлено в `src/themes/page-blocks.ts`
  (фикс впрыска): все `out.colorScheme = coerceSchemeNumber(out.colorScheme)` заменены на
  `if (out.colorScheme !== undefined) out.colorScheme = coerceSchemeNumber(out.colorScheme)` для
  Hero, Header, PopularProducts, ContactForm, ImageWithText, MainText, Footer.
  Clamp расширен с 1..4 до 1..5 для поддержки scheme-5.
- **Машина resolveBlockScheme**: `PreviewService.resolveBlockScheme()` (preview.service.ts) —
  публичный метод; props ревизии побеждают, иначе blockDefaults темы. Используется в
  `renderV2ContentPage` и `v2-live-pages.ts::composeContentPagesIntoDist` вместо прямого
  `schemeIdFromProp(b.props?.colorScheme)`.

## Журнал миграции T9 (сложные страницы: checkout / catalog / cart / product)

Правило T9 (live-паритет): сложные страницы — блоб без обёрток `.color-scheme-N` →
схемные токены разрешаются из `:root` = scheme-1. Мигрировались ТОЛЬКО литералы,
равные значению scheme-1 соответствующего токена (root-радиусы — равные theme.json
defaults). Каждый fallback = ровно прежний литерал; пиксель-дифф 4×identical.

- **checkout.astro — правок НЕТ**: страница = композиция theme-base мега-блоков
  CheckoutForm/CheckoutSummary, уже токен-driven изнутри (кнопка «Оплатить» —
  CheckoutSubmit.classes.ts:6 `--color-button-bg/text` + `--radius-button`; поля —
  CheckoutDeliveryForm.classes.ts:13 `--color-input-border` + `--radius-input`).
  Собственная обвязка страницы уже на `rgb(var(--color-bg/text))` (обёртка
  `.color-scheme-2`). Заголовки внутри блоков — не `.rose-title`, дублей с T7 нет.
- **catalog.astro**: фон секции `bg-white` → `--color-bg`; summary фильтров/сортировки
  (Наличие/Стоимость/Цвет/По популярности) `text-[#000000]` → `--color-text`; кнопка
  «Смотреть ещё» (оба layout'а) `bg-[#000000]`/`text-white`/`rounded-[6px]` →
  `--color-button-bg`/`--color-button-text`/`--radius-button`; счётчик «N товаров»
  `#999999` → `--color-muted`. Высота `h-12` НЕ мигрирована (Step 3 называет
  фон/текст/радиус; 48px-токен `--size-hero-button-h` остаётся дефолтом CTA-форм).
  Карточки — RoseProductCard, мигрирован в T8 (подтверждено: страница использует его).
- **cart.astro (страница)**: фон `bg-white` → `--color-bg`; CTA «Продолжить покупки» и
  «Оформить заказ» → кнопка-1 токены + `--radius-button`; «Итого»/сумма `#000000` →
  `--color-text`; подсказки `#999999` → `--color-muted`; ссылка «Войти» `#000000` →
  `--color-text`. **Строки товаров НЕ мигрированы**: рендерятся клиентским
  innerHTML-шаблоном внутри `<script>` (cart.astro:146-182) — правка JS запрещена
  правилом T9 (литералы #F5F5F5/#000000/#999999/#E5E5E5/rounded-[8px]/[4px] остаются
  носителями в JS до отдельной задачи).
- **product.astro**: блок «Товар не найден» — фон → `--color-bg`, заголовок (comfortaa)
  → `--color-heading`, кнопка «В каталог» → кнопка-1 + `--radius-button`.
- **RoseProductDetail.astro (PDP)**: фон секции → `--color-bg`; главное медиа
  `rounded-[8px] bg-[#F5F5F5]` → `--radius-media` + `--color-surface`; thumbs
  `bg-[#F5F5F5]` → `--color-surface`, их `rounded-[6px]` НЕ мигрирован (6px ≠
  `--radius-media` 8px — per-context литерал); бейдж «Скидка» `bg-[#000000]` →
  `--color-accent` (прецедент T8 RoseProductCard:36), его `rounded-[4px]`/`text-white`
  — литералы (как в T8); бренд/старая цена/описание `#999999` → `--color-muted`;
  h1 → `--color-heading`; цена/qty-значение/«Поделиться» `#000000` → `--color-text`;
  qty-степпер `rounded-[4px]` → `--radius-input` (прецедент T8: формы поиска), его
  бордер `#E5E5E5` НЕ мигрирован (≠ `--color-input-border` 153 153 153); CTA
  «Купить сейчас» (чёрная) → кнопка-1 + `--radius-button`; CTA «Добавить в корзину»
  (белая outline) → кнопка-2 (`--color-button-2-bg/text/border`, литералы
  white/#000000/#000000 == scheme-1 кнопки-2) + `--radius-button`.
- **RosePdpColorVariantRow.astro — НЕ мигрирован целиком**: классы вариантных кнопок
  (`!bg-[#000000]`/`!bg-white`/`border-[#000000]` и др.) дублируются стейт-машиной
  applyOutline/applyFilled в `<script>` RoseProductDetail.astro:211-219 — миграция
  разметки без правки JS даёт конфликт двух `!`-утилит после перещёлкивания
  варианта, JS трогать нельзя. Литералы остаются синхронной парой разметка↔JS.
- **RosePagination.astro**: базовый текст/активная страница `#000000` → `--color-text`;
  неактивные страницы и счётчик `#999999` → `--color-muted`; `hover:text-[#000000]`
  не тронут (hover-состояния — прецедент T8).
- **NtCartDrawer (DS-пакет)**: цвета зашиты в пакете — перекрытие в g (конец файла)
  по фактическим хукам `[data-nt="cart-drawer"]` + `[data-cart-panel/empty/summary]`:
  фон панели `bg-white` → `--color-bg`; заголовок → `--color-heading`; «Скрыть» и
  тексты пустой корзины `#999999` → `--color-muted`; «Войти», строка «Итого»
  `#000000` → `--color-text`; обе CTA (`bg-[#000000] text-white rounded-[6px]`) →
  кнопка-1 + `--radius-button`. Fallback'и = литералы DS. Оверлей `bg-black/35` —
  панельного токена нет, не тронут. JS-строки товаров drawer'а не перекрываются
  (носитель — `<script>`-шаблон).

## 5-я цветовая схема (scheme-5)

Светло-серый монохром из фактической палитры rose: фон **#F5F5F5** — реальный цвет темы
(плейсхолдер медиа RoseCollectionCard.astro:20; Gallery.astro:31, 51, 81; surface scheme-1),
поверхность — белая (инверсия scheme-1), текст/кнопки — родные чёрные (g:49, g:125),
muted #999999 (g:16). Отлична от scheme-1/2 (белый фон), scheme-3 (беж #F5F0EB),
scheme-4 (чёрный); нейтраль в манере rose, без кислоты.

## Журнал T9-фиксов (2026-06-10, контролёр)

- **Layout.astro: промо-полоса обёрнута `<div class="color-scheme-4" data-block-scheme="4">`** — зеркало композера v2 (blockDefaults.PromoBanner.colorScheme=scheme-4). Без неё на сложных страницах (блоб + tokens.css, :root=scheme-1) полоса белела. Пруф: tokens-режим снапов contacts/catalog/cart/product → identical к plain-эталонам.
- **Эталоны /tmp/rose-before-*.png пересняты в plain-режиме @HEAD** (6 маршрутов) после инцидента: субагент перезаписал их в tokens-режиме, что дало самосогласованные «6×OK». Семантика эталона: plain = пиксель верстальщика (fallback-ветка). Правомерность пересъёмки @HEAD: построчные ревью T7-T9 подтвердили fallback==literal.
- **Tokens-гейт (node .tmp-snap-rose.mjs after tokens): ожидаемые исключения** — `home` (статичный блоб не имеет scheme-обёрток секций; на live контентные страницы КОМПОНУЮТСЯ с обёртками — ложная тревога), `checkout` (rose-дефолты намеренно применяются к theme-base блокам: Comfortaa-заголовки, радиусы — критерий 5). Остальные 4 маршрута обязаны быть identical.

## Журнал T11 (Hero + PromoBanner — полная канон-схема)

Новые канон-пропсы дают эффект только при заданных значениях ≠ дефолта; дефолтные ветки
тернарников = прежние строки классов байт-в-байт (пруф: render-probe diff дефолтного
рендера до/после — identical; plain-гейт 6×OK identical).

- **Hero heading.size / text.size**: 'large' (= blockDefaults rose) и отсутствующий проп →
  лестница верстальщика дословно (заголовок 20/28/36/`var(--size-hero-heading,40px)`,
  текст 14/16/18/20). Уменьшенные в манере: medium ≈0.85× (заголовок 17/24/31/34,
  текст 12/14/15/17), small ≈0.7× (заголовок 14/20/25/28, текст 10/11/13/14) — окр. до целых px.
- **Hero secondaryButton**: рендер только при непустом text; геометрия = CTA героя,
  стиль = кнопка-2 (`--color-button-2-bg/text/border`, fallback white/#000000/#000000 —
  литералы манерного образца «Добавить в корзину» RoseProductDetail.astro:162);
  subsection-тег 103. Кнопочный ряд при второй кнопке → row gap-3 sm:gap-4.
- **Hero overlay** (0-100, коэрсится из числа/строки): слой `z-[1] bg-black opacity:N/100`
  между фото (z-0) и контентом (z-10); 0/отсутствие → слой не рендерится.
- **Hero position/contentPosition + alignment**: alignment (left/center/right) → items/text-align
  контент-колонки; position (приоритетнее legacy contentPosition) → вертикаль justify
  + горизонталь-fallback. Значение **'center' = canon-default (его пишет defaultPagesData) →
  пиксель верстальщика** (контент у нижней кромки, по центру), как и отсутствие пропа.
- **Hero backgroundImages.url2 / backgroundImage2**: сплит `grid grid-cols-2` двух RosePicture
  только при заданном втором фото; иначе одиночный рендер дословно.
- **Hero buttonStyle**: 'outlined' → CTA с бордером/текстом цвета заливки кнопки-1 и
  прозрачным фоном; 'solid'/отсутствие = текущий вид (кнопка-1 токены, T8).
- **Hero/PromoBanner padding {top,bottom}**: inline-стиль на корне только при заданном
  пропе (паттерн T14).
- **PromoBanner size** → DS-сетка NtPromoBanner (макет «Панель объявлений» sm h32/md h40/lg h48):
  canon default 'medium' и отсутствие = текущий вызов без textSize (DS-дефолт lg, 48px);
  thin→sm (32px), small→md (40px); large продолжает DS-ряд шагом 8px → 56px перекрытием
  `[&_[data-nt=promo-banner]]:min-h-14` на обёртке (шрифт не меняется — rose-clamp в g).
- **PromoBanner textTransform**: 'uppercase' → класс на обёртке (text-transform наследуется
  внутрь DS-полосы); 'none'/отсутствие = текущий вид. Subsection-тег 100 (field=text) —
  на обёртке-носителе (текст внутри DS NtPromoBanner недоступен, паттерн Фазы 2).
- **Игнорируемые рендером поля канона** (панель покажет, эффекта в rose нет): Hero —
  variant (rose-вёрстка одна: фуллблид фото), size секции (высота полотна = лестница
  аспектов верстальщика), container, mode/slides/pagination/autoplay/interval (карусель),
  imageFullBleed, contentAlign (дублирует alignment); colorScheme потребляется снаружи
  обёрткой `.color-scheme-N` композера/превью (не внутри секции).
- Гейты T11: plain 6×OK identical; tokens — contacts/catalog/cart/product OK identical,
  home/checkout = два известных исключения (см. журнал T9-фиксов).

## Журнал T12 (Header + Footer — полная канон-схема, логотип)

Тот же принцип, что T11: новые канон-пропсы дают эффект только при заданных
значениях; дефолтные ветки тернарников = прежние строки классов байт-в-байт
(пруф: render-probe diff дефолтного рендера до/после — отличия только в
data-puck-subsection-атрибутах; plain-гейт 6×OK identical).

- **blockDefaults.Header.logo="/logo.svg" УДАЛЁН** из packages/theme-rose/theme.json —
  легаси старого пайплайна (extractSiteConfig build.service.ts:1211 держит тот же
  хардкод для v1-сборок, theme.json не читает). Канон rose = ТЕКСТОВЫЙ логотип
  верстальщика (Comfortaa 24px desktop / 20px mobile); `<img>` рендерится только
  при merchant-загрузке логотипа (панель «Логотип» → applyBrandLogoToAllHeaders →
  props.logo). Высота img = `--size-logo-width` (семантика канона theme-base
  Header.classes.ts:71 — слайдер «Размер» задаёт ВЫСОТУ; w-[var] из текста задачи
  дал бы 24px ШИРИНЫ — нечитаемо). Ветка в обоих местах: desktop и mobile.
- **Header logoPosition**: 'top-center'/'center-absolute' → лого absolute по
  центру строки (классы канона logoWrap), контейнер получает `relative`, nav
  уходит влево (justify-between). 'top-left' (canon default) / 'center-left' /
  отсутствие / неизвестное = строка верстальщика дословно. 'top-right' в Figma-панели
  отсутствует → дефолт-ветка.
- **Header stickiness**: 'always' → `sticky top-0 z-50` на корне блока; 'scroll-up' →
  те же классы + `transition-transform duration-300` + `data-rose-sticky` +
  is:inline скрипт через `set:html` (без define:vars — компилятор секций его не
  умеет), идемпотентность `data-hydrated`, поиск root по data-атрибуту
  (хедер один — querySelector достаточно). 'none'/отсутствие = как было.
- **Header/Footer padding {top,bottom}** — inline-стиль ТОЛЬКО при пропе, на
  НОСИТЕЛЕ отступов верстальщика (не на корне, в отличие от Hero T11 — у
  Header/Footer уже есть py-классы, добавка на корень дублировала бы отступ):
  Header → desktop-контейнер, py-5/lg:py-6 уступают inline (clamp ≤64 как
  theme-base Header.astro:42); mobile-строка h-11 фиксированная (как канон —
  слайдер про desktop-высоту). Footer → внутренний контейнер, pt-20/pb-20
  уступают inline. Footer-коэрсер live-пути впрыскивает {80,80} == литерал
  pt-20/pb-20 → live-пиксель дефолт-ревизий не меняется.
  ⚠️ ИЗВЕСТНОЕ РАСХОЖДЕНИЕ (эскалация плану): coerceHeaderProps
  (src/themes/page-blocks.ts:398) впрыскивает padding {16,16} при ревизии без
  padding, перекрывая blockDefaults {24,24} → на live дефолт-хедер получит 16px
  вместо 24px (py-6). Фикс впрыска (по прецеденту T11 colorScheme) затронул бы
  flux/satin превью (у них нет Header.padding в blockDefaults) — вне мандата T12.
- **Footer newsletter.enabled**: блок подписки скрывается ТОЛЬКО при явном
  false/'false' (коэрс строки); отсутствие пропа и rose blockDefaults
  enabled=true → показан = пиксель. newsletter.heading/description/placeholder
  НЕ потребляются (мандат T12 — только enabled; тексты формы — литералы
  верстальщика).
- **Footer-колонки navigationColumn/informationColumn {title, links[]}**: ссылки
  из пропсов с fallback на литералы верстальщика; заголовок колонки — новый
  элемент `<li><h3>` (Manrope 16 --color-text), рендерится только при непустом
  title из пропсов: в вёрстке верстальщика заголовков колонок НЕТ. Для
  пиксель-парности дефолтного рендера **blockDefaults.Footer приведены к
  литералам верстальщика**: titles колонок удалены; navigationColumn.links 4→3
  (убрана «О нас» — состав верстальщика Footer.astro navColumn);
  informationColumn href `/legal/returns` → `/legal/return` (литерал :16);
  socialColumn.title удалён; порядок socialLinks → [vk, youtube, dzen, tiktok,
  telegram] (порядок иконок верстальщика :34-40).
- **Footer socialColumn.socialLinks**: канон-enum платформ → иконы/aria-лейблы
  верстальщика (vk→social-vk … dzen→social-yandex-dzen); пустой/отсутствующий
  массив → литеральный набор 5 иконок дословно. email потреблялся с Фазы 2.
- **Footer copyright**: канон-объект {companyName, poweredBy, showYear} +
  legacy-строка целиком (проба задачи передаёт строку). Дефолтная сборка =
  литерал верстальщика байт-в-байт: «© {год} {siteTitle} Theme Все права
  защищены. Powered by Merfy»; companyName заменяет «{siteTitle} Theme»,
  showYear false/'false' убирает год, poweredBy '' убирает хвост.
- **Footer bottomStrip {enabled, text}**: носитель = чёрная копирайт-полоса
  (отдельной полосы у rose нет — реши по схеме: 084 vanilla-бар ≈ rose-полоса).
  enabled false/'false' → полоса скрыта; непустой text перебивает собранный
  копирайт. blockDefaults bottomStrip не несёт → дефолт-пиксель не тронут.
- **siteTitle (Header+Footer) укреплён**: пустая строка (впрыск коэрсера
  live-пути / canon default Puck) → fallback SITE_TITLE='Rose', иначе текстовый
  логотип и «Rose Theme» в копирайте гасли бы на live.
- **Subsection-теги**: Header 997 nav (меню кликабельно в outline); Footer
  100 заголовок подписки + 997 форма (field=newsletter), 996 navigationColumn,
  995 informationColumn, 994 socialColumn (правая колонка), 993 copyright
  (копирайт-полоса).
- **Игнорируемые рендером поля канона** (панель покажет, эффекта в rose нет):
  Header — menuType + submenu навигации (меню rose плоское, mega-menu/sidebar/
  dropdown носителя не имеют), actionButtons (иконки поиска/корзины/аккаунта
  зашиты в вёрстке, рендерятся всегда), logoFont (текст-лого = Comfortaa
  верстальщика), activeLinkIndicator (подчёркивание активной ссылки уже в
  вёрстке), variant 'two-tier', promoBar (полоса = отдельный блок PromoBanner);
  Footer — variant ('3-col' зашит вёрсткой), heading/text (отдельный заголовок
  футера — носителя нет), copyrightColorScheme (legacy). colorScheme обоих
  блоков потребляется снаружи обёрткой `.color-scheme-N` композера (как T11).
- Пробы T12: logo-img 2 места (desktop+mobile), дефолт без logo-img; sticky
  1/0; newsletter скрытие 0/1 (grep по 'подпис' — паттерн задачи 'подписк' не
  матчит «Подпишитесь»/«Подписаться» — суть пробы сохранена); copyright
  '©TEST' строкой ✓ и canon-объект ✓; колонки/соцсети/полоса/padding ✓.
- Гейты T12: plain 6×OK identical; tokens — contacts/catalog/cart/product OK
  identical, home/checkout = два известных исключения (см. журнал T9-фиксов).

## Журнал T13 (Collections + PopularProducts + Gallery — полная канон-схема)

Принцип T11/T12: новые канон-пропсы дают эффект только при значениях ≠ канон-дефолта;
дефолтные ветки тернарников = прежние строки байт-в-байт (пруф: render-probe diff
bare-рендера до/после — identical для всех трёх секций; blockDefaults-рендер == bare
байт-в-байт). Канон-дефолты конструктора (их пишет defaultPagesData в свежие блоки) →
пиксель верстальщика (прецедент T11 'center'): Collections headingSize medium /
subtitleSize small / columns 3 / imageView square; PopularProducts headingSize small /
textSize small / columns 4 / cards… (см. ниже) / imageView square / quickAddMode none;
Gallery headingSize medium / textSize medium / imagePosition left.

- **Размеры заголовка/текста** (все три секции): NtSectionHeading фиксирует
  h2 20px / p 16px и не пробрасывает class — перекрытие утилитами-вариантами
  на обёртке (`[&_h2]:!text-[…]` / `[&_p]:!text-[…]`, паттерн T11 PromoBanner
  min-h). Шкала ≈0.85×/1.2× с округлением до px: h2 17/20/24 (Popular small=20
  → medium 24 / large 29 — канонный ряд small 20 / medium 24); p 14/16/19/23.
  Gallery h2 — носитель clamp(14px,3.8vw,20px) (`<style>`): варианты масштабируют
  clamp (small clamp(12,3.2vw,17), large clamp(17,4.6vw,24)) — манера сохранена.
  Layered !important утилит перебивает unlayered !important `<style>`-фиксов
  (инверсия каскадных слоёв для important) — мобильные Figma-375 фиксы остаются
  только в дефолт-ветке.
- **Collections titleAlignment**: left/right → justify-start/end обёртки +
  `[&_[data-nt=section-heading]]:items-start/end` + `[&_h2]/[&_p]:!text-left/right`;
  'center' (canon-default) /отсутствие = строка верстальщика байт-в-байт.
- **columns → inline-var**: `--cols` на гриде + `lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]`
  ТОЛЬКО при заданном значении ≠ канон-дефолта (Collections 3 = md:grid-cols-3
  верстальщика; Popular 4 = xl:grid-cols-4 верстальщика, его же впрыскивает коэрсер
  при отсутствии). Мобильная лестница верстальщика (1→3 / 2→3) сохраняется, проп
  действует с lg; у Popular в override-ветке xl:grid-cols-4 заменён на var-классы
  lg+xl. Следствие для live: legacy cart-seed Collections (columns=4, padding 80/80)
  получает 4-колоночный lg-грид и отступы 80 вместо лестницы — канон-семантика
  явных мерчант-данных (seed мигрируется в PopularProducts ревизия-миграцией).
- **imageView**: канон-дефолт 'square' → пиксель верстальщика (прецедент T11:
  canon-default value = дефолт-ветка), т.е. «квадрат» НЕ квадратит карточки —
  иначе каждый свежий блок ломал бы пиксель (Collections: поле к тому же hidden
  в панели). Collections: portrait == литерал верстальщика 430/500 → дефолт-ветка,
  wide → `[&_li>a>div]:aspect-[16/9]`. Popular: square/отсутствие = литерал
  318/444 байт-в-байт, portrait → `[&_li>article>a]:aspect-[430/500]`, wide и
  legacy-алиас adaptive → aspect-[16/9]. Селектор бьёт только медиа-якорь
  (прямой ребёнок article), имя-ссылку не задевает; работает и для
  гидрированных карточек (renderCardHtml имеет ту же структуру li>article>a).
- **Collections collections[] (≤10)**: карточки из пропса при непустом массиве —
  разметка RoseCollectionCard дословно, но плоский `<img>` (прецедент гидрации:
  webp-конвейер не для MinIO-URL) + surface-плитка без картинки (канон-плейсхолдер);
  href = `cardLinkBase + collectionId` (зеркало canon card-href.ts, '#' без
  collectionId, дефолт /catalog?collection=); подпись = item.heading || 'Коллекция';
  `max-sm:!text-[12px]` на h3 (мобильный фикс RoseCollectionCard scoped и не
  достаёт до пропс-веток). Item subsection-теги 0..N (field=collections).
  ОГРАНИЧЕНИЕ (эскалация плану): резолва collectionId→имя/картинка реальной
  коллекции у rose-сборки нет (нет collections.json на live и siteId у секции) —
  рендерятся сохранённые поля item (свежий блок = 3 плитки «Коллекция 1..3», как
  канон-плейсхолдеры theme-base Figma 1:33070). dataSource игнорируется (канон
  Collections.astro его тоже не читает — manual = непустой массив).
- **PopularProducts cards (2-24)**: лимит среза demo-витрины (slice до 8 demo) и
  лимит гидрации. 4 = срез верстальщика и впрыск коэрсера при отсутствии →
  дефолт-ветка без data-атрибута; иное → `data-cards` на гриде, гидрация читает
  (дефолт 4). Канон-дефолт конструктора cards=6 → свежий блок покажет 6 карточек —
  так панель и обещает (слайдер «Карточки» 6).
- **PopularProducts quickAddMode** standard/cart (+legacy count→cart): кнопка на
  карточке В ПОТОКЕ под ценой (позиция канона theme-base), появляется при hover
  в манере rose (opacity-0 → group-hover/focus-visible:opacity-100, место
  зарезервировано — без скачка раскладки; на тач — первый тап). Клик → механика
  rose:cart БЕЗ нового кода: initCartUI (nt-cart-rose.ts) уже держит глобальный
  делегат `[data-add-to-cart]` → addToCart + rose:cart:open (drawer). Демо-ветка —
  данные carte из catalogProducts; гидрированная — postprocess в скрипте Popular
  (data-qa-text/-qa-class с грида). РЕШЕНИЕ: товары с вариантами
  (hasVariants/variantCombinations>1) из карточки в корзину НЕ добавляются —
  кнопка тем же стилем ведёт на PDP (/product?id=…). quickAddText: канон-цепочка
  (prop → cart:'В КОРЗИНУ' / standard:'В корзину').
- **PopularProducts buttonStyle** link/primary/secondary — носитель в rose
  появляется только вместе с quickAdd-кнопкой: primary/отсутствие = кнопка-1,
  secondary = кнопка-2 (манерный образец «Добавить в корзину» PDP, T11),
  link = текстовая ссылка с подчёркиванием. Без quickAddMode — эффекта нет
  (как канон: theme-base minimal-карточка buttonStyle тоже не потребляет).
- **PopularProducts nextPhotoOnHover** (true/'true'): `data-next-photo` на гриде +
  `data-image-2` на li (демо — gallery[1] верстальщика; реальные товары —
  images[1], ставит гидрация) + is:inline скрипт через set:html (без define:vars —
  компилятор секций не умеет; паттерн T12 sticky), идемпотентность
  data-np-hydrated; свопит src `<img>` И srcset `<source>` (демо-карточки в
  `<picture>`); без data-image-2 — no-op без ошибок. Пруф E2E: hover → вторая
  картинка, mouseout → исходная.
- **PopularProducts viewAll** {show,text,href} (+legacy true/'true'): кнопка под
  гридом, манера = вторичная кнопка (классы secondaryButton Hero T11); дефолты
  канона 'Смотреть ещё' / '/catalog' (текст задачи «Смотреть все» уступил канону
  theme-base viewAllText). Subsection-тег 102 (field=viewAll). Поле hidden в
  панели — наследие legacy-ревизий.
- **PopularProducts collection** (collectionPicker) — ИГНОРИРУЕТСЯ рендером:
  фильтрация по коллекции требует collections.json (как в каноне), которого на
  rose-live нет. Эскалация плану вместе с Collections-резолвом.
- **Гидрация Popular переписана поверх (storefront-hydrate не тронут)**: вместо
  hydrateGrid(селектор, 4) — пер-гридовый цикл (несколько PopularProducts-блоков
  на странице = у каждого свой data-cards/quick-add/next-photo), дефолт без
  атрибутов = ровно прежнее поведение (4 карточки renderCardHtml). Пруф E2E:
  демо «Сумка»×4 → реальные товары по лимиту, кнопка добавляет строку в
  rose:cart:v1 localStorage, вариантный товар — ссылка на PDP.
- **Gallery items[] (≤3)**: плитки из пропсов с fallback на три плитки
  верстальщика ДОСЛОВНО; слот 0 = большая плитка (image: url/alt мерчанта,
  иначе surface), слоты 1..2 = правая колонка (kind product/image → разметка
  «Сумка»-плитки: media 429/444 + подпись/цена; kind collection → разметка
  FUTURISM-плитки 429/309 + подпись). product/collection БЕЗ storefront-данных →
  канон-плейсхолдеры (label «Товар» + 2 500 ₽ → /product?id=…; «Выбери
  коллекцию» → /catalog?collection=…) — зеркало isPlaceholder-веток канона;
  ссылки в манере rose (/catalog?collection=, НЕ канонный /catalog/slug).
  Item subsection-теги 0..N (field=items). Один item → правая колонка не
  рендерится (грид-шаблон держит большую плитку слева).
- **Gallery imagePosition** right → зеркало lg-раскладки: swap grid-template
  (minmax(280px,429px)_minmax(0,1fr)) + lg:order-2/order-1 на плитке/колонке;
  'left' (canon-default)/отсутствие = верстальщик байт-в-байт.
- **padding {top,bottom}** (все три) — inline-стиль на корне секции ТОЛЬКО при
  пропе (паттерн T11; pt/pb-лестница верстальщика уступает inline). Live-следствия:
  cart-seed Popular (80/80) и product-seed «Похожие товары» (60/60) получают
  канонные отступы вместо лестницы — явные мерчант-данные.
- **Игнорируемые рендером поля канона** (панель покажет/данные сохранятся,
  эффекта в rose нет): Collections — dataSource, cardCaptionStyle, gridAspect,
  variant (rose-вёрстка одна), description у item (в карточке rose нет подписи-2);
  PopularProducts — collection (см. выше), productCard.* (legacy-двойники читаются
  через канонные poля), containerColorScheme, swatchOverlay, cardCaptionStyle,
  cardVariant ('rich' — flux), subtitle-legacy потреблён с Фазы 2; Gallery —
  layout (rose = featured-раскладка верстальщика), headingAlignment, subheading.
  colorScheme всех трёх потребляется снаружи обёрткой `.color-scheme-N`
  композера/превью (как T11/T12).
- **Известное следствие коэрсера** (вне мандата T13, src/themes/page-blocks.ts):
  coercePopularProductsProps разворачивает heading {text,size} в строку — legacy
  heading.size из ревизий (page-product seed 'medium') на live-пути теряется до
  рендера; канонный top-level headingSize проходит. Также коэрсер впрыскивает
  heading='Популярные товары'/subtitle='' при отсутствии — на текущих данных
  не стреляет (home = статичный блоб без пропсов; все composed-инстансы несут
  heading), но blockDefaults-тексты Popular на live перебьёт. Эскалация плану.
- Пробы T13: каждая новая канон-ветка — grep эффекта при заданном пропе + diff
  отсутствия при незаданном/канон-дефолте (Collections: headingSize/subtitleSize/
  titleAlignment/columns/imageView/collections[]/cardLinkBase/padding/dataSource-игнор;
  Popular: cards/columns/headingSize(+legacy heading.size)/textSize/imageView/
  quickAddMode(standard/cart/count/none)/buttonStyle(secondary/link/без-quickAdd)/
  nextPhotoOnHover(bool+string)/viewAll(object/legacy-true/false)/padding/collection-игнор;
  Gallery: headingSize/textSize/imagePosition/items[3 типа]/padding); фактические
  live-shapes из БД (page-product Popular, page-cart legacy Collections) — рендер
  корректен. Свежий канон-блок (полные defaults конструктора) Collections = 3
  плейсхолдер-плитки + padding 80; Popular = 6 demo-карточек, грид дефолтный,
  без кнопок.
- Гейты T13: plain — contacts/checkout/catalog/cart/product 5×OK identical;
  home — расхождение ТОЛЬКО в кадре fade-анимации ниже вьюпорта (полоса 47px
  заголовка Gallery на ~1-2% opacity, max дельта 15/255): харнесс .tmp-snap-rose.mjs
  снимает fullPage сразу после простановки .is-visible, fadeInUp (0.65s) ещё идёт,
  а его addStyleTag с animation:none теряется при goto; фаза кадра сдвинулась от
  +1.5KB CSS в бандле. Пруфы эквивалентности: (1) собранный home HTML
  байт-идентичен HEAD-сборке (после хэш-нормализации ассетов), (2) computed
  геометрия/шрифты h2/p идентичны, (3) settled-снимки (анимации завершены,
  full opacity) HEAD-сборки и T13-сборки байт-идентичны. Эталоны и харнесс НЕ
  тронуты (мандат); системный фикс гейта (дожидаться конца анимации + пересъёмка
  эталонов @HEAD, прецедент T9) — эскалация плану. Tokens —
  contacts/catalog/cart/product 4×OK identical, home/checkout = два известных
  исключения (журнал T9-фиксов).
