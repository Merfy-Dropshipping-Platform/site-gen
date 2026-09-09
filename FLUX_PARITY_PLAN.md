# FLUX ↔ ROSE — План паритета темы

> Составлен по исчерпывающему аудиту 2026-06-26 (7 параллельных проходов: все секции поле-за-полем + git за 2 недели + все страницы).
> Эталон = **rose**. Цель = довести **flux** до паритета по каждой настройке секции и каждой странице.
> Live для проверки: **QA Flux** `8df3b745-94e4-4d91-89d2-1f7004f6f2a5` → https://u9fpo33bkmsd.merfy.ru

---

## Архитектура рендера (ключ к пониманию пробелов)

- Поля секций заданы в **общем** `packages/theme-base/blocks/<Sec>/<Sec>.puckConfig.ts` → набор полей у rose и flux ОДИНАКОВ.
- Каскад рендера: `themes/<t>/src/components/sections/<Sec>.astro` (порт) → `packages/theme-<t>/blocks/<Sec>` (override) → `packages/theme-base/blocks/<Sec>` (общий).
- flux override-блоки: только **Catalog** и **Header**. Порты секций: `themes/flux/src/components/`.
- **Превью (конструктор) и Live используют РАЗНЫЕ рендереры** для ряда блоков (Header/Footer: превью=порт, live=theme-base) → главный источник «preview ≠ live».
- Пробелы возникают: (а) порт flux не читает поле, что rose читает; (б) `blockDefaults` в `theme.json`; (в) превью≠live; (г) flux-порт беднее theme-base (Video/Publications).

## Уже на паритете — НЕ трогать (проверено)
Catalog (7 настроек + колонки + dropdowns), Product PDP (8 полей сайдбара + visualConfig, flux в PRODUCT_UNIFIED_THEMES), Page (100%), Collections/CollapsibleSection поля, токены/`--container-max-width:1320`, плейсхолдеры всех секций, системные страницы (login/register/verify/account/wishlist — diff 0), wishlist/профили/passwordless/единый PDP (раскатаны), buy-now на PDP, service-level (preview/build/page-registry/tokens — общие для всех тем).

---

## ФАЗА 0 — Критичные прод-баги (ломают функционал, видит покупатель)

| # | Баг | Файлы | Сложность |
|---|-----|-------|-----------|
| 0.1 | ~~**`/checkout-result` = 404**~~ ✅ `packages/theme-flux/pages/checkout-result.json` + page в theme.json | — | low |
| 0.2 | ~~**Newsletter теряет подписки**~~ ✅ `fetch /storefront/newsletter/subscribe` в Newsletter.astro | — | medium |
| 0.3 | ~~**Cart двойной клик**~~ ✅ cart.astro — шелл; логика в CartSection, без дубля inc/dec | — | low |
| 0.4 | ~~**Cart «−» при qty=1**~~ ✅ `Math.max(1, quantity)` в nt-cart-flux.ts | — | low |
| 0.5 | ~~**Video не обновляется без ребилда**~~ ✅ inline hydrator + `siteId` + `data-media-target`/`data-media-video` | `themes/flux/src/components/sections/Video.astro` | high |
| 0.6 | ~~**Video YouTube/Vimeo**~~ ✅ `parseVideo()` → `<iframe>` embed | `Video.astro` | medium |

## ФАЗА 1 — Настройки конструктора не работают (мёртвые поля / превью ≠ live)

