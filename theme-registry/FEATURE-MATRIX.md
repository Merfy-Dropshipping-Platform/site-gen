# Flux ↔ Rose: товар / каталог / корзина / избранное / динамические страницы

Эталон поведения — **Rose**. Flux должен иметь те же фичи покупателя и те же живые настройки конструктора. Вид (шрифты, сетка верстальщиков) — не в этой таблице.

Статусы:

| метка | смысл |
|---|---|
| OK | доказано реестром или чтением кода |
| GAP | у Rose есть, у Flux нет или не доказано |
| WAVE | то же «не покрыто», что и у Rose (не долг одной темы) |
| NEXT | следующий шаг по этой строке |

Порядок хода: каталог → страница коллекции → товар → корзина → чекаут → избранное → остальные динамические.

---

## 0. Карта страниц

| страница | slug / маршрут | kind | Rose seed | Flux seed | как рендерится | статус |
|---|---|---|---|---|---|---|
| Каталог | `/catalog` (`page-catalog`) | content | да | да | Catalog-блок, свой шелл | OK |
| Коллекция | `/collections/:slug` (`page-collection`) | content | да (старый shape) | да (`{{COLLECTION_NAME}}`) | тот же Catalog + inject `collectionSlug` | NEXT |
| Товар | `/product`, `/product/:id` (`page-product`) | verbatim → unified | да | да | `PRODUCT_UNIFIED` (rose+flux) | OK оболочка |
| Корзина | `/cart` (`page-cart`) | verbatim → unified | да (Body+Summary+Totals+Btn) | да (те же блоки) | `CART_UNIFIED` (rose+flux) | OK оболочка |
| Чекаут | `/checkout` (`page-checkout`) | verbatim | да | да | **blob `checkout.astro`**, Puck-тело live **не едет** (у обеих тем) | GAP |
| Спасибо | `/checkout-result` | content | да | да | OrderConfirmation | NEXT |
| Избранное | `/wishlist` | страница темы, **не** в PAGE_REGISTRY | `wishlist.astro` | `wishlist.astro` | live-порт, не конструктор | GAP шапка |
| О нас / Контакты / Доставка | `/about` `/contacts` `/delivery` | content | да | да | Page/секции | WAVE |
| Кастомная | `/…` user | createPage | — | — | Header+Page+Footer | pages-gate |
| Аккаунт / login | `/account` `/login` | verbatim prefix | системные | системные | не секции магазина | вне волны |

Превью коллекции: маршрут только `collections/<slug>` (не `/c/`). Live: `generatePuckCollectionsSlugPage` подставляет slug в Catalog.

---

## 1. Каталог (`page-catalog`)

| id | фича | Rose | Flux | статус | NEXT |
|---|---|---|---|---|---|
| CAT-01 | Выбор коллекции | picker живой, набор товаров меняется | то же 15/15 | OK | — |
| CAT-02 | Заголовок / текст | aiText видны | видны | OK | — |
| CAT-03 | Тумблер подзаголовка | hide/show | hide/show | OK | — |
| CAT-04 | Карточки (page size) | 4↔8 | 4↔8 | OK | — |
| CAT-05 | Колонки сетки | плитки сужаются | плитки сужаются | OK | — |
| CAT-06 | Фильтры вкл/выкл | «Наличие» hide/show | то же | OK | — |
| CAT-07 | Вид фильтра side/top | aside ↔ строка | то же | OK | — |
| CAT-08 | Сортировка | hide/show | hide/show | OK | — |
| CAT-09 | Quick-add none/standard/cart | кнопка hide/show | то же | OK | — |
| CAT-10 | Стиль кнопки карточки | primary/secondary | то же | OK | — |
| CAT-11 | Аспект фото карточки | wide→square→portrait | то же | OK | — |
| CAT-12 | Фон карточки | плашка вкл/выкл | то же | OK | — |
| CAT-13 | Отступы / схема контейнера | padding+scheme | то же | OK | — |
| CAT-14 | Второе фото по hover | WAVE (интерактив) | WAVE | WAVE | интерактив-гейт |
| CAT-15 | Hover-зоны (`nextPhotoMode`) | не реализовано нигде | то же | WAVE | не трогать |
| CAT-16 | `newsletterEnabled` в каталоге | no-op в рендере | no-op | WAVE | не трогать |
| CAT-17 | `categorySubtitleColor: accent` | нет в сиде | в theme.json/сиде, **native Catalog не читает** (всегда muted) | GAP | применить к `<p>` подзаголовка |

