# BLOOM ↔ ROSE — План паритета темы

> Шаблон: `FLUX_PARITY_PLAN.md`. Кросс-темный аудит настроек: `THEMES_SETTINGS_PARITY.md`.
> Эталон = **rose**. Цель = довести **bloom** до паритета по каждой настройке секции и каждой странице.
> Local QA site: `10df1c3a-a1fc-45e0-957a-511c131b1eb8` → `http://bloom-local-account.localhost:8088`

---

## Архитектура рендера (ключ к пониманию пробелов)

| Слой | Bloom | Rose (канон) |
|------|-------|--------------|
| Поля секций | Общий `packages/theme-base/blocks/<Sec>/<Sec>.puckConfig.ts` | То же |
| Каскад | `themes/bloom/src/components/…` → `packages/theme-bloom/blocks/…` → `theme-base` | `themes/rose/…` → `packages/theme-rose/…` → `theme-base` |
| V2 compile | `themes/bloom/sections.map.json` (**17** блоков, incl. Publications, Video) | `themes/rose/sections.map.json` (**15** блоков) |
| Package overrides | **Catalog** (+ `storefront-hydrate.ts`), **Benefits** | **Catalog** (+ `storefront-hydrate.ts`) |
| Превью vs live | Header/Footer/Catalog — те же классы рисков, что flux | Канон |

---

## Сводная матрица: THEMES_SETTINGS_PARITY → Bloom

| # | Секция / настройка | Статус |
|---|-------------------|--------|
| P1.1–P1.4, P2 | MultiColumns/Video/MultiRows/Slideshow/Benefits | ✅ CLOSED |
| Publications clamp 1..4 trunc | `Publications.astro` | ✅ CLOSED (local) |

---

## Матрица blockDefaults (`theme.json`)

| Блок | Статус |
|------|--------|
| Hero, Slideshow, MainText, ImageWithText, MultiRows, MultiColumns, CollapsibleSection, Newsletter → `colorScheme` | ✅ CLOSED (local) |
| Product → `visualConfig` | ✅ CLOSED (local) |
| PromoBanner scheme-1 vs rose scheme-4 | ⚠️ BY DESIGN (bloom pink brand) |
| Footer 2-part | ✅ OK |

---

## Матрица cart / checkout / registries

| Item | Статус |
|------|--------|
| `PRODUCT_UNIFIED_THEMES`, `CART_SECTION_THEMES` | ✅ CLOSED |
| `nt-cart` → theme-base `createNtCart` | ✅ CLOSED (local) |
| `CartSection.astro` Urbanist/Inter + `--color-bg` | ✅ CLOSED |
| `checkout.astro` split-layout + instant summary | ✅ CLOSED (local) |
| `features.wishlist: true` | ✅ CLOSED (local) |
| Composable `page-cart` seed (`CartSection`) | ✅ CLOSED (local) |
| Footer nav: pages[] sync + delivery fallback | ✅ CLOSED (local) |

---

## Section ports

| Item | Статус |
|------|--------|
| `NavItem.astro` + Header submenu | ✅ CLOSED |
| `data-nav-inline` на всех desktop `<nav>` | ✅ CLOSED |
| Orphan Philosophy/Puk/Benefits ports | ✅ REMOVED (→ MainText/MultiColumns) |
| `storefront-hydrate.ts` в package Catalog | ✅ CLOSED |

---

## ФАЗА 0 — Критичные прод-баги

| # | Баг | Статус |
|---|-----|--------|
| 0.1 | Newsletter subscribe fetch | ✅ CLOSED |
| 0.2 | Checkout split-layout | ✅ CLOSED |
| 0.3 | checkout-result 404 | ✅ CLOSED |

## ФАЗА 1 — Настройки / функционал

| # | Баг | Статус |
|---|-----|--------|
| 1.1 | Header submenu | ✅ CLOSED |
| 1.2 | Publications clamp trunc 1..4 | ✅ CLOSED |
| 1.3 | wishlist feature flag | ✅ CLOSED |
| 1.4 | Product visualConfig | ✅ CLOSED |
| 1.5 | ContactForm submit script | ✅ CLOSED |

## ФАЗА 2 — Визуальные доводки

| # | Баг | Статус |
|---|-----|--------|
| 2.1 | Cart typography | ✅ CLOSED |
| 2.2 | ContactForm fonts Inter | ✅ CLOSED |
| 2.3 | Newsletter hex → tokens | ✅ CLOSED |
| 2.4 | CartSection bg token | ✅ CLOSED |

## ФАЗА 3 — blockDefaults colorScheme

| # | Задача | Статус |
|---|--------|--------|
| 3.1 | scheme-* на Hero/Slideshow/MainText/… | ✅ CLOSED |
| 3.2 | PromoBanner scheme | ⚠️ BY DESIGN |

## ФАЗА 4 — UX / preview / perf