| # | Баг | Файлы | Сложность |
|---|-----|-------|-----------|
| 1.1 | ~~**PopularProducts `cardVariant:"rich"`**~~ ✅ swatches + salePercent + memory chips (SSR + renderCardHtml) | `Popular.astro`, `storefront-hydrate.ts` | high |
| 1.2 | ~~**PopularProducts `containerEnabled`**~~ N/A — поле `type:'hidden'` (нет контейнера у коллекций) | — | — |
| 1.3 | ~~**PopularProducts `containerColorScheme`**~~ N/A — поле `type:'hidden'` | — | — |
| 1.4 | ~~**Collections `variant:"tile"`**~~ ✅ `isTile` + font-light/left-align | `Collections.astro` | medium |
| 1.5 | ~~**Slideshow позиция слайда**~~ ✅ `slideLayoutCls()` 9-grid top/middle/bottom | `Slideshow.astro` | medium |
| 1.6 | ~~**Hero вторая кнопка**~~ ✅ рендер только при `secondaryText` | `Hero.astro` | medium |
| 1.7 | ~~**MainText textSize body**~~ ✅ Manrope/roboto-flex font-light лестница | `MainText.astro` | medium |
| 1.8 | ~~**MainText `position`**~~ ✅ alignCls из position | `MainText.astro` | medium |
| 1.9 | ~~**Header `promoBar` не виден в превью**~~ ✅ `promoBar.enabled` + `NtPromoBanner` | `themes/flux/src/components/Header.astro` | medium |
| 1.10 | ~~**Header submenu обрезается в превью**~~ ✅ `NavItem.astro` рекурсия + drawer 3 lvl | `Header.astro` + `NavItem.astro` | medium |
| 1.11 | ~~**Video `subheading`**~~ ✅ `<p>` subheading с textSize | `Video.astro` | low |
| 1.12 | ~~**Newsletter `formLayout`**~~ ✅ stacked + inline-submit ветки | `Newsletter.astro` | low |

## ФАЗА 2 — Визуальные доводки секций

| # | Баг | Файлы | Сложность |
|---|-----|-------|-----------|
| 2.1 | ~~**MultiRows per-row heading**~~ ✅ `set:html` | `MultiRows.astro` | trivial |
| 2.2 | ~~**MultiColumns containerColorScheme**~~ ✅ per-column surface + scheme | `MultiColumns.astro` | trivial |
| 2.6 | ~~**MainText max-w-[780px]**~~ ✅ в textCls | `MainText.astro` | low |
| 2.3 | ~~**ImageWithText lg:items-center**~~ ✅ на grid | `ImageWithText.astro:175` | trivial |
| 2.4 | ~~**Slideshow boxed текст**~~ ✅ `[&_h2]:!text-… [&_p]:!text-…` | `Slideshow.astro:254` | trivial |
| 2.5 | ~~**Gallery small size**~~ ✅ headingSize/textSize ветки | `Gallery.astro:34-45` | trivial |
| 2.7 | ~~**Catalog demo 404**~~ ✅ `/images/4x/Товар_N.png` | `Catalog.astro` | trivial |
| 2.8 | ~~**Catalog `categorySubtitleColor:"accent"`**~~ ✅ `subtitleColorCls` → accent/muted на `<p>` | `packages/theme-flux/blocks/Catalog/Catalog.astro` | low |

## ФАЗА 3 — blockDefaults colorScheme ✅ (2026-08-28)
Hero, Slideshow, MultiRows, MultiColumns, ImageWithText, MainText, CollapsibleSection, Newsletter, PromoBanner, Video — `scheme-1` в `packages/theme-flux/theme.json`.

## ФАЗА 4 — UX / перф / превью
| # | Задача | Файлы | Сложность |
|---|--------|-------|-----------|
| 4.1 | ~~**«Добавлено ✓» фидбек**~~ ✅ в nt-cart-flux.ts initCartUI | — | low |
| 4.2 | ~~**Checkout мгновенная сводка**~~ ✅ rose cart-store + setLocalItemsReconciled + checkout.astro | `public/scripts/cart-store.js`, `checkout.astro` | medium |
| 4.3 | ~~**Nav-мерцание в превью**~~ ✅ `data-nav-inline` + `data-nav-drawer` | `Header.astro` | medium |

## ФАЗА 5 — Тех-долг
| # | Задача | Сложность |
|---|--------|-----------|
| 5.1 | ~~**Миграция nt-cart**~~ ✅ `cart.ts` → theme-base `createNtCart` + flux `renderDrawerItem`; `nt-cart-flux.ts` удалён | `themes/flux/src/lib/cart.ts` | medium |
| 5.2 | ~~**Header puckConfig submenu**~~ ✅ recursive `z.lazy` NavLink, optional href | `theme-flux/blocks/Header/Header.puckConfig.ts` | low |