Источник: `theme-registry/reports/{rose,flux}/Catalog.md`, `Catalog.puckConfig.ts`.

---

## 2. Динамическая страница коллекции

| id | фича | Rose | Flux | статус | NEXT |
|---|---|---|---|---|---|
| COL-01 | Шаблон `page-collection` в сиде | старые ключи heading/filters/sort (native их не читает) | modern + `{{COLLECTION_NAME}}`; **убрал** `collectionSlug:"preview"` — он бил preview-скоуп | OK сид | существующие ревизии с `"preview"` починить вручную |
| COL-02 | Live `/collections/:slug` скоупит товары | inject `collectionSlug={slug}` | тот же генератор | OK код | пруф на локальном flux |
| COL-03 | Превью `collections/<slug>` | `collectionSlugFromRoute` | то же | OK код | пруф |
| COL-04 | Title/description из коллекции | подстановка если пусто | то же | OK код | пруф |
| COL-05 | `/c/:slug` | маршрута нет; карточки → `/catalog?collection=` | то же | WAVE платформа | не чинить как flux-долг |
| COL-06 | `/catalog/:slug` | 301 → `/collections/:slug` | то же | OK код | — |

---

## 3. Страница товара (PDP)

| id | фича | Rose | Flux | статус | NEXT |
|---|---|---|---|---|---|
| PDP-01 | Unified Product-блок (не verbatim порт) | PRODUCT_UNIFIED → **theme-base Product** (нет в sections.map) | PRODUCT_UNIFIED → **FeaturedProduct** (`sections.map.json:6`) | GAP рендер | снять map или довести Featured |
| PDP-16 | Buy now куда ведёт | add + `/checkout` | add + `/cart` | GAP | FeaturedProduct.astro:943 |
| PDP-17 | Фото варианта при смене combo | `variantImageFor` | `applyCombo` не меняет галерею | GAP | FeaturedProduct applyCombo |
| PDP-18 | Описание товара | `showDescription: true` в сиде | theme.json `false` — скрыто | GAP | решить: канон flux или как Rose |
| PDP-19 | JSON-LD + h1 | есть | нет JSON-LD, заголовок h2 | GAP | SEO |
| PDP-20 | Клиентский резолв `/product/<slug>` | да | только productId пропа | GAP | FeaturedProduct |
| PDP-02 | Выбор товара | productPicker меняет имя/цену | то же | OK | — |
| PDP-03 | Макет gallery carousel / two-columns | высота+кадры | то же | OK | — |
| PDP-04 | Размер колонки фото | 440/552/640 | то же | OK | — |
| PDP-05 | Позиция фото left/right | 28%↔72% | то же | OK | — |
| PDP-06 | Текст / размер / title size / share | видны | видны | OK | — |
| PDP-07 | Варианты button/list + shape | чипы/select/свотчи | то же | OK | — |
| PDP-08 | Текст «В корзину» + скрытие | hide при пустой строке | то же | OK | — |
| PDP-09 | Отступы | +160 | +160 | OK | — |
| PDP-10 | Related PopularProducts под PDP | в сиде | в сиде | OK сид | данные WAVE |
| PDP-11 | Увеличение zoom click/hover | lightbox / tracking, герой = `div` не `<a href>` | click не должен уводить конструктор на PDP (nav-agent) | OK правило в puckConfig | порт темы: не оборачивать фото в `/product` |
| PDP-12 | Динамическая кнопка «Купить сейчас» | WAVE скролл | WAVE | WAVE | живой скролл |
| PDP-13 | Qty stepper + add-to-cart | ядро nt-cart | ядро nt-cart | NEXT пруф | pdp-interactive-gate |
| PDP-14 | visualConfig (галерея/chips/описание) | в rose seed | в theme.json + seed product.json (манера flux: dropdown/pill) | OK сид | существующие сайты не пересеиваются |
| PDP-15 | Сердце избранного на PDP | Rose header+карточки | карточки Flux есть | NEXT | проверить PDP-кнопку |

Источник: `Product.puckConfig.ts`, reports Product, `packages/theme-*/pages/product.json`.

---

## 4. Корзина