| # | Задача | Статус |
|---|--------|--------|
| 4.1 | Checkout instant summary | ✅ CLOSED |
| 4.2 | Header `data-nav-inline` | ✅ CLOSED |
| 4.3 | Catalog `storefront-hydrate.ts` | ✅ CLOSED |

## ФАЗА 5 — Тех-долг

| # | Задача | Статус |
|---|--------|--------|
| 5.1 | nt-cart → theme-base | ✅ CLOSED |
| 5.2 | Удалить orphan Philosophy/Puk/Benefits | ✅ CLOSED |
| 5.3 | Visual/conformance tests | ⚠️ PARTIAL (contract updated) |
| 5.4 | Benefits в home.json | ✅ CLOSED (`MultiColumns` в `pages/home.json`) |

---

## Верификация (локально)

Constructor: `http://localhost:3200/?siteId=10df1c3a-a1fc-45e0-957a-511c131b1eb8&page=home`

- Newsletter submit → network tab `/storefront/newsletter/subscribe`
- Checkout → мгновенная сводка без поштучного addItem
- Header submenu 3 lvl + preview без nav-мерцания
- `/cart` — Urbanist/Inter
- Publications columns/cards clamp 1..4

**Прогресс:** ~50/51 закрыто.

## ФАЗА 9 — Platform preview parity (2026-08-29)

| # | Задача | Статус |
|---|--------|--------|
| 9.1 | F-053: cart-drawer globals на built-theme preview path | ✅ CLOSED (local) |
| 9.2 | `StorefrontRuntime.astro` в release contract runtimeSources | ✅ CLOSED (local) |

**Открыто:** PromoBanner scheme (by design), полный E2E на проде.

## ФАЗА 10 — Cart / footer / pages 100% (2026-08-30)

| # | Задача | Статус |
|---|--------|--------|
| 10.1 | `pages/cart.json` → `CartSection` (parity rose seed) | ✅ CLOSED (local) |
| 10.2 | Footer fallback + home seed: `/delivery` в navigationColumn | ✅ CLOSED (local) |
| 10.3 | `applyFooterData`: merge `pages[]` → `navigationColumn.links` | ✅ CLOSED (local) |

**Прогресс:** 51/51 — plan закрыт (кроме by-design PromoBanner и prod E2E).

## ФАЗА 7 — Rose-level wiring (2026-08-29)

| # | Задача | Статус |
|---|--------|--------|
| 7.1 | StorefrontRuntime.astro + Layout/BlogPost | ✅ CLOSED (local) |
| 7.2 | Layout: checkout VT guard + account `promo={false}` | ✅ CLOSED (local) |
| 7.3 | Collections: `collections[].collectionId` + `titleAlignment` | ✅ CLOSED (local) |
| 7.4 | `inlineFormat` rich-text (Hero/MainText/Multi*/ImageWithText/Collapsible) | ✅ CLOSED (local) |
| 7.5 | Header `/logo.svg` guard | ✅ CLOSED (local) |
| 7.6 | PopularProducts `headingAlignment` + `cardCaptionStyle` | ✅ CLOSED (local) |
| 7.7 | Footer `paymentEnabled` badges | ✅ CLOSED (local) |

**Открыто:** PromoBanner scheme (by design), platform preview≠live Footer (если ещё актуально), полный E2E на проде.

## ФАЗА 8 — Section polish (2026-08-29)

| # | Задача | Статус |
|---|--------|--------|
| 8.1 | Slideshow: `pagination: numbers` ← 1 2 3 → (rose layout) | ✅ CLOSED (local) |
| 8.2 | Slideshow: prompt card + photo text/scrim | ✅ CLOSED (local) |
| 8.3 | Hero: adaptive padding clamp + center vPad + equal-width buttons | ✅ CLOSED (local) |
| 8.4 | Gallery: `headingAlignment` | ✅ CLOSED (local) |
| 8.5 | Catalog package: `gridAspect` + `cardCaptionStyle` | ✅ CLOSED (local) |

**Прогресс:** ~50/51 закрыто.

## ФАЗА 9 — Platform preview parity (2026-08-29)

| # | Задача | Статус |
|---|--------|--------|
| 9.1 | F-053: cart-drawer globals на built-theme preview path | ✅ CLOSED (local) |
| 9.2 | `StorefrontRuntime.astro` в release contract runtimeSources | ✅ CLOSED (local) |

**Открыто:** PromoBanner scheme (by design), полный E2E на проде.

## ФАЗА 10 — Cart / footer / pages 100% (2026-08-30)

| # | Задача | Статус |
|---|--------|--------|
| 10.1 | `pages/cart.json` → `CartSection` (parity rose seed) | ✅ CLOSED (local) |
| 10.2 | Footer fallback + home seed: `/delivery` в navigationColumn | ✅ CLOSED (local) |
| 10.3 | `applyFooterData`: merge `pages[]` → `navigationColumn.links` | ✅ CLOSED (local) |

**Прогресс:** 51/51 — plan закрыт (кроме by-design PromoBanner и prod E2E).