---

## ОБЩИЕ баги (сломаны и rose, и flux — НЕ flux-долг; решить с владельцем отдельно)
Архитектура «порт vs theme-base» в превью: `colorScheme` не на `<section>` (Header/Footer/Collections/PopularProducts порты), `actionButtons` всегда 3 иконки (Header порты), Footer `variant`/`heading.text`/`text.content` не читаются портами, Catalog `nextPhotoMode=zones` не реализован нигде, Publications `showDateTime` баг в theme-base (`Publications.astro:66`), ContactForm `headingSize` не применяется, rose `Contacts.astro` без submit-`<script>` (форма на кастомных страницах не шлёт). Эти проявляются и у rose → выходят за рамки «догнать rose», но стоит знать.

---

## 🔁 Доп. баги из ПОЛНОГО git-прохода (825 коммитов апр–июнь, 7 диапазонов)

Исчерпывающий проход по ВСЕЙ истории тем (не только 2 недели). Большинство коммитов покрыты (наследуются из theme-base / rose-specific / уже раскатаны «на 5 тем»). НОВЫЕ реальные пробелы flux, которых не было в первичном аудите:

| # | Баг | Файл | Сложность | Коммит-эталон |
|---|-----|------|-----------|---------------|
| N1 | ~~**Логотип сдвинут ~15px**~~ ✅ `md:translate-x-0` (не transform-none) | `Header.classes.ts:16` | trivial |
| N2 | ~~**logoPosition «По центру»**~~ ✅ `center-absolute` в logoWrap | `Header.classes.ts:20` | trivial |
| N3 | ~~**Битый img без фото**~~ ✅ CARD_MEDIA_FALLBACK + onerror в Catalog; placeholder в FluxProductCard | `FluxProductCard.astro`, `Catalog.astro` | medium |
| N5 | ~~**Catalog клик по карточке**~~ ✅ `data-product-href` + делегат клика (кроме кнопок) | `Catalog.astro`, `FluxProductCard.astro` | medium |

**Подтверждено полным проходом (уже в плане выше):** MultiRows set:html (`6c636fc3`→2.1), nav-маркеры (`985582ca`→4.3), PopularProducts containerEnabled (`f3e46809`→1.2).
**Подтверждено ЗАКРЫТО US1 (`8bc48b99`):** checkout-result (`26cd7118`), cart дубль (`39b5a239`), newsletter (`cf1aba7d`).
**Требует проверки (противоречие аудитов):** flux `/product` — live идёт через theme-base Product (PRODUCT_UNIFIED_THEMES) или verbatim `FluxProductDetail`? `831abb1f`/`0837c6e7` (`__MERFY_PRODUCT_SECTION__`) применимы только если FluxProductDetail жив на live — верифицировать перед правкой.

## Верификация (продакшн-режим, пруфы)
Деплой sites → Coolify → rebuild QA Flux (super_admin `admin/rebuild`/`bulk-rebuild {themeId:flux}`) → проверка на https://u9fpo33bkmsd.merfy.ru:
- 0.1 checkout-result: прямой URL 200 + после оплаты.
- 0.2 newsletter: submit email → fetch 200 + SQL-пруф подписчика.
- 0.3/0.4 cart: «+»=+1, «−» при 1 не удаляет.
- секции: в превью конструктора + на live (нужны настроенные секции).

## Порядок и деплои
Ф0 (критичные) — первым деплоем + пруфы. Затем Ф1→Ф2→Ф3→Ф4 батчами. Ф5 (nt-cart) — изолированным деплоем последним (поглощает 0.3/0.4/4.1). blockDefaults (Ф3) — после уточнения значений схем flux.

> ⚠️ Номера строк — из аудита (scout-агенты); перед каждой правкой верифицировать чтением файла (правило claim-verification). checkout-result + blockDefaults касаются также bloom/satin/vanilla — можно закрыть тем же паттерном отдельным заходом.