| id | фича | Rose | Flux | статус | NEXT |
|---|---|---|---|---|---|
| CART-01 | Страница = Puck Body+Summary+Totals+Btn | CART_UNIFIED | CART_UNIFIED | OK | — |
| CART-02 | Настройки Body: схема + отступы | 2/2 | 2/2 | OK | — |
| CART-03 | Настройки Summary: схема + отступы | 2/2 | 2/2 | OK | — |
| CART-04 | Totals / CheckoutButton | hidden «нет настроек» (Figma) | то же | OK by design | — |
| CART-05 | Drawer vs page (`--cart-type`) | Theme Settings 13/13 | 13/13 | OK | — |
| CART-06 | Quick-add → строка + бейдж + drawer | interactive-gate | скрипт есть, **сегодня не гонял** | GAP пруф | `interactive-gate --theme flux` |
| CART-07 | + / − / удалить | nt-cart | то же ядро | GAP пруф | тот же гейт |
| CART-08 | Пустое состояние | CartBody | CartBody | NEXT | визуал |
| CART-09 | Кнопка «Оформить» → /checkout | data-action=checkout | нужно пруф | GAP пруф | клик |
| CART-10 | Мёртвый `nt-cart-flux.ts` | нет | файл ещё лежит, cart.ts уже на ядре | GAP чистка | удалить после гейта |
| CART-11 | Inline-форк в flux Catalog | — | комментарии/копия makeLineId | GAP | после гейта |
| CART-12 | Два стора: drawer = nt-cart (`flux:cart:v1`), страница `/cart` = `window.cartStore` | тот же разрыв | тот же разрыв | GAP общий | мост nt-cart → cartStore на `/cart` |

---

## 5. Чекаут и «Спасибо»

| id | фича | Rose | Flux | статус | NEXT |
|---|---|---|---|---|---|
| CHK-01 | Сид CheckoutHeader/Form/Summary | да | да (без дефолтных схем) | NEXT | схемы |
| CHK-02 | Чекаут не unified: live = `checkout.astro`, Puck-блоки игнорятся | да | да | GAP общий | унификация как cart (отдельная волна) |
| CHK-06 | Legal-ссылки футера | `/legal/return` / compose `refund` | сид `/legal/returns` — **нет такого маршрута** | GAP | поправить href футера |
| CHK-03 | Мгновенная сводка setLocalItems | есть у Rose | **нет** в flux | GAP | портировать |
| CHK-04 | `/checkout-result` страница | да | да (US1) | NEXT пруф | curl/preview |
| CHK-05 | Контракт настроек Checkout* | нет в реестре | нет | GAP | контракт после корзины |

---

## 6. Избранное

| id | фича | Rose | Flux | статус | NEXT |
|---|---|---|---|---|---|
| WL-01 | Страница `/wishlist` | порт | порт (зеркало Rose) | OK код | пруф preview |
| WL-02 | Сердце на карточке товара | да | FluxProductCard `data-wishlist-toggle` | OK код | гейт |
| WL-03 | Иконка+счётчик в шапке desktop | 5 мест `data-wishlist-count` | `FluxWishlistLink` у desktop-кластеров | NEXT пруф | compile + preview |
| WL-04 | Иконка в мобильной шапке | да | ссылка рядом с корзиной | NEXT пруф | compile + preview |
| WL-05 | Theme Setting wishlistEnabled | скрывает `[data-wishlist-toggle]` и `/wishlist` | эмиттер общий, в 13/13 не входил | WAVE | волна theme v2 |
| WL-06 | Страница в конструкторе | нет в PAGE_REGISTRY | нет | WAVE | не конструкторная |

---

## Сделано 2026-08-17

- WL-03/04 — сердце+счётчик в шапке Flux (`FluxWishlistLink`).
- PDP-14 — visualConfig в seed; описание `showDescription: true`.
- PDP-16 — «Купить сейчас» → `/checkout`.
- PDP-17 — `applyCombo` меняет фото варианта.
- PDP-19 — h1 + JSON-LD (когда товар резолвится).
- PDP-20 — резолв `/product/<slug>` и `?id=` на клиенте.
- CART-10 — удалён `nt-cart-flux.ts` (импортов не было).
- CART-12 — CartBody гидратит `cartStore` из `*:cart:v1` + фоновый `syncToServer`.
- CHK-03 — flux checkout как Rose: `setLocalItems` + `syncToServer`.
- CAT-17 — `categorySubtitleColor=accent` красит подзаголовок.
- COL — preview инжектит `collectionSlug` из роута; сид без `"preview"`.
- Legal — сиды `/legal/returns` → `/legal/return`.

## Ещё не закрыто

- CHK-02 — live чекаут всё ещё `checkout.astro`, Puck-тело не composed (общий с Rose).
- CART-06/07/PDP-13 — interactive-gate сегодня не гонялся.
- CART-12 write-back: qty на `/cart` после синка идёт в сервер; дровер nt-cart не переписывается сразу.
